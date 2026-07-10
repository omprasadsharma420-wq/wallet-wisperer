@echo off
setlocal

if "%SUPABASE_PROJECT_REF%"=="" set "SUPABASE_PROJECT_REF=lzbtttgggoxumbcjqqsu"

echo Linking Supabase project %SUPABASE_PROJECT_REF%...
if not "%SUPABASE_DB_PASSWORD%"=="" (
  call "%~dp0supabase.cmd" link --project-ref "%SUPABASE_PROJECT_REF%" --password "%SUPABASE_DB_PASSWORD%" || exit /b 1
) else (
  call "%~dp0supabase.cmd" link --project-ref "%SUPABASE_PROJECT_REF%" || exit /b 1
)

echo Applying database migrations...
call "%~dp0supabase.cmd" db push || exit /b 1

if not "%OPENAI_API_KEY%"=="" (
  echo Setting OPENAI_API_KEY...
  call "%~dp0supabase.cmd" secrets set OPENAI_API_KEY="%OPENAI_API_KEY%" || exit /b 1
) else (
  echo Skipping OPENAI_API_KEY because the environment variable is not set.
)

if "%OPENAI_MODEL%"=="" set "OPENAI_MODEL=gpt-4.1-mini"
echo Setting OPENAI_MODEL...
call "%~dp0supabase.cmd" secrets set OPENAI_MODEL="%OPENAI_MODEL%" || exit /b 1

if not "%INBOUND_EMAIL_SECRET%"=="" (
  echo Setting INBOUND_EMAIL_SECRET...
  call "%~dp0supabase.cmd" secrets set INBOUND_EMAIL_SECRET="%INBOUND_EMAIL_SECRET%" || exit /b 1
) else (
  echo Skipping INBOUND_EMAIL_SECRET because the environment variable is not set.
)

echo Deploying Edge Functions...
call "%~dp0deploy-functions.cmd" || exit /b 1

echo Deploy complete.
endlocal
