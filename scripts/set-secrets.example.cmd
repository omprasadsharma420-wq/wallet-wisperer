@echo off
rem Copy this file to set-secrets.cmd, fill the values, then run it.
rem Do not commit the filled-in copy.

call "%~dp0supabase.cmd" secrets set OPENAI_API_KEY="sk-your-openai-key" || exit /b 1
call "%~dp0supabase.cmd" secrets set OPENAI_MODEL="gpt-4.1-mini" || exit /b 1
call "%~dp0supabase.cmd" secrets set INBOUND_EMAIL_SECRET="replace-with-a-long-random-string" || exit /b 1
