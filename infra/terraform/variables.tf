variable "project_id" {
  type        = string
  description = "GCP project id"
}

variable "region" {
  type    = string
  default = "europe-west1"
}

variable "domain" {
  type        = string
  description = "Apex domain, e.g. stall.example"
}

variable "environment" {
  type    = string
  default = "staging"
}

variable "image_tag" {
  type        = string
  description = "Container image tag to deploy (git SHA)"
  default     = "latest"
}

variable "db_tier" {
  type    = string
  default = "db-custom-2-7680"
}

variable "redis_memory_gb" {
  type    = number
  default = 1
}

variable "cloudflare_api_token" {
  type      = string
  sensitive = true
}

variable "cloudflare_zone_id" {
  type = string
}

variable "github_repository" {
  type        = string
  description = "GitHub \"owner/repo\" allowed to assume the deploy service account via Workload Identity Federation, e.g. \"PPHTutorial/stall-web\""
}

# Secret Manager containers created here; values populated out-of-band / by CI.
variable "secret_names" {
  type = list(string)
  default = [
    "DATABASE_URL",
    "JWT_PRIVATE_KEY",
    "JWT_PUBLIC_KEY",
    "REDIS_URL",
    "PAYSTACK_SECRET_KEY",
    "FLUTTERWAVE_SECRET_KEY",
    "STRIPE_SECRET_KEY",
    "GOOGLE_MAPS_API_KEY",
    "FCM_PRIVATE_KEY",
    "SENTRY_DSN",
  ]
}
