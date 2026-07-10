$ErrorActionPreference = "Stop"

$functions = @(
  "health",
  "parse-transaction",
  "create-draft",
  "confirm-drafts",
  "close-day",
  "generate-report",
  "inbound-email",
  "nightly-review",
  "generate-recurring-drafts"
)

foreach ($function in $functions) {
  & "$PSScriptRoot\supabase.ps1" functions deploy $function --use-api
}
