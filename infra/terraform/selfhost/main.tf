# --- DNS → the self-hosted VPS (proxied, so WAF + cache + Turnstile apply
# and the origin IP is hidden behind Cloudflare) ---------------------------
resource "cloudflare_record" "api" {
  zone_id = var.cloudflare_zone_id
  name    = "api"
  type    = "A"
  content = var.vps_ip
  proxied = true
}

resource "cloudflare_record" "api_v6" {
  count   = var.vps_ipv6 == null ? 0 : 1
  zone_id = var.cloudflare_zone_id
  name    = "api"
  type    = "AAAA"
  content = var.vps_ipv6
  proxied = true
}

resource "cloudflare_record" "realtime" {
  zone_id = var.cloudflare_zone_id
  name    = "rt"
  type    = "A"
  content = var.vps_ip
  proxied = true
}

resource "cloudflare_record" "realtime_v6" {
  count   = var.vps_ipv6 == null ? 0 : 1
  zone_id = var.cloudflare_zone_id
  name    = "rt"
  type    = "AAAA"
  content = var.vps_ipv6
  proxied = true
}

# WAF: managed ruleset + a rate-limit on the auth + checkout endpoints.
# Identical to infra/terraform/cloudflare.tf's rules — the origin changed
# (VPS instead of Cloud Run), the edge policy didn't.
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

# Cache rule: everything under /api/v1 bypasses cache (it's an API, not a
# CDN-cacheable site) — static assets, if any are ever served from here,
# still get Cloudflare's default cache behaviour.
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

# Turnstile widget for the admin console + OTP request form.
resource "cloudflare_turnstile_widget" "stall" {
  account_id = var.cloudflare_account_id
  name       = "stall-${var.environment}"
  domains    = [var.domain]
  mode       = "managed"
}

# Optional — the compose stack's MinIO is the default, cost-free object
# store; only provision this if you'd rather offload media to R2.
resource "cloudflare_r2_bucket" "media" {
  count      = var.enable_r2 ? 1 : 0
  account_id = var.cloudflare_account_id
  name       = "stall-media-${var.environment}"
  location   = "WEUR"
}
