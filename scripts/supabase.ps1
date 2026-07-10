param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $SupabaseArgs
)

$ErrorActionPreference = "Stop"

$runtimeRoot = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies"
$nodeBin = Join-Path $runtimeRoot "node\bin"
$bin = Join-Path $runtimeRoot "bin"
$pnpm = Join-Path $bin "pnpm.cmd"

if (!(Test-Path -LiteralPath $pnpm)) {
  throw "Bundled pnpm was not found at $pnpm"
}

$env:PATH = "$nodeBin;$bin;$env:PATH"
& $pnpm dlx supabase @SupabaseArgs
