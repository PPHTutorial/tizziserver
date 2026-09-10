# Deploy / rollback

## Normal deploy
`main` → CI gate → `deploy.yml` builds `sha-<12>` images, runs `prisma migrate deploy`
against staging, deploys **no-traffic** revisions, then shifts traffic to latest and
smoke-tests `/api/v1/health`. Production is a gated `workflow_dispatch` with a manual
approval on the `production` environment.

## Fast rollback (traffic shift — seconds, no rebuild)
```bash
for svc in api realtime worker; do
  PREV=$(gcloud run revisions list --service stall-$svc --region "$REGION" \
    --format='value(name)' --sort-by=~metadata.creationTimestamp | sed -n 2p)
  gcloud run services update-traffic stall-$svc --region "$REGION" --to-revisions "$PREV=100"
done
```
The prod job in `deploy.yml` does this automatically if the post-deploy health check fails.

## Migration made it un-rollbackable
Schema changes are **expand-then-contract**. If a revision can't be rolled back because
the new migration dropped/renamed a column the old code needs:
1. Roll **forward** with a hotfix that tolerates both shapes, OR
2. Restore the DB from the pre-deploy PITR timestamp (`disaster-recovery.md`) and replay
   any writes since (rare — only for a genuinely destructive migration that shipped).
Prevention: never combine a destructive DDL with an app change in the same deploy.

## Prisma geo migrations
`packages/db/README.md` — every `migrate dev` emits spurious `DROP INDEX` for the GiST /
GIN indexes on `Unsupported()` columns. Strip those lines before committing the migration
(8–9 per migration). CI runs `migrate:deploy` only, so a bad generated file fails there first.
