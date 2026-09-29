# Creates or updates the Secrets Manager secret read by the API task, using values from server/.env.
param(
  [string]$Region = 'af-south-1',
  [string]$SecretName = 'cvspec/app',
  [string]$EnvFile = (Join-Path $PSScriptRoot '..\..\server\.env')
)

$keys = 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'OPENAI_API_KEY', 'RESUMEPARSER_API_KEY'

$values = @{}
foreach ($line in Get-Content $EnvFile) {
  if ($line -match '^\s*([A-Z0-9_]+)\s*=(.*)$') {
    $values[$Matches[1]] = $Matches[2].Trim().Trim('"', "'")
  }
}

$payload = [ordered]@{}
foreach ($key in $keys) {
  if (-not $values[$key]) { throw "$key is missing or empty in $EnvFile" }
  $payload[$key] = $values[$key]
}

$tmp = New-TemporaryFile
try {
  $payload | ConvertTo-Json -Compress | Set-Content -Path $tmp -Encoding ascii -NoNewline
  $secretFile = "file://$($tmp.FullName)"

  aws secretsmanager describe-secret --secret-id $SecretName --region $Region --query Name --output text 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) {
    aws secretsmanager put-secret-value --secret-id $SecretName --secret-string $secretFile --region $Region --query VersionId --output text | Out-Null
  } else {
    aws secretsmanager create-secret --name $SecretName --secret-string $secretFile --region $Region --query ARN --output text | Out-Null
  }
  if ($LASTEXITCODE -ne 0) { throw 'AWS CLI call failed' }
  Write-Host "Secret '$SecretName' is up to date in $Region ($($keys.Count) keys)."
} finally {
  Remove-Item $tmp -Force
}
