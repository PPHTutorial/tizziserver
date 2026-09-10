# Dispute / support surge

## Symptoms
- `disputes` with `slaDueAt` in the past; `dispute-sla` loop logging escalations.
- Support queue (`support_tickets` OPEN/PENDING) growing faster than it's worked.
- Often downstream of another incident (payment outage, dispatch failure, a bad campaign).

## Triage
```sql
select kind, status, count(*) from disputes
where status not in ('RESOLVED','CLOSED') group by 1,2 order by 3 desc;

select "createdAt"::date, count(*) from disputes
where "createdAt" > now() - interval '7 days' group by 1 order by 1;
```
Find the common `kind` + `refId` pattern — a surge is almost always one root cause.

## Mitigation
1. **Fix the root cause first** — a dispute surge is a symptom. Check recent incidents.
2. **Staff up** the queue: `/admin/disputes` — assign in bulk, prioritise `slaDueAt`.
3. **Bulk resolution** for a known-good class (e.g. "delivery fee double-charged during
   the 14:00–14:30 window"): resolve with a standard `outcome` + `refundMinor`; the refund
   is a ledgered ADJUSTMENT txn (platform REVENUE → user wallet), reconciles automatically.
4. **Proactive comms**: a `/admin/broadcasts` message to the affected segment cuts inbound
   ticket volume sharply.
5. Temporarily raise `DISPUTE_SLA_HOURS` if the SLA clock is causing noise while you dig
   out — but log it and revert.

## Follow-up
- If a bug caused wrongful charges, run the reconcile query in `payment-outage.md` and
  confirm escrow nets to zero after all refunds.
