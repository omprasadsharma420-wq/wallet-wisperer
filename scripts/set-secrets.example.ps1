# Copy this file to set-secrets.ps1, fill the values, then run it.
# Do not commit the filled-in copy.

$ErrorActionPreference = "Stop"

& "$PSScriptRoot\supabase.ps1" secrets set OPENAI_API_KEY="sk-your-openai-key"
& "$PSScriptRoot\supabase.ps1" secrets set OPENAI_MODEL="gpt-4.1-mini"
