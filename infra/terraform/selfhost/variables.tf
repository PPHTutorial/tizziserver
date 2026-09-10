variable "domain" {
  type        = string
  description = "Apex domain, e.g. stall.example"
}

variable "environment" {
  type    = string
  default = "production"
}

variable "vps_ip" {
  type        = string
  description = "Public IPv4 of the VPS running docker-compose.prod.yml"
}

variable "vps_ipv6" {
  type        = string
  description = "Public IPv6 of the VPS, if it has one — leave null to skip the AAAA records"
  default     = null
}

variable "cloudflare_api_token" {
  type      = string
  sensitive = true
}

variable "cloudflare_zone_id" {
  type = string
}

variable "cloudflare_account_id" {
  type = string
}

variable "enable_r2" {
  type        = bool
  description = "Also provision an R2 bucket for media. Off by default — the compose stack's MinIO is the cost-free default; flip this on only if you'd rather use R2 (still no egress fees, but a real external dependency)."
  default     = false
}
