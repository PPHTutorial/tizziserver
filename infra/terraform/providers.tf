terraform {
  required_version = ">= 1.7"

  required_providers {
    google      = { source = "hashicorp/google", version = "~> 5.40" }
    google-beta = { source = "hashicorp/google-beta", version = "~> 5.40" }
    cloudflare  = { source = "cloudflare/cloudflare", version = "~> 4.40" }
  }

  # Remote state — pass -backend-config="bucket=<name>" on `terraform init`.
  backend "gcs" {
    prefix = "stall/terraform.tfstate"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}
