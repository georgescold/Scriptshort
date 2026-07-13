@echo off
title Scriptshort
cd /d "%~dp0"

REM ============================================================
REM   Lanceur Scriptshort - double-clique sur ce fichier
REM ============================================================

REM --- S'assurer que FFmpeg est dans le PATH (sinon le chercher) ---
where ffmpeg >nul 2>nul
if errorlevel 1 (
  for /d %%D in ("%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg*") do (
    for /d %%B in ("%%D\ffmpeg-*") do (
      if exist "%%B\bin\ffmpeg.exe" set "PATH=%%B\bin;%PATH%"
    )
  )
)

REM --- Verifier Node.js ---
where node >nul 2>nul
if errorlevel 1 (
  echo [ERREUR] Node.js est introuvable.
  echo Installe-le depuis https://nodejs.org puis relance ce fichier.
  echo.
  pause
  exit /b 1
)

REM --- Deja en cours ? Alors on ouvre juste le navigateur ---
netstat -ano | findstr "LISTENING" | findstr ":3000 " >nul
if not errorlevel 1 (
  echo Scriptshort tourne deja. Ouverture du navigateur...
  start "" http://localhost:3000
  exit /b 0
)

REM --- Installer les dependances Node au premier lancement ---
if not exist "node_modules" (
  echo Premiere utilisation : installation des dependances Node...
  call npm install
)

echo.
echo ==========================================================
echo    Scriptshort demarre !
echo    - Le navigateur va s'ouvrir sur http://localhost:3000
echo    - LAISSE CETTE FENETRE OUVERTE pendant l'utilisation
echo    - Ferme cette fenetre pour arreter le programme
echo ==========================================================
echo.

REM --- Ouvrir le navigateur apres 3 secondes (en parallele) ---
start "" cmd /c "timeout /t 3 >nul & start http://localhost:3000"

REM --- Lancer le serveur (reste au premier plan) ---
node server.js

echo.
echo Le serveur s'est arrete. Tu peux fermer cette fenetre.
pause
