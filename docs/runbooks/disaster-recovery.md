# Disaster recovery

## Backups
- Cloud SQL: automated daily backups + **PITR** (7-day transaction-log retention,
  `point_in_time_recovery_enabled = true` in `infra/terraform/gcp.tf`).
- Object storage (R2): versioned bucket; media is content-addressed so re-uploads are safe.
- Secrets: Secret Manager keeps prior versions; `JWT_*` keypair is also held in the
  team password manager (breaking it invalidates every session — intended for key rotation).

## RPO / RTO targets
| scenario | RPO | RTO |
|---|---|---|
| single service crash-loop | 0 | < 5 min (rollback) |
| DB corruption / bad destructive migration | < 5 min (PITR) | < 60 min |
| region outage | < 5 min | < 4 h (rebuild in a second region from Terraform) |

## Restore Cloud SQL to a point in time
```bash
gcloud sql instances clone stall-pg-production stall-pg-restore \
  --point-in-time '2026-09-02T13:45:00Z'
# verify on the clone, then repoint DATABASE_URL (Secret Manager new version) and
# redeploy the three services. Keep the damaged instance until the restore is confirmed.
```
After a restore, replay is usually unnecessary (PITR is to-the-second). If you restored
to *before* known-good writes, export those rows from the damaged instance first.

## Region failure
1. `terraform workspace new dr && terraform apply -var region=<second-region>` — brings up
   Cloud Run + a Cloud SQL replica promoted to primary + Memorystore.
2. Restore the latest DB backup into the new instance (cross-region backup copy).
3. Cloudflare: flip the `api` / `rt` CNAMEs to the DR Cloud Run URLs (one `terraform apply`
   with the DR outputs, or edit the records directly for speed).
4. Worker: ensure exactly **one** worker instance runs (the loops are single-writer).

## Suspected breach
- Rotate `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY` (invalidates all sessions), all gateway keys,
  `GOOGLE_MAPS_API_KEY`, `FCM_PRIVATE_KEY`.
- `applySafetyAction` / bump `TokenEpoch` for any implicated accounts.
- Preserve `audit_logs` + Cloud logging exports before the retention sweep prunes them
  (`AUDIT_LOG_RETENTION_DAYS`).
- Legal/comms: GDPR breach notification clock is 72h from awareness.
