terraform {
  required_version = ">= 1.7"

  required_providers {
    cloudflare = { source = "cloudflare/cloudflare", version = "~> 4.40" }
  }

  # Local state by default — this module has no GCP dependency, so there's
  # no bucket to put it in. Fine for a single-operator self-host; switch to
  # a remote backend (Terraform Cloud's free tier, or an S3-compatible one
  # pointed at the MinIO/R2 bucket this stack already runs) once more than
  # one person applies this.
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}
