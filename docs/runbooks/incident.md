# Incident response

## Declare
Say it in `#stall-ops`: **"Declaring a SEV-n incident: <one line>"**. Don't wait for certainty.

| SEV | meaning | examples |
|---|---|---|
| SEV1 | core flow down for most users | checkout 5xx, login broken, DB down |
| SEV2 | degraded / a segment down | one tenant, dispatch slow, realtime flapping |
| SEV3 | minor / cosmetic / single user | one vendor's dashboard, a broken image |

## Roles (one person each; the IC can hold two)
- **Incident Commander** — owns the call, decides mitigations, no hands-on-keyboard.
- **Ops** — runs commands, applies mitigations.
- **Comms** — status page + support macro + stakeholder updates every 20 min.
- **Scribe** — timeline in the incident doc (UTC timestamps).

## Loop
1. **Stabilise** — prefer a rollback or feature-flag off over a forward fix.
   - Bad deploy → `deploy-rollback.md`.
   - A single capability misbehaving → toggle its `FeatureFlag` from the admin console
     (`/admin/feature-flags`) — takes effect on the next request, no deploy.
   - A runaway campaign/boost → pause it in `/admin/campaigns` or set its `Campaign.status`.
2. **Verify** — `GET /api/v1/health`, the affected user journey, error rate back to baseline.
3. **Communicate** — update the status page to *monitoring*, then *resolved*.

## After
- Postmortem within 48h (blameless). Action items land as issues with an owner + due date.
- If PII or funds were exposed → follow `disaster-recovery.md` §breach and notify per
  the GDPR/CCPA obligations in `docs/08-HARDENING.md`.
