output "api_url" {
  value = "https://api.${var.domain}"
}

output "realtime_url" {
  value = "https://rt.${var.domain}"
}

output "turnstile_site_key" {
  value = cloudflare_turnstile_widget.stall.id
}
