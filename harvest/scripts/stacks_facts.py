#!/usr/bin/env python
"""
Regenerate every numeric claim in Degrants.md from the committed dataset, with sources and an
as_of stamp — so the proposal is self-verifying and cannot silently drift.

    make stacks_facts                 # print the measured facts + write data/stacks/facts.json
    make stacks_facts ARGS="--check"  # recompute from committed artifacts; exit 1 on drift

Run `make stacks_harvest && make stacks_study` first so the committed dataset is current; then
this reads it and prints the numbers to check the proposal against.
"""

from __future__ import annotations

import argparse
import sys

from ictbot.stacks import facts


def main() -> int:
    ap = argparse.ArgumentParser(description="Self-verifying facts sheet for Degrants.md.")
    ap.add_argument(
        "--check", action="store_true", help="recompute + compare to committed facts.json"
    )
    args = ap.parse_args()

    if args.check:
        ok, recomputed, committed = facts.check()
        if not committed:
            print("no committed facts.json — run `make stacks_facts` first", file=sys.stderr)
            return 1
        print(facts.facts_table(recomputed))
        # also prove the human docs (Degrants.md + methodology headline) match the dataset
        from ictbot.stacks import docsync

        docs_ok, drifts = docsync.check()
        if ok and docs_ok:
            print("\n✅ facts reproduce from the committed dataset; docs in sync")
            return 0
        if not ok:
            print("\n❌ facts drifted from committed facts.json", file=sys.stderr)
        if not docs_ok:
            names = ", ".join(d["name"] for d in drifts)
            print(
                f"\n❌ docs drifted from the dataset ({names}) — run `make stacks_docs`",
                file=sys.stderr,
            )
        return 1

    f = facts.build_facts()
    if not f.get("as_of_date"):
        print(
            "no committed dataset — run `make stacks_harvest && make stacks_study` first",
            file=sys.stderr,
        )
        return 1
    print(facts.facts_table(f))
    path = facts.write_facts(f)
    print(f"\nwrote {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
