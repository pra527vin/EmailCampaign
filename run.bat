@echo off
rem ===========================================================================
rem  MailStrive launcher
rem
rem    run.bat          start in development mode (hot reload)
rem    run.bat prod     build once, then run the compiled output
rem    run.bat stop     close the API / worker / web windows
rem    run.bat help     show usage
rem
rem  Does everything needed to go from a fresh clone to a running system:
rem  checks Node, creates .env with generated secrets, installs dependencies,
rem  generates the Prisma client, applies migrations, seeds the first admin,
rem  then launches the API, the email worker and the dashboard.
rem ===========================================================================

setlocal EnableExtensions EnableDelayedExpansion
title MailStrive launcher
cd /d "%~dp0"

set "PREFLIGHT=%TEMP%\mailstrive_preflight.cmd"
set "MODE=dev"

if /i "%~1"=="prod"   set "MODE=prod"
if /i "%~1"=="stop"   goto :stop
if /i "%~1"=="help"   goto :usage
if /i "%~1"=="--help" goto :usage
if /i "%~1"=="/?"     goto :usage

echo.
echo  ===========================================================
echo    MailStrive  -  starting in %MODE% mode
echo  ===========================================================
echo.

rem ---------------------------------------------------------------- 1. Node --
echo [1/7] Checking Node.js...
where node >nul 2>nul
if errorlevel 1 goto :err_no_node

for /f "tokens=1 delims=." %%v in ('node -v') do set "NODE_MAJOR=%%v"
set "NODE_MAJOR=!NODE_MAJOR:v=!"
if !NODE_MAJOR! LSS 20 goto :err_old_node
for /f "delims=" %%v in ('node -v') do echo       Node %%v  OK

rem ----------------------------------------------------------------- 2. env --
echo [2/7] Checking configuration...
if exist ".env" goto :env_ready
if not exist ".env.example" goto :err_no_example

echo       No .env found - creating one from .env.example
echo       and generating AUTH_SECRET and UNSUBSCRIBE_SECRET...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; function New-Secret { $b=[byte[]]::new(48); [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); return [Convert]::ToBase64String($b).TrimEnd('=').Replace('+','-').Replace('/','_') }; $t=Get-Content '.env.example' -Raw; $t=$t -replace 'AUTH_SECRET=.*', ('AUTH_SECRET=' + (New-Secret)); $t=$t -replace 'UNSUBSCRIBE_SECRET=.*', ('UNSUBSCRIBE_SECRET=' + (New-Secret)); Set-Content -Path '.env' -Value $t -Encoding UTF8; Write-Host '      Created .env with fresh secrets'"
if errorlevel 1 goto :err_env_create
echo.
echo       ^>^> Open .env and set your Amazon SES values before sending
echo          real email: AWS_REGION, AWS_ACCESS_KEY_ID,
echo          AWS_SECRET_ACCESS_KEY and SES_FROM_EMAIL.
echo          Until then leave SES_SANDBOX_DRY_RUN=true.
echo.

:env_ready

rem -------------------------------------------------------- 3. dependencies --
echo [3/7] Checking dependencies...
if exist "node_modules\.package-lock.json" goto :deps_ready
echo       Installing npm packages - this takes a few minutes the first time...
call npm install --no-audit --no-fund
if errorlevel 1 goto :err_npm_install
goto :deps_done

:deps_ready
echo       Dependencies present
:deps_done

rem ------------------------------------------------------------ 4. services --
echo [4/7] Checking PostgreSQL and Redis...
if exist "%PREFLIGHT%" del "%PREFLIGHT%" >nul 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $cfg=@{}; foreach($line in Get-Content '.env'){ if($line -match '^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$'){ $cfg[$matches[1]]=$matches[2].Trim() } }; function Test-Port($h,$p){ try { $c=New-Object Net.Sockets.TcpClient; $ok=$c.ConnectAsync($h,$p).Wait(2500); $c.Close(); return $ok } catch { return $false } }; function Get-Target($raw,$fallbackPort){ try { $u=[uri]$raw; $h=$u.Host; $p=$u.Port; if(-not $h){ $h='localhost' }; if($p -le 0){ $p=$fallbackPort }; return @($h,$p) } catch { return @('localhost',$fallbackPort) } }; $db=Get-Target $cfg['DATABASE_URL'] 5432; $rd=Get-Target $cfg['REDIS_URL'] 6379; $apiPort=$cfg['API_PORT']; if(-not $apiPort){ $apiPort='4000' }; $appUrl=$cfg['APP_URL']; if(-not $appUrl){ $appUrl='http://localhost:3000' }; $dry=$cfg['SES_SANDBOX_DRY_RUN']; if(-not $dry){ $dry='false' }; $admin=$cfg['SEED_ADMIN_EMAIL']; if(-not $admin){ $admin='(unset)' }; $lines=@(); $lines+='set PG_HOST=' + $db[0]; $lines+='set PG_PORT=' + $db[1]; $lines+='set RD_HOST=' + $rd[0]; $lines+='set RD_PORT=' + $rd[1]; $lines+='set API_PORT=' + $apiPort; $lines+='set APP_URL=' + $appUrl; $lines+='set DRY_RUN=' + $dry; $lines+='set ADMIN_EMAIL=' + $admin; if(Test-Port $db[0] ([int]$db[1])){ $lines+='set PG_OK=1' } else { $lines+='set PG_OK=0' }; if(Test-Port $rd[0] ([int]$rd[1])){ $lines+='set RD_OK=1' } else { $lines+='set RD_OK=0' }; Set-Content -Path (Join-Path $env:TEMP 'mailstrive_preflight.cmd') -Value $lines -Encoding ASCII"
if errorlevel 1 goto :err_preflight
if not exist "%PREFLIGHT%" goto :err_preflight
call "%PREFLIGHT%"

if "!PG_OK!"=="1" goto :pg_ok
echo.
echo   [X] PostgreSQL is not reachable at !PG_HOST!:!PG_PORT!
echo.
echo       DATABASE_URL in .env points there. Either start PostgreSQL,
echo       or edit DATABASE_URL to match where it is actually running.
echo.
echo       Not installed yet? Get it from:
echo         https://www.postgresql.org/download/windows/
echo       Then create the database and role:
echo         createdb mailstrive
echo         psql -c "CREATE ROLE mailstrive LOGIN PASSWORD 'mailstrive' SUPERUSER;"
echo.
echo       The schema needs the citext extension, which ships with the
echo       standard Windows installer. run.bat enables it during migration.
echo.
goto :fail

:pg_ok
echo       PostgreSQL at !PG_HOST!:!PG_PORT!  OK

if "!RD_OK!"=="1" goto :rd_ok
echo.
echo   [X] Redis is not reachable at !RD_HOST!:!RD_PORT!
echo.
echo       The email worker uses Redis for its job queue; campaigns
echo       cannot send without it.
echo.
echo       On Windows, use Memurai (a native Redis-compatible server):
echo         https://www.memurai.com/get-memurai
echo       or run Redis inside WSL:
echo         wsl sudo service redis-server start
echo.
goto :fail

:rd_ok
echo       Redis at !RD_HOST!:!RD_PORT!  OK

rem -------------------------------------------------------------- 5. schema --
echo [5/7] Preparing the database...
call npx prisma generate --schema prisma/schema.prisma
if errorlevel 1 goto :err_prisma_generate

call npx prisma migrate deploy --schema prisma/schema.prisma
if errorlevel 1 goto :err_migrate
echo       Schema up to date

rem ---------------------------------------------------------------- 6. seed --
echo [6/7] Ensuring the admin account exists...
call npm run seed
if errorlevel 1 goto :err_seed

rem -------------------------------------------------------------- 7. launch --
echo [7/7] Starting services...

rem Children inherit this, so the dashboard proxies to the configured API port.
set "BACKEND_INTERNAL_URL=http://localhost:!API_PORT!"

if /i "%MODE%"=="prod" goto :launch_prod

start "MailStrive API"    cmd /k "npm run dev:api"
start "MailStrive Worker" cmd /k "npm run dev:worker"
start "MailStrive Web"    cmd /k "npm run dev:web"
goto :launched

:launch_prod
echo       Building all packages...
call npm run build
if errorlevel 1 goto :err_build
start "MailStrive API"    cmd /k "npm run start:api"
start "MailStrive Worker" cmd /k "npm run start:worker"
start "MailStrive Web"    cmd /k "npm run start --workspace @mailstrive/frontend"

:launched
echo.
echo  ===========================================================
echo    Running.  Three windows have opened - one per service.
echo.
echo      Dashboard   !APP_URL!
echo      API         http://localhost:!API_PORT!
echo      Sign in as  !ADMIN_EMAIL!
echo                  (password: SEED_ADMIN_PASSWORD in .env)
echo.
if /i "!DRY_RUN!"=="true" echo    NOTE: SES_SANDBOX_DRY_RUN=true - messages are composed
if /i "!DRY_RUN!"=="true" echo          and recorded, but never handed to Amazon SES.
if /i "!DRY_RUN!"=="true" echo.
echo      Stop everything with:  run.bat stop
echo  ===========================================================
echo.

echo  Waiting for the dashboard to come up...
rem The first Next.js dev compile is slow; give it a moment before opening.
timeout /t 12 /nobreak >nul
start "" "!APP_URL!"

echo  Launcher done. This window can be closed.
echo.
pause
endlocal
exit /b 0

rem =========================================================== stop / usage ==
:stop
echo.
echo  Stopping MailStrive services...
taskkill /FI "WINDOWTITLE eq MailStrive API*"    /T /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq MailStrive Worker*" /T /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq MailStrive Web*"    /T /F >nul 2>nul
echo  Done. PostgreSQL and Redis were left running.
echo.
endlocal
exit /b 0

:usage
echo.
echo  Usage:
echo     run.bat            Start in development mode (hot reload)
echo     run.bat prod       Build once, then run the compiled output
echo     run.bat stop       Close the API / worker / web windows
echo     run.bat help       Show this message
echo.
echo  Requires Node 20+, PostgreSQL and Redis running locally.
echo  Configuration is read from .env - created automatically on first run.
echo.
endlocal
exit /b 0

rem ====================================================================== ==
rem  Failures. Each one says what to do next rather than just an error code.
rem ==========================================================================
:err_no_node
echo.
echo   [X] Node.js was not found on PATH.
echo       Install the LTS build from https://nodejs.org/ (version 20 or newer),
echo       then open a new terminal and run this script again.
goto :fail

:err_old_node
echo.
echo   [X] Node !NODE_MAJOR! is too old - this project needs Node 20 or newer.
echo       Upgrade from https://nodejs.org/ and run this script again.
goto :fail

:err_no_example
echo.
echo   [X] Neither .env nor .env.example was found.
echo       Run this script from the project root directory.
goto :fail

:err_env_create
echo.
echo   [X] Could not create .env.
echo       Copy .env.example to .env by hand and fill in AUTH_SECRET
echo       and UNSUBSCRIBE_SECRET with long random strings.
goto :fail

:err_npm_install
echo.
echo   [X] npm install failed.
echo       Check your network connection and proxy settings, then retry.
goto :fail

:err_preflight
echo.
echo   [X] Could not read .env or test the database and Redis connections.
echo       Check that .env is present and well formed.
goto :fail

:err_prisma_generate
echo.
echo   [X] prisma generate failed.
echo       Check DATABASE_URL in .env and that prisma/schema.prisma is intact.
goto :fail

:err_migrate
echo.
echo   [X] Applying migrations failed.
echo       Most often this means the database or role in DATABASE_URL does
echo       not exist yet, or the role cannot create the citext extension.
echo       Creating the role as SUPERUSER, or running
echo         CREATE EXTENSION IF NOT EXISTS citext;
echo       once as a superuser, resolves it.
goto :fail

:err_seed
echo.
echo   [X] Seeding the admin account failed.
echo       SEED_ADMIN_EMAIL must be a valid address and
echo       SEED_ADMIN_PASSWORD must be at least 12 characters.
goto :fail

:err_build
echo.
echo   [X] The production build failed.
echo       Run "npm run verify" to see the errors in full.
goto :fail

:fail
echo.
echo  Startup aborted - nothing was launched.
echo.
pause
endlocal
exit /b 1
