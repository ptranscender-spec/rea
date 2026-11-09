@echo off
chcp 65001 >nul
title Editor de Video
cd /d "%~dp0"
echo.
echo  ==== Editor de Video ====
echo.

where py >nul 2>nul && (set PY=py -3) || (set PY=python)
%PY% --version >nul 2>nul
if errorlevel 1 (
  echo  O Python nao esta instalado. Instalando pelo winget...
  winget install -e --id Python.Python.3.12 --accept-source-agreements --accept-package-agreements
  echo.
  echo  Feche esta janela e abra o iniciar.bat de novo.
  pause & exit /b
)

where ffmpeg >nul 2>nul
if errorlevel 1 (
  echo  O ffmpeg nao esta instalado. Instalando pelo winget...
  winget install -e --id Gyan.FFmpeg --accept-source-agreements --accept-package-agreements
  echo.
  echo  Feche esta janela e abra o iniciar.bat de novo.
  pause & exit /b
)

if not exist ".venv\Scripts\python.exe" (
  echo  Primeira vez: preparando o aplicativo ^(alguns minutos^)...
  %PY% -m venv .venv
  ".venv\Scripts\python.exe" -m pip install --upgrade pip >nul
  ".venv\Scripts\python.exe" -m pip install -r requirements.txt
  if errorlevel 1 ( echo  Falha na instalacao. Verifique a internet e tente de novo. & pause & exit /b )
)

".venv\Scripts\python.exe" servidor.py
pause
