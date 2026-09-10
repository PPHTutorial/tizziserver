# DNS → Cloud Run (proxied, so WAF + cache + Turnstile apply).
resource "cloudflare_record" "api" {
  zone_id = var.cloudflare_zone_id
  name    = var.environment == "production" ? "api" : "api.${var.environment}"
  type    = "CNAME"
  content = trimprefix(google_cloud_run_v2_service.svc["api"].uri, "https://")
  proxied = true
}

resource "cloudflare_record" "realtime" {
  zone_id = var.cloudflare_zone_id
  name    = var.environment == "production" ? "rt" : "rt.${var.environment}"
  type    = "CNAME"
  content = trimprefix(google_cloud_run_v2_service.svc["realtime"].uri, "https://")
  proxied = true
}

# WAF: managed ruleset + a rate-limit on the auth + checkout endpoints.
resource "cloudflare_ruleset" "waf" {
  zone_id = var.cloudflare_zone_id
  name    = "stall-waf"
  kind    = "zone"
  phase   = "http_request_firewall_managed"

  rules {
    action = "execute"
    action_parameters {
      id = "efb7b8c949ac4650a09736fc376e9aee" # Cloudflare Managed Ruleset
    }
    expression  = "true"
    description = "Cloudflare Managed Ruleset"
    enabled     = true
  }
}

resource "cloudflare_ruleset" "ratelimit" {
  zone_id = var.cloudflare_zone_id
  name    = "stall-ratelimit"
  kind    = "zone"
  phase   = "http_ratelimit"

  rules {
    action = "block"
    ratelimit {
      characteristics     = ["ip.src", "cf.colo.id"]
      period              = 60
      requests_per_period = 120
      mitigation_timeout  = 600
    }
    expression  = "(http.request.uri.path contains \"/api/v1/auth/\") or (http.request.uri.path contains \"/api/v1/checkout\")"
    description = "Throttle auth + checkout per IP"
    enabled     = true
  }
}

# Cache rule: static + OpenAPI only; everything under /api/v1 is bypass.
resource "cloudflare_ruleset" "cache" {
  zone_id = var.cloudflare_zone_id
  name    = "stall-cache"
  kind    = "zone"
  phase   = "http_request_cache_settings"

  rules {
    action = "set_cache_settings"
    action_parameters {
      cache = false
    }
    expression  = "starts_with(http.request.uri.path, \"/api/\")"
    description = "Never cache the API"
    enabled     = true
  }
}

# Turnstile widget for the web admin console + OTP request form.
resource "cloudflare_turnstile_widget" "stall" {
  account_id = var.cloudflare_account_id
  name       = "stall-${var.environment}"
  domains    = [var.domain]
  mode       = "managed"
}

# R2 bucket for media (S3-compatible; the app already speaks the S3 API).
resource "cloudflare_r2_bucket" "media" {
  account_id = var.cloudflare_account_id
  name       = "stall-media-${var.environment}"
  location   = "WEUR"
}

variable "cloudflare_account_id" {
  type = string
}
