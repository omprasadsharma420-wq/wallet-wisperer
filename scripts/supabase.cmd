@echo off
setlocal
set "RUNTIME_ROOT=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies"
set "PATH=%RUNTIME_ROOT%\node\bin;%RUNTIME_ROOT%\bin;%PATH%"
"%RUNTIME_ROOT%\bin\pnpm.cmd" dlx supabase %*
endlocal
