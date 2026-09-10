locals {
  services = ["api", "realtime", "worker"]
  repo     = "${var.region}-docker.pkg.dev/${var.project_id}/stall"
}

# --- APIs -----------------------------------------------------------------
resource "google_project_service" "svc" {
  for_each = toset([
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "redis.googleapis.com",
    "artifactregistry.googleapis.com",
    "secretmanager.googleapis.com",
    "cloudscheduler.googleapis.com",
    "vpcaccess.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "sts.googleapis.com",
  ])
  service            = each.value
  disable_on_destroy = false
}

# --- Artifact Registry --------------------------------------------------
resource "google_artifact_registry_repository" "stall" {
  location      = var.region
  repository_id = "stall"
  format        = "DOCKER"
  depends_on    = [google_project_service.svc]
}

# --- Networking (Serverless VPC connector for Cloud SQL + Redis) -------
resource "google_compute_network" "vpc" {
  name                    = "stall-${var.environment}"
  auto_create_subnetworks = true
}

resource "google_vpc_access_connector" "connector" {
  name          = "stall-conn"
  region        = var.region
  network       = google_compute_network.vpc.name
  ip_cidr_range = "10.8.0.0/28"
  depends_on    = [google_project_service.svc]
}

# --- Cloud SQL (Postgres 16 + PostGIS) -------------------------------
resource "google_sql_database_instance" "pg" {
  name             = "stall-pg-${var.environment}"
  database_version = "POSTGRES_16"
  region           = var.region
  depends_on       = [google_project_service.svc]

  settings {
    tier              = var.db_tier
    availability_type = var.environment == "production" ? "REGIONAL" : "ZONAL"
    disk_autoresize   = true

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      start_time                     = "02:00"
      transaction_log_retention_days = 7
    }

    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.vpc.id
    }

    database_flags {
      name  = "cloudsql.enable_pg_cron"
      value = "on"
    }
  }

  deletion_protection = var.environment == "production"
}

resource "google_sql_database" "stall" {
  name     = "stall"
  instance = google_sql_database_instance.pg.name
}

resource "google_sql_user" "app" {
  name     = "stall"
  instance = google_sql_database_instance.pg.name
  password = random_password.db.result
}

resource "random_password" "db" {
  length  = 32
  special = false
}

# PostGIS + pg_trgm are enabled by a one-shot job after create.
resource "null_resource" "pg_extensions" {
  triggers = { instance = google_sql_database_instance.pg.name }
  provisioner "local-exec" {
    command = <<-EOT
      echo "Run once against the instance:"
      echo "  CREATE EXTENSION IF NOT EXISTS postgis;"
      echo "  CREATE EXTENSION IF NOT EXISTS pg_trgm;"
    EOT
  }
}

# --- Memorystore Redis --------------------------------------------
resource "google_redis_instance" "cache" {
  name               = "stall-redis-${var.environment}"
  tier               = var.environment == "production" ? "STANDARD_HA" : "BASIC"
  memory_size_gb     = var.redis_memory_gb
  region             = var.region
  authorized_network = google_compute_network.vpc.id
  redis_version      = "REDIS_7_2"
  depends_on         = [google_project_service.svc]
}

# --- Secret Manager containers -----------------------------------
resource "google_secret_manager_secret" "s" {
  for_each  = toset(var.secret_names)
  secret_id = each.value
  replication {
    auto {}
  }
  depends_on = [google_project_service.svc]
}

# --- Service account for the Cloud Run services -----------------
resource "google_service_account" "run" {
  account_id   = "stall-run-${var.environment}"
  display_name = "Stall Cloud Run (${var.environment})"
}

resource "google_project_iam_member" "run_secrets" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.run.email}"
}

resource "google_project_iam_member" "run_sql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.run.email}"
}

# --- Cloud Run services ----------------------------------------
resource "google_cloud_run_v2_service" "svc" {
  for_each = toset(local.services)
  name     = "stall-${each.value}"
  location = var.region
  ingress  = each.value == "worker" ? "INGRESS_TRAFFIC_INTERNAL_ONLY" : "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.run.email

    scaling {
      min_instance_count = each.value == "worker" ? 1 : 1
      max_instance_count = each.value == "worker" ? 1 : 20
    }

    vpc_access {
      connector = google_vpc_access_connector.connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = "${local.repo}/${each.value}:${var.image_tag}"

      resources {
        limits = {
          cpu    = each.value == "worker" ? "1" : "2"
          memory = each.value == "worker" ? "512Mi" : "1Gi"
        }
      }

      dynamic "env" {
        for_each = toset(var.secret_names)
        content {
          name = env.value
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.s[env.value].secret_id
              version = "latest"
            }
          }
        }
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "OTEL_SERVICE_NAME"
        value = "stall-${each.value}"
      }
    }
  }

  depends_on = [google_project_service.svc]
}

# api + realtime are public (fronted by Cloudflare); worker stays internal.
resource "google_cloud_run_v2_service_iam_member" "public" {
  for_each = toset(["api", "realtime"])
  name     = google_cloud_run_v2_service.svc[each.value].name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# --- Cloud Scheduler: nudge the worker's heavy jobs on a cadence ---
# (the worker also self-schedules; these are belt-and-braces cron pokes)
resource "google_cloud_scheduler_job" "nightly_rollup" {
  name      = "stall-nightly-rollup"
  schedule  = "5 0 * * *"
  time_zone = "Etc/UTC"
  http_target {
    http_method = "POST"
    uri         = "${google_cloud_run_v2_service.svc["worker"].uri}/jobs/nightly"
    oidc_token { service_account_email = google_service_account.run.email }
  }
  depends_on = [google_project_service.svc]
}
