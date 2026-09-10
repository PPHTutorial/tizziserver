# --- Workload Identity Federation for GitHub Actions -----------------
# Lets .github/workflows/deploy.yml authenticate to GCP (via
# google-github-actions/auth) with short-lived tokens instead of a long-lived
# service-account JSON key. Scoped to var.github_repository only — without
# that condition, any GitHub repo's Actions run could impersonate the deploy
# service account.

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github-actions"
  display_name              = "GitHub Actions"
  depends_on                = [google_project_service.svc]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  display_name                       = "GitHub"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }
  attribute_condition = "assertion.repository == \"${var.github_repository}\""

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# --- Deploy-time service account (separate from the Cloud Run runtime SA:
# this one pushes images / deploys revisions / runs migrations, the runtime
# SA only reads secrets + talks to Cloud SQL at request time) -------------
resource "google_service_account" "deploy" {
  account_id   = "stall-deploy-${var.environment}"
  display_name = "Stall CI/CD deploy (${var.environment})"
}

resource "google_service_account_iam_member" "deploy_wif" {
  service_account_id = google_service_account.deploy.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}

resource "google_project_iam_member" "deploy_run_admin" {
  project = var.project_id
  role    = "roles/run.admin"
  member  = "serviceAccount:${google_service_account.deploy.email}"
}

resource "google_project_iam_member" "deploy_artifact_writer" {
  project = var.project_id
  role    = "roles/artifactregistry.writer"
  member  = "serviceAccount:${google_service_account.deploy.email}"
}

resource "google_project_iam_member" "deploy_sa_user" {
  project = var.project_id
  role    = "roles/iam.serviceAccountUser"
  member  = "serviceAccount:${google_service_account.deploy.email}"
}

# For the deploy.yml `migrate` job, which connects straight to the DB via a
# STAGING_/PROD_DATABASE_URL secret rather than the Cloud SQL Auth Proxy —
# harmless to also grant the client role for a future proxy-based migration.
resource "google_project_iam_member" "deploy_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.deploy.email}"
}
