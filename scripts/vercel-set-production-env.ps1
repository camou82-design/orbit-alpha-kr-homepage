# Homepage only: set Production env on linked Vercel project (not trade.orbitalpha.kr).
# Prereq: same folder has `.vercel/project.json` (vercel link). Run from repo root or this file's dir.
# Usage (PowerShell):  cd e:\antigravity\homepage
#                       .\scripts\vercel-set-production-env.ps1
# Optional: $env:VERCEL_TOKEN = '<token>' (Vercel Account Settings -> Tokens)

$ErrorActionPreference = "Stop"
Set-Location (Resolve-Path (Join-Path $PSScriptRoot ".."))

vercel whoami 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "No Vercel CLI session. In THIS machine's terminal run: vercel login   (or set `$env:VERCEL_TOKEN)"
}

# Add or overwrite Production-only variables (homepage project; not trade.orbitalpha.kr).
vercel env add HOMEPAGE_ADMIN_PASSWORD production --value "955104" --yes --force --sensitive
vercel env add ORBITALPHA_FUTURES_PAPER_ROOT production --value "/home/admin/orbitalpha-futures-paper" --yes --force

Write-Host "Done. Redeploy Production (Deployments -> ... -> Redeploy) or: vercel deploy --prod"
