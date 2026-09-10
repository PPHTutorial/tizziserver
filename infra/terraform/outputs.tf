output "api_url" {
  value = google_cloud_run_v2_service.svc["api"].uri
}

output "realtime_url" {
  value = google_cloud_run_v2_service.svc["realtime"].uri
}

output "worker_url" {
  value = google_cloud_run_v2_service.svc["worker"].uri
}

output "db_connection_name" {
  value = google_sql_database_instance.pg.connection_name
}

output "redis_host" {
  value = google_redis_instance.cache.host
}

output "artifact_repo" {
  value = local.repo
}

output "public_api" {
  value = "https://${cloudflare_record.api.name}.${var.domain}"
}

# For the deploy.yml repo secrets: GCP_WORKLOAD_IDENTITY_PROVIDER + GCP_SERVICE_ACCOUNT.
output "workload_identity_provider" {
  value = google_iam_workload_identity_pool_provider.github.name
}

output "deploy_service_account_email" {
  value = google_service_account.deploy.email
}
