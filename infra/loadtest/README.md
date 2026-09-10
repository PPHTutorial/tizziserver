# Stall load tests (k6)

Phase 8 performance gate. Run against a **staging** stack — never production.

```bash
# install: https://k6.io/docs/get-started/installation/
export BASE_URL=https://staging.stall.example
export AUTH_TOKEN=<a staging access token>          # for authed scenarios
export REALTIME_URL=wss://rt.staging.stall.example  # tracking.js

k6 run infra/loadtest/checkout.js
k6 run infra/loadtest/dispatch.js
k6 run infra/loadtest/tracking.js
```

| script | exercises | pass threshold |
|---|---|---|
| `checkout.js` | `POST /checkout/quote` + `POST /checkout` (idempotent) | p95 < 800 ms, error rate < 1% |
| `dispatch.js` | `POST /deliveries` adhoc + offer accept loop | p95 < 1200 ms, error rate < 2% |
| `tracking.js` | socket.io `/tracking` connect + `location` publish at 1 Hz | p95 connect < 500 ms, 0 dropped rooms |

Tuning targets when a threshold fails: PgBouncer pool size, `DISPATCH_SHORTLIST_*`,
Redis `maxmemory-policy`, the GiST / GIN indexes in `packages/db`, and Cloud Run
min-instances. See `docs/runbooks/dispatch-degradation.md`.
