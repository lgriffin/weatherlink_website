# Send one output file to the site's Outputs page from Windows.
#
#   .\scripts\push-output.ps1 -Kind forecast -File .\forecast.json
#
# Uses $env:SITE_URL and $env:INGEST_TOKEN, or SITE_URL= / INGEST_TOKEN= lines in the repo's .env.
param(
  [Parameter(Mandatory)] [ValidateSet('forecast', 'model-scores', 'outages', 'harvest')] [string] $Kind,
  [Parameter(Mandatory)] [string] $File,
  [string] $Source = $env:COMPUTERNAME
)
$ErrorActionPreference = 'Stop'

$envFile = Join-Path $PSScriptRoot '..\.env'
$settings = @{}
if (Test-Path $envFile) {
  foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*([A-Z_]+)=(.*)$') { $settings[$Matches[1]] = $Matches[2].Trim('"', "'", ' ') }
  }
}
$site = if ($env:SITE_URL) { $env:SITE_URL } else { $settings['SITE_URL'] }
$token = if ($env:INGEST_TOKEN) { $env:INGEST_TOKEN } else { $settings['INGEST_TOKEN'] }
if (-not $site) { throw 'Set SITE_URL, e.g. http://nas.local:1456' }
if (-not $token) { throw 'Set INGEST_TOKEN to the same value as on the site' }

$response = Invoke-RestMethod -Method Post -Uri "$($site.TrimEnd('/'))/api/v1/ingest/$Kind" `
  -Headers @{ Authorization = "Bearer $token"; 'X-Source' = $Source } `
  -ContentType 'application/json; charset=utf-8' `
  -Body ([System.IO.File]::ReadAllBytes((Resolve-Path $File)))
$response | ConvertTo-Json -Compress
