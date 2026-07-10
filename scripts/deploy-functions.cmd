@echo off
setlocal
call "%~dp0supabase.cmd" functions deploy health --use-api || exit /b 1
call "%~dp0supabase.cmd" functions deploy parse-transaction --use-api || exit /b 1
call "%~dp0supabase.cmd" functions deploy create-draft --use-api || exit /b 1
call "%~dp0supabase.cmd" functions deploy confirm-drafts --use-api || exit /b 1
call "%~dp0supabase.cmd" functions deploy close-day --use-api || exit /b 1
call "%~dp0supabase.cmd" functions deploy generate-report --use-api || exit /b 1
call "%~dp0supabase.cmd" functions deploy inbound-email --use-api || exit /b 1
call "%~dp0supabase.cmd" functions deploy nightly-review --use-api || exit /b 1
call "%~dp0supabase.cmd" functions deploy generate-recurring-drafts --use-api || exit /b 1
endlocal
