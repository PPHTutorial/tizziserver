# On-call

## Handover checklist
- Read the last 24h of `#stall-ops` + open Sentry issues (`is:unresolved is:for_review`).
- Confirm the three Cloud Run services show >0 healthy instances and last deploy is green.
- Check the worker health JSON (`/` on the worker service) lists every loop:
  `outbox-relay, dispatch-sweep, eta-refresh, payout-drain, auction-draws, dispute-sla,
  ads-sweep, broadcast-referral-sweep, analytics-rollup, privacy-sweep, breadcrumb-compact`.
- Note any campaign / draw scheduled to fire during your shift.

## First-look dashboards
| signal | where | healthy |
|---|---|---|
| API p95 latency | Grafana `stall-overview` | < 400 ms |
| API 5xx rate | Cloud Run metrics | < 0.5% |
| DB connections | Cloud SQL insights | < 80% of `max_connections` |
| Redis memory | Memorystore metrics | < 75% |
| Outbox lag | `SELECT count(*) FROM outbox_events WHERE "dispatchedAt" IS NULL` | < 500 |
| Dispatch fill time | `delivery_events` REQUESTED→COURIER_ASSIGNED | p95 < 90 s |

## Escalation
1. You (primary) — 15 min to ack.
2. Secondary on-call — auto-paged after 15 min unacked.
3. Eng lead — for data loss, payment integrity, or a > 30 min full outage.
4. Founder — customer-facing comms on a > 1h outage or any suspected breach.

## Common one-liners
```bash
# tail a service
gcloud run services logs read stall-api --region "$REGION" --limit 200

# outbox backlog
psql "$DATABASE_URL" -c "select type,count(*) from outbox_events where \"dispatchedAt\" is null group by 1 order by 2 desc;"

# force a worker restart (loops are idempotent)
gcloud run services update stall-worker --region "$REGION" --update-env-vars _RESTART=$(date +%s)
```
