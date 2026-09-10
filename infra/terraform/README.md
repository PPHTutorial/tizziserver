# Stall infrastructure (Terraform)

Provisions the Phase 8 target: **GCP Cloud Run** behind **Cloudflare**.

> **Status:** authored, not yet applied — needs a GCP project + billing and a
> Cloudflare account/zone (blockers **B7 / B8**). `terraform validate` passes with
> the providers below; `plan`/`apply` require real credentials.

## Layout

| file | contents |
|---|---|
| `providers.tf` | `google`, `google-beta`, `cloudflare` providers + remote GCS state |
| `variables.tf` | project, region, domain, image tags, secret refs |
| `gcp.tf` | Artifact Registry, Cloud SQL (PG16 + PostGIS), Memorystore Redis, 3× Cloud Run (`api`, `realtime`, `worker`), Secret Manager, Cloud Scheduler jobs, service accounts + IAM |
| `cloudflare.tf` | DNS records, WAF managed rules, cache rules, Turnstile, R2 bucket, a staging Tunnel |
| `outputs.tf` | service URLs, DB connection name, Redis host |
| `terraform.tfvars.example` | copy → `terraform.tfvars` and fill in |

## Bootstrap

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars   # fill in project_id, domain, cloudflare_*
terraform init -backend-config="bucket=<tf-state-bucket>"
terraform plan
terraform apply
```

## Notes

- **Migrations** run as a Cloud Run *job* (`prisma migrate deploy`) gated before each
  service revision is promoted — wired in `.github/workflows/deploy.yml`, not here.
- **Secrets** (`JWT_PRIVATE_KEY`, `DATABASE_URL`, gateway keys, `FCM_*`, `SENTRY_DSN`)
  live in Secret Manager and are mounted as env vars; Terraform only creates the
  secret *containers*, values are added out-of-band or via CI.
- Cloud SQL enables the `postgis` + `pg_trgm` extensions via a post-create
  `null_resource` running `psql` (see `gcp.tf`).
- `min_instances = 1` on `api` + `realtime` to avoid cold starts on the
  latency-sensitive paths; `worker` scales 1→1 (single-writer loops).
