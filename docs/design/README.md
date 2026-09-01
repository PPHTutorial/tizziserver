# docs/design — Figma blueprint export

Committed, reproducible export of the GrandPrice Figma design so the blueprint lives in the
repo. Never fetched interactively — run the script.

## One-time setup (you, in Figma)

1. **Token scopes.** figma.com → Settings → Security → Personal access tokens. Scopes:
   `file_content:read`, `file_metadata:read`, `file_dev_resources:read`, and
   `file_variables:read` (Variables REST is **Enterprise-only** — otherwise export tokens via a
   plugin into `docs/design/tokens/`).
2. **Make the file a real design system** (raw shapes export to useless JSON):
   - Variables in collections with **Light/Dark modes** (color, spacing, radius, type).
   - Color / text / effect / grid **Styles**.
   - **Components + Component Sets** for every reusable element.
   - **Auto Layout** everywhere (drives spacing/responsive reconstruction).
   - **Pages** named per spec §34; **frames** named `NN.NNN Screen Name` per the MD numbering.
   - Design System page + one built example per section is enough; more is better.
3. Token owner needs ≥ view access (you're `owner` — fine).

## Run

```bash
FIGMA_TOKEN=figd_xxx FIGMA_FILE_KEY=l027yH0ARNs9FFYcc3SJ3t node scripts/figma-pull.mjs
# or
node scripts/figma-pull.mjs --token figd_xxx --key l027yH0ARNs9FFYcc3SJ3t
```

Exit code `2` = file fetched OK but has no content (populate it and re-run).

## Output — `docs/design/<file-name>/`

| File | Contents |
|---|---|
| `file.json` | full document tree (`plugin_data=shared` → Tokens Studio data included) |
| `meta.json` | file metadata |
| `styles.json` | color/text/effect/grid styles |
| `components.json` | components + component sets (merged) |
| `variables.local.json` / `variables.published.json` | Variables (or a `.NOTE.txt` on 403) |
| `nodes/<page>.json` | deep node dump per page |
| `renders/<id>.png` | PNG @2x of every top-level frame |
| `manifest.json` | pages → frames index + counts + timestamp |

## Then

Tell me "pull the Figma export" (or just that it's populated + the key). I ingest
`file.json` + `variables.local.json` + `styles.json` + `components.json` and reconcile
`docs/03-DESIGN-SYSTEM.md` (token seeds, component specs) and `docs/04-SCREEN-CATALOG.md`
(frame ↔ screen mapping) against it. That's the design locked.

## Current state (Session 2 — 2026-09-01)

- `Untitled/` — the real export: **64 frames @ 390×844**. `file.json` (31MB, full tree),
  `nodes/Page-1.json`, `renders/*.png` (64), `manifest.json`, `meta.json`, `styles.json`
  (empty — no published styles), `components.json` (empty — all inline), `extracted-tokens.json`
  (mined by `scripts/figma-extract-tokens.mjs`), `variables.*.NOTE.txt` (403 — file not on
  Figma Enterprise; use a token plugin if formal Variables are ever needed).
- `figma-file-shallow.json`, `figma-styles.json`, `figma-variables.json` — the Session-1 probe
  (file was empty then). Kept for history.
- **Re-run `npm run figma:pull` after any change to the Figma file**, then re-run
  `node scripts/figma-extract-tokens.mjs` and reconcile `docs/03-DESIGN-SYSTEM.md`.
