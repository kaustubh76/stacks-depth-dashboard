"""
Clarity value serialization codec (SIP-005) — pure stdlib, zero dependencies.

Stacks ``POST /v2/contracts/call-read`` takes hex-serialized Clarity values as
arguments and returns one hex-serialized Clarity value as its result. No maintained
Python Stacks SDK exists (Degrants.md §15 assumes this — correct), so this module is
the ground-truth codec the whole ``stacks/`` package rests on.

Two halves:

  * ``cv_*`` encoders return raw serialized ``bytes``; ``hexarg()`` wraps them as the
    ``0x``-prefixed hex strings ``call-read`` wants as ``arguments``.
  * ``deserialize()`` turns a result hex string into native Python, with small
    wrappers where Clarity draws a distinction Python doesn't:
      response  (ok v)  -> Ok(v)       (err v)  -> Err(v)
      optional  none    -> None        (some v) -> Some(v)
      tuple             -> dict[str, value]   (keys are ASCII)
      list              -> list
      int/uint          -> int         buffer   -> bytes
      string-ascii/utf8 -> str         bool     -> bool
      principal         -> str         ("SP..." or "SP....contract-name")

Type prefixes covered (all 14 — SIP-005 §Serialization of Clarity Values):
  0x00 int   0x01 uint   0x02 buffer   0x03 true   0x04 false
  0x05 principal-standard   0x06 principal-contract
  0x07 response-ok   0x08 response-err   0x09 none   0x0a some
  0x0b list   0x0c tuple   0x0d string-ascii   0x0e string-utf8

Principals use Stacks c32check (Crockford base32 + double-SHA256 checksum), which is
not in the stdlib and is implemented here. The c32 layer is deliberately explicit —
it is the raw material for the M3 write-up on what does and doesn't transfer from EVM
(addresses are c32check, not hex).
"""

from __future__ import annotations

import hashlib
from typing import Any, NamedTuple

# --------------------------------------------------------------------------- #
# Decode wrappers — the distinctions Clarity makes that Python natively doesn't
# --------------------------------------------------------------------------- #


class Ok(NamedTuple):
    value: Any


class Err(NamedTuple):
    value: Any


class Some(NamedTuple):
    value: Any


def unwrap(v: Any) -> Any:
    """Collapse Ok(...) / Some(...) to the inner value. Raises on Err."""
    if isinstance(v, Err):
        raise ClarityError(f"response is (err {v.value!r})")
    if isinstance(v, (Ok, Some)):
        return v.value
    return v


class ClarityError(Exception):
    """Malformed serialized Clarity value, or an unexpected (err ...) response."""


# --------------------------------------------------------------------------- #
# c32check address encoding (Crockford base32 + double-sha256 checksum)
# --------------------------------------------------------------------------- #

_C32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
_C32_INV = {c: i for i, c in enumerate(_C32)}
# Stacks principal hash is always hash160 (20 bytes); c32check payload = hash + 4-byte checksum.
_HASH160_LEN = 20
_CHECKSUM_LEN = 4


def _c32_encode(data: bytes) -> str:
    """Big-endian base-32 (Crockford), one leading '0' char per leading zero byte."""
    num = int.from_bytes(data, "big")
    if num == 0:
        body = ""
    else:
        chars: list[str] = []
        while num > 0:
            num, rem = divmod(num, 32)
            chars.append(_C32[rem])
        body = "".join(reversed(chars))
    pad = 0
    for b in data:
        if b == 0:
            pad += 1
        else:
            break
    return "0" * pad + body


def _c32_decode(s: str, out_len: int) -> bytes:
    num = 0
    for ch in s:
        try:
            num = num * 32 + _C32_INV[ch.upper()]
        except KeyError as e:
            raise ClarityError(f"invalid c32 character {ch!r}") from e
    return num.to_bytes(out_len, "big")


def c32check_encode(version: int, data: bytes) -> str:
    """(version byte, 20-byte hash160) -> 'S{version}{c32(hash+checksum)}' address string."""
    if len(data) != _HASH160_LEN:
        raise ClarityError(f"principal hash must be {_HASH160_LEN} bytes, got {len(data)}")
    checksum = hashlib.sha256(hashlib.sha256(bytes([version]) + data).digest()).digest()[
        :_CHECKSUM_LEN
    ]
    return "S" + _C32[version] + _c32_encode(data + checksum)


def c32check_decode(addr: str) -> tuple[int, bytes]:
    """'SP...'/'SM...' -> (version byte, 20-byte hash160). Verifies the checksum."""
    if len(addr) < 2 or addr[0] not in ("S", "s"):
        raise ClarityError(f"not a Stacks address: {addr!r}")
    try:
        version = _C32_INV[addr[1].upper()]
    except KeyError as e:
        raise ClarityError(f"invalid c32 version char {addr[1]!r}") from e
    payload = _c32_decode(addr[2:], _HASH160_LEN + _CHECKSUM_LEN)
    data, checksum = payload[:_HASH160_LEN], payload[_HASH160_LEN:]
    expect = hashlib.sha256(hashlib.sha256(bytes([version]) + data).digest()).digest()[
        :_CHECKSUM_LEN
    ]
    if checksum != expect:
        raise ClarityError(f"bad c32 checksum for {addr!r}")
    return version, data


# --------------------------------------------------------------------------- #
# Encoders — return raw serialized bytes; compose then hexarg() at the boundary
# --------------------------------------------------------------------------- #

_U128_MAX = (1 << 128) - 1
_I128_MIN, _I128_MAX = -(1 << 127), (1 << 127) - 1


def cv_uint(n: int) -> bytes:
    if not (0 <= n <= _U128_MAX):
        raise ClarityError(f"uint out of 128-bit range: {n}")
    return b"\x01" + n.to_bytes(16, "big")


def cv_int(n: int) -> bytes:
    if not (_I128_MIN <= n <= _I128_MAX):
        raise ClarityError(f"int out of 128-bit range: {n}")
    return b"\x00" + n.to_bytes(16, "big", signed=True)


def cv_bool(b: bool) -> bytes:
    return b"\x03" if b else b"\x04"


def cv_buffer(b: bytes) -> bytes:
    return b"\x02" + len(b).to_bytes(4, "big") + b


def cv_string_ascii(s: str) -> bytes:
    raw = s.encode("ascii")
    return b"\x0d" + len(raw).to_bytes(4, "big") + raw


def cv_string_utf8(s: str) -> bytes:
    raw = s.encode("utf-8")
    return b"\x0e" + len(raw).to_bytes(4, "big") + raw


def cv_standard_principal(addr: str) -> bytes:
    version, h = c32check_decode(addr)
    return b"\x05" + bytes([version]) + h


def cv_contract_principal(addr: str) -> bytes:
    if "." not in addr:
        raise ClarityError(f"contract principal needs a '.': {addr!r}")
    std, name = addr.split(".", 1)
    version, h = c32check_decode(std)
    raw = name.encode("ascii")
    if not (1 <= len(raw) <= 128):
        raise ClarityError(f"contract name length out of range: {name!r}")
    return b"\x06" + bytes([version]) + h + bytes([len(raw)]) + raw


def cv_none() -> bytes:
    return b"\x09"


def cv_some(inner: bytes) -> bytes:
    return b"\x0a" + inner


def cv_ok(inner: bytes) -> bytes:
    return b"\x07" + inner


def cv_err(inner: bytes) -> bytes:
    return b"\x08" + inner


def cv_list(items: list[bytes]) -> bytes:
    return b"\x0b" + len(items).to_bytes(4, "big") + b"".join(items)


def cv_tuple(fields: dict[str, bytes]) -> bytes:
    # SIP-005 canonical order: keys sorted ascending by their raw name bytes.
    parts: list[bytes] = []
    for k in sorted(fields):
        raw = k.encode("ascii")
        parts.append(bytes([len(raw)]) + raw + fields[k])
    return b"\x0c" + len(fields).to_bytes(4, "big") + b"".join(parts)


def hexarg(b: bytes) -> str:
    """Serialized bytes -> the '0x'-prefixed hex string call-read wants as an argument."""
    return "0x" + b.hex()


# --------------------------------------------------------------------------- #
# Decoder
# --------------------------------------------------------------------------- #


def _read(data: bytes, off: int) -> tuple[Any, int]:
    if off >= len(data):
        raise ClarityError("unexpected end of buffer")
    t = data[off]
    off += 1
    if t == 0x00:  # int (128-bit signed, big-endian)
        return int.from_bytes(data[off : off + 16], "big", signed=True), off + 16
    if t == 0x01:  # uint (128-bit unsigned)
        return int.from_bytes(data[off : off + 16], "big"), off + 16
    if t == 0x02:  # buffer
        n = int.from_bytes(data[off : off + 4], "big")
        off += 4
        return data[off : off + n], off + n
    if t == 0x03:
        return True, off
    if t == 0x04:
        return False, off
    if t == 0x05:  # standard principal
        version = data[off]
        h = data[off + 1 : off + 21]
        return c32check_encode(version, h), off + 21
    if t == 0x06:  # contract principal
        version = data[off]
        h = data[off + 1 : off + 21]
        off += 21
        nlen = data[off]
        off += 1
        name = data[off : off + nlen].decode("ascii")
        return f"{c32check_encode(version, h)}.{name}", off + nlen
    if t == 0x07:  # (ok v)
        v, off = _read(data, off)
        return Ok(v), off
    if t == 0x08:  # (err v)
        v, off = _read(data, off)
        return Err(v), off
    if t == 0x09:  # none
        return None, off
    if t == 0x0A:  # (some v)
        v, off = _read(data, off)
        return Some(v), off
    if t == 0x0B:  # list
        n = int.from_bytes(data[off : off + 4], "big")
        off += 4
        out: list[Any] = []
        for _ in range(n):
            v, off = _read(data, off)
            out.append(v)
        return out, off
    if t == 0x0C:  # tuple
        n = int.from_bytes(data[off : off + 4], "big")
        off += 4
        out_d: dict[str, Any] = {}
        for _ in range(n):
            klen = data[off]
            off += 1
            k = data[off : off + klen].decode("ascii")
            off += klen
            v, off = _read(data, off)
            out_d[k] = v
        return out_d, off
    if t == 0x0D:  # string-ascii
        n = int.from_bytes(data[off : off + 4], "big")
        off += 4
        return data[off : off + n].decode("ascii"), off + n
    if t == 0x0E:  # string-utf8
        n = int.from_bytes(data[off : off + 4], "big")
        off += 4
        return data[off : off + n].decode("utf-8"), off + n
    raise ClarityError(f"unknown Clarity type prefix 0x{t:02x} at offset {off - 1}")


def deserialize(hexstr: str) -> Any:
    """Hex string (with or without '0x') -> native Python (see module docstring)."""
    s = hexstr[2:] if hexstr[:2].lower() == "0x" else hexstr
    try:
        data = bytes.fromhex(s)
    except ValueError as e:
        raise ClarityError(f"not valid hex: {hexstr!r}") from e
    v, off = _read(data, 0)
    if off != len(data):
        raise ClarityError(f"trailing bytes: consumed {off} of {len(data)}")
    return v
