"""
Keyless HTTP client for the Stacks data sources (Hiro node, ALEX, Velar).

Built on stdlib ``urllib.request`` — not ``requests`` — so the ``_opener`` seam
(``self._opener = urllib.request.urlopen``) makes tests hermetic without monkeypatching
urllib, matching the one mechanism this repo already uses (there is no ``responses`` /
``respx`` in the tree). The mechanisms are lifted from ``ictbot.data.cmc_client``:
``_TokenBucket``, ``_backoff``, the retry set ``{429,500,502,503,504}`` honoring
``Retry-After``, and the injectable ``_clock``. Two deliberate divergences: this client
is **keyless** (Hiro/ALEX/Velar need no key — the CMC key gate would make every call
return nothing) and carries **no credit ledger**.

Unlike ``CMC.get()`` (which never raises and silently degrades to cache), the JSON
helpers **raise** ``HttpError`` on definitive failure after retries and stale-cache
fallback. A harvester must not emit a partial dataset as if complete — the venue layer
catches per pool and records the gap as a liveness/error flag, which is honest; a
silent ``None`` is not.

Two-tier TTL (from ``ictbot.data.forex_factory``):
  * ``cache_ttl`` — younger than this ⇒ serve cache, no network.
  * ``stale_ttl`` — older, but network fails ⇒ serve stale cache rather than raise.
Immutable data (SIP-010 decimals) uses a long ``cache_ttl``; slow-changing registries a
short one; hot quote ladders none.
"""

from __future__ import annotations

import hashlib
import json
import os
import random
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable
from pathlib import Path
from typing import Any


class HttpError(Exception):
    """A request failed definitively (non-retryable status, or retries exhausted)."""

    def __init__(self, message: str, *, status: int | None = None, url: str | None = None):
        super().__init__(message)
        self.status = status
        self.url = url


class _RateLimitStall(Exception):
    """Waiting for a rate-limit token would exceed the bounded budget."""


class _TokenBucket:
    """Thread-safe token bucket (lifted from cmc_client). ``acquire`` is bounded — past
    ``max_wait_s`` it raises ``_RateLimitStall`` rather than blocking a request path."""

    def __init__(
        self, rpm: float, *, burst: float | None = None, clock: Callable[[], float] = time.monotonic
    ):
        # capacity = burst so we never fire a huge initial burst (which triggers a 429 storm on
        # Hiro's keyless tier); tokens then refill at the sustained rpm.
        self.capacity = float(max(1.0, burst if burst is not None else rpm))
        self.refill_per_s = max(1.0, rpm) / 60.0
        self.tokens = self.capacity
        self._clock = clock
        self.updated = clock()
        self._lock = threading.Lock()

    def acquire(self, max_wait_s: float) -> float:
        deadline = self._clock() + max(0.0, max_wait_s)
        waited = 0.0
        while True:
            with self._lock:
                now = self._clock()
                self.tokens = min(
                    self.capacity, self.tokens + (now - self.updated) * self.refill_per_s
                )
                self.updated = now
                if self.tokens >= 1.0:
                    self.tokens -= 1.0
                    return waited
                need = (1.0 - self.tokens) / self.refill_per_s
            if self._clock() + need > deadline:
                raise _RateLimitStall(need)
            sleep_for = min(need, max(0.0, deadline - self._clock()))
            if sleep_for <= 0:
                raise _RateLimitStall(need)
            time.sleep(sleep_for)
            waited += sleep_for


_RETRYABLE_STATUS = {429, 500, 502, 503, 504}


class HttpClient:
    """One instance per host (``hiro`` / ``alex`` / ``velar``) — each with its own bucket,
    so a slow venue can't starve the others' rate budget."""

    def __init__(
        self,
        base: str = "",
        *,
        rpm: float = 60.0,
        burst: float | None = None,
        timeout: float = 30.0,
        max_retries: int = 5,
        max_wait_s: float = 20.0,
        cache_dir: Path | None = None,
        extra_headers: dict | None = None,
        user_agent: str = "stacks-depth/0.1 (+https://github.com/; honest DeFi instrumentation)",
    ):
        self.base = base.rstrip("/")
        self.rpm = float(rpm)
        self.timeout = float(timeout)
        self.max_retries = int(max_retries)
        self.max_wait_s = float(max_wait_s)
        self.user_agent = user_agent
        self.extra_headers = dict(extra_headers or {})  # e.g. a Hiro API key header
        self._cache_dir = cache_dir
        # Seams for hermetic tests (mirrors cmc_client): swap the opener to stub the
        # network; swap the clock to drive TTL rollover deterministically.
        self._opener: Callable = urllib.request.urlopen
        self._clock: Callable[[], float] = time.time
        self._bucket = _TokenBucket(self.rpm, burst=burst, clock=time.monotonic)
        self._mem: dict[str, tuple[float, Any]] = {}
        self._lock = threading.Lock()
        self.stats = {
            "requests": 0,
            "retries": 0,
            "rate_stalls": 0,
            "errors": 0,
            "last_status": None,
            "rate_wait_total_s": 0.0,
        }

    # ---- URL + cache-key helpers ----
    def _url(self, path: str, params: dict | None = None) -> str:
        url = path if path.startswith("http") else f"{self.base}/{path.lstrip('/')}"
        if params:
            url += ("&" if "?" in url else "?") + urllib.parse.urlencode(params)
        return url

    @staticmethod
    def _key(method: str, url: str, body: Any) -> str:
        raw = f"{method} {url} {json.dumps(body, sort_keys=True) if body is not None else ''}"
        return hashlib.sha1(raw.encode()).hexdigest()

    def _disk_path(self, key: str) -> Path | None:
        if self._cache_dir is None:
            return None
        return self._cache_dir / f"{key}.json"

    def _cache_read(self, key: str) -> tuple[float, Any] | None:
        hit = self._mem.get(key)
        if hit is not None:
            return hit
        p = self._disk_path(key)
        if p is not None and p.exists():
            try:
                blob = json.loads(p.read_text())
                entry = (float(blob["ts"]), blob["payload"])
                self._mem[key] = entry
                return entry
            except Exception:
                return None
        return None

    def _cache_write(self, key: str, payload: Any) -> None:
        now = self._clock()
        self._mem[key] = (now, payload)
        p = self._disk_path(key)
        if p is None:
            return
        try:
            p.parent.mkdir(parents=True, exist_ok=True)
            tmp = p.with_suffix(".json.tmp")
            tmp.write_text(json.dumps({"ts": now, "payload": payload}))
            os.replace(tmp, p)  # atomic (mirrors cmc_client / run_allocator.save_state)
        except Exception:
            pass

    # ---- backoff + core request ----
    def _backoff(self, attempt: int, retry_after: str | None) -> float:
        if retry_after:
            try:
                return min(float(retry_after), self.max_wait_s)
            except (TypeError, ValueError):
                pass
        return min(0.5 * (2**attempt) + random.uniform(0.0, 0.4), self.max_wait_s)

    def _request(self, method: str, url: str, body: Any, headers: dict) -> Any:
        """Issue one request with retries. Returns parsed JSON, or raises HttpError."""
        data = json.dumps(body).encode() if body is not None else None
        attempt = 0
        while True:
            try:
                self._bucket_acquire()
                req = urllib.request.Request(url, data=data, headers=headers, method=method)
                with self._opener(req, timeout=self.timeout) as resp:
                    self.stats["requests"] += 1
                    self.stats["last_status"] = getattr(resp, "status", 200)
                    return json.loads(resp.read().decode())
            except urllib.error.HTTPError as e:
                self.stats["last_status"] = e.code
                if e.code in _RETRYABLE_STATUS and attempt < self.max_retries:
                    ra = e.headers.get("Retry-After") if e.headers else None
                    self.stats["retries"] += 1
                    time.sleep(self._backoff(attempt, ra))
                    attempt += 1
                    continue
                self.stats["errors"] += 1
                detail = ""
                try:
                    detail = e.read().decode()[:200]
                except Exception:
                    pass
                raise HttpError(f"HTTP {e.code} for {url}: {detail}", status=e.code, url=url) from e
            except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as e:
                if attempt < self.max_retries:
                    self.stats["retries"] += 1
                    time.sleep(self._backoff(attempt, None))
                    attempt += 1
                    continue
                self.stats["errors"] += 1
                raise HttpError(f"connection failed for {url}: {e}", url=url) from e

    def _bucket_acquire(self) -> None:
        try:
            waited = self._bucket.acquire(self.max_wait_s)
            if waited:
                self.stats["rate_wait_total_s"] = round(self.stats["rate_wait_total_s"] + waited, 2)
        except _RateLimitStall as e:
            self.stats["rate_stalls"] += 1
            raise HttpError(f"rate-limit stall (would wait {float(e.args[0]):.1f}s)") from e

    # ---- public JSON helpers ----
    def get_json(
        self,
        path: str,
        params: dict | None = None,
        *,
        cache_ttl: float = 0.0,
        stale_ttl: float = 0.0,
    ) -> Any:
        return self._json("GET", self._url(path, params), None, cache_ttl, stale_ttl)

    def post_json(
        self, path: str, body: Any, *, cache_ttl: float = 0.0, stale_ttl: float = 0.0
    ) -> Any:
        return self._json("POST", self._url(path), body, cache_ttl, stale_ttl)

    def _json(self, method: str, url: str, body: Any, cache_ttl: float, stale_ttl: float) -> Any:
        key = self._key(method, url, body)
        now = self._clock()
        cached = self._cache_read(key) if (cache_ttl or stale_ttl) else None
        if cached is not None and (now - cached[0]) < cache_ttl:
            return cached[1]  # fresh — no network

        headers = {"Accept": "application/json", "User-Agent": self.user_agent}
        if body is not None:
            headers["Content-Type"] = "application/json"
        headers.update(self.extra_headers)
        try:
            payload = self._request(method, url, body, headers)
        except HttpError:
            if cached is not None and (now - cached[0]) < stale_ttl:
                return cached[1]  # network down, but a tolerably-stale copy exists
            raise
        if cache_ttl or stale_ttl:
            self._cache_write(key, payload)
        return payload
