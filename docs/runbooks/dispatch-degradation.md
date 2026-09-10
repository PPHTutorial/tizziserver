# Dispatch degradation

## Symptoms
- Deliveries stuck in `SEARCHING_COURIER`; `expireUndispatchable` cancelling jobs.
- Customer "no driver found" reports; couriers report an empty jobs board.

## Triage
```sql
-- deliveries waiting on a courier
select status, count(*) from deliveries
where "createdAt" > now() - interval '1 hour' group by 1;

-- online couriers per platform
select "platformSlug", count(*) from courier_profiles c
join users u on u.id=c."userId"
where c."onlineStatus"='ONLINE' group by 1;
```
- Few online couriers → supply problem, not software. Notify ops/marketing; consider a
  surge `PricingRule` (`scope=SURGE`) from `/admin/pricing`.
- Couriers online but not offered → software path below.

## Software checks
1. **Redis GEO** — `redis-cli ZCARD stall:couriers:grandprice`. If 0 but couriers are
   ONLINE, presence writes are failing → check `stall-api` logs for `upsertCourierPresence`
   errors and Redis connectivity. Fallback: the PostGIS `ST_DWithin` shortlist still works,
   just slower.
2. **Worker** — is `dispatch-sweep` running? (worker health JSON). If the worker is down,
   offers never time out and the waterfall stalls. Restart it.
3. **Offer TTL** — `DISPATCH_OFFER_TTL_SECONDS` too low (couriers can't react) or too high
   (waterfall too slow). Default 30 s. Adjust the env var on `stall-api` + `stall-worker`.
4. **Shortlist tuning** — widen `DISPATCH_SHORTLIST_RADIUS_M` / `DISPATCH_SHORTLIST_SIZE`
   during a shortage.

## Load-test regression
If p95 fill time regressed after a deploy, run `infra/loadtest/dispatch.js` against staging
and compare. Usual culprits: a missing index (`packages/db`), PgBouncer pool exhaustion,
or an N+1 introduced in `@stall/core/delivery/dispatch.ts`.
