# Payment-gateway outage

## Symptoms
- Spike in `PAYMENT_FAILED` from `/checkout`, `/wallet/topup`, `/auctions/*/tickets`,
  `/vendors/campaigns/*/submit`.
- `payment_intents` piling up in `PROCESSING`.
- Gateway status page red, or webhook deliveries stopped.

## Triage
```sql
select gateway, status, count(*) from payment_intents
where "createdAt" > now() - interval '30 min' group by 1,2 order by 3 desc;
```
- All gateways failing → likely our egress / Secret Manager, not the provider.
- One gateway failing → provider incident.

## Mitigation
1. **Switch provider**: set `PAYMENTS_PROVIDER` to a healthy adapter (`paystack` |
   `flutterwave` | `stripe` | `mock` for an internal-only environment) on `stall-api`
   and redeploy env (`gcloud run services update stall-api --update-env-vars PAYMENTS_PROVIDER=...`).
   All adapters share the `PaymentGateway` port; no code change.
2. **Wallet-first**: tell support to advise customers to pay from wallet (unaffected —
   it's ledger-internal). Top-ups still need a gateway.
3. Do **not** manually mark intents `SUCCEEDED`. Money that didn't move must not be booked.

## Recovery
- When the provider is back, the `payments/webhook` handler is idempotent — redelivered
  webhooks reconcile stuck intents. For intents with no webhook, run a reconcile query
  against the provider dashboard and cancel (`status=FAILED`) the ones that never captured;
  the `withApi` idempotency layer lets customers safely retry checkout.
- Escrow check: `SELECT * FROM ledger_accounts WHERE "ownerType"='ESCROW'` should reconcile
  to the sum of open orders + undrawn auctions + active ad budgets. A mismatch → page eng lead.
