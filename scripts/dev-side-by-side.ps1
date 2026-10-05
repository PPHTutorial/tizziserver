<#
  Run Stall's dev backend next to another project's Docker stack that already
  owns the default ports (Postgres 5432, Redis 6379, MinIO 9000) — without
  editing .env. Safe to re-run after a reboot.

    Stall Postgres  127.0.0.1:5433   (native, ./.pgdata — scripts/dev-postgres.mjs)
    Stall Redis     127.0.0.1:6380   (container stall-dev-redis)
    Stall MinIO     127.0.0.1:9200   (container stall-dev-s3, public bucket from S3_BUCKET)
    Stall API       :3000            (foreground — Ctrl+C stops it)

  A USB-connected phone reaches the API/media at http://localhost:3000 and
  http://localhost:9200 through `adb reverse` (re-applied here; it does not
  survive a reboot or a cable re-plug). Run the app with:

    flutter run --flavor grandprice `
      --dart-define=STALL_API_URL=http://localhost:3000 `
      --dart-define=STALL_MEDIA_URL=http://localhost:9200/stall-media

  Usage:  pwsh scripts/dev-side-by-side.ps1
#>
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Get-DotEnv([string]$key) {
  $line = Get-Content .env | Where-Object { $_ -match "^$key=" } | Select-Object -First 1
  if (-not $line) { throw "$key missing from .env" }
  ($line -replace "^$key=", '').Trim('"')
}

function Test-Port([int]$port) {
  $c = New-Object System.Net.Sockets.TcpClient
  try { $c.ConnectAsync('127.0.0.1', $port).Wait(500) -and $c.Connected } catch { $false } finally { $c.Dispose() }
}

function Wait-Port([int]$port, [string]$what, [int]$seconds = 60) {
  for ($i = 0; $i -lt $seconds; $i++) { if (Test-Port $port) { return } ; Start-Sleep -Seconds 1 }
  throw "$what did not come up on :$port"
}

# --- Postgres :5433 -------------------------------------------------------
if (-not (Test-Port 5433)) {
  Write-Host 'Starting Stall Postgres on :5433…'
  $env:PGPORT = '5433'
  Start-Process -WindowStyle Hidden node -ArgumentList 'scripts/dev-postgres.mjs', 'start'
  Remove-Item Env:PGPORT
  Wait-Port 5433 'Postgres'
}

# --- Redis :6380 + MinIO :9200 (containers restart with Docker Desktop) ----
$existing = docker ps -a --format '{{.Names}}'
if ($existing -notcontains 'stall-dev-redis') {
  docker run -d --name stall-dev-redis --restart unless-stopped -p 127.0.0.1:6380:6379 redis:7-alpine | Out-Null
} else { docker start stall-dev-redis | Out-Null }

$bucket = Get-DotEnv 'S3_BUCKET'
if ($existing -notcontains 'stall-dev-s3') {
  docker run -d --name stall-dev-s3 --restart unless-stopped -p 127.0.0.1:9200:9000 `
    -e "MINIO_ROOT_USER=$(Get-DotEnv 'S3_ACCESS_KEY_ID')" `
    -e "MINIO_ROOT_PASSWORD=$(Get-DotEnv 'S3_SECRET_ACCESS_KEY')" `
    -v "${root}/infra/docker/minio-media-policy.json:/policy.tmpl.json:ro" `
    quay.io/minio/minio:RELEASE.2025-04-22T22-12-26Z server /data | Out-Null
} else { docker start stall-dev-s3 | Out-Null }
Wait-Port 6380 'Redis'
Wait-Port 9200 'MinIO'
docker exec stall-dev-s3 sh -c "for i in 1 2 3 4 5 6 7 8 9 10; do mc alias set stall http://127.0.0.1:9000 `"`$MINIO_ROOT_USER`" `"`$MINIO_ROOT_PASSWORD`" >/dev/null 2>&1 && break; sleep 2; done; mc mb --ignore-existing stall/$bucket >/dev/null && sed 's/BUCKET/$bucket/g' /policy.tmpl.json > /tmp/policy.json && mc anonymous set-json /tmp/policy.json stall/$bucket >/dev/null" | Out-Null

# --- Env overrides (process-only; dotenv-cli never overrides these) ---------
# 127.0.0.1, not localhost: localhost resolves to ::1 and the containers bind IPv4.
$db = 'postgresql://postgres@127.0.0.1:5433/stall?schema=public'
$env:DATABASE_URL = $db
$env:DATABASE_POOLING_URL = $db   # the Prisma client prefers this one
$env:REDIS_URL = 'redis://127.0.0.1:6380'
$env:S3_ENDPOINT = 'http://127.0.0.1:9200'
$env:STORAGE_PROVIDER = 's3'

Write-Host 'Applying migrations…'
Push-Location packages/db
npx prisma migrate deploy | Select-Object -Last 1
Pop-Location

# --- Phone: forward its localhost to this PC over USB ----------------------
if (Get-Command adb -ErrorAction SilentlyContinue) {
  $devices = adb devices | Select-Object -Skip 1 | Where-Object { $_ -match '\tdevice$' } | ForEach-Object { ($_ -split '\t')[0] }
  foreach ($d in $devices) {
    adb -s $d reverse tcp:3000 tcp:3000 | Out-Null
    adb -s $d reverse tcp:9200 tcp:9200 | Out-Null
    Write-Host "adb reverse 3000/9200 → $d"
  }
}

if (Test-Port 3000) { throw 'Something is already listening on :3000 — stop it first.' }
Write-Host 'Starting the API on :3000 (Ctrl+C to stop)…'
Set-Location apps/api
pnpm dev
