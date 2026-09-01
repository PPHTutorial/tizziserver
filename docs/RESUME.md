# STALL — SESSION RESUME PROTOCOL

This project is built across many chat sessions. Context gets cleared between them to save
tokens. This file + `docs/PROGRESS.md` are how a fresh session picks up exactly where the last
one stopped.

---

## Key phrases

| You type | Claude does |
|----------|-------------|
| **`RESUME STALL`** | Reads `docs/PROGRESS.md` then this file, then the doc for the ACTIVE PHASE, then the relevant code. Continues from **NEXT ACTIONS** without re-asking for context. |
| **`RESUME STALL — <focus>`** | Same, but prioritizes `<focus>` (e.g. `RESUME STALL — courier dispatch engine`). |
| **`SAVE STALL`** | Flushes state to `docs/PROGRESS.md`: rewrites CURRENT STATE + ACTIVE PHASE checklist + NEXT ACTIONS, appends to DECISION LOG and SESSION LOG. Do this before `/clear`. |
| **`STATUS STALL`** | Prints a short summary of CURRENT STATE + ACTIVE PHASE + top 3 NEXT ACTIONS. No file changes. |

## Read order on `RESUME STALL`

1. `docs/PROGRESS.md` — **authoritative.** CURRENT STATE, ACTIVE PHASE, NEXT ACTIONS, BLOCKERS, DECISION LOG.
2. `docs/RESUME.md` — this file (the rules).
3. `docs/05-ROADMAP.md` — find the ACTIVE PHASE section, read its checklist + exit criteria.
4. The one design doc relevant to the ACTIVE PHASE:
   - Phase 0 → `docs/01-ARCHITECTURE.md`
   - Phase 1 → `docs/01-ARCHITECTURE.md` §Auth + `docs/02-DATA-MODEL.md` §Identity
   - Phase 2 → `docs/02-DATA-MODEL.md` §Catalog + `docs/04-SCREEN-CATALOG.md`
   - Phase 3 → `docs/02-DATA-MODEL.md` §Orders/§Wallet
   - Phase 4 → `docs/01-ARCHITECTURE.md` §Realtime + §Geo, `docs/02-DATA-MODEL.md` §Delivery
   - Phase 5 → `docs/02-DATA-MODEL.md` §Auction
   - Phase 6+ → the matching `docs/02-DATA-MODEL.md` section
5. Only then open source files named in NEXT ACTIONS.

## Rules for every session

- **Do not** re-read `node_modules/`, lockfiles, generated clients, or migration SQL unless a task needs it.
- **Do not** re-litigate anything in DECISION LOG. If a decision must change, add a new dated entry that supersedes it and say so.
- **Do not** widen scope past the ACTIVE PHASE without the user asking.
- Prefer `Grep`/`Glob` over reading whole files. Read the slice you need.
- **End every working session** by updating `docs/PROGRESS.md` (or when the user types `SAVE STALL`): CURRENT STATE, ACTIVE PHASE checkboxes, NEXT ACTIONS, SESSION LOG row, and DECISION LOG if anything was decided.
- Keep `docs/04-SCREEN-CATALOG.md` status columns current as screens get specs / get built.
- When a phase's exit criteria are met: check every box, move ACTIVE PHASE to the next one, reset NEXT ACTIONS.

## Memory backup

A `project` memory (`stall-overhaul`) points at this protocol, so even a session that starts
with no key phrase and only recalled memory knows to open `docs/PROGRESS.md` first.
