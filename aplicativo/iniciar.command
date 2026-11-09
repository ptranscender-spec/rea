#!/bin/bash
# Editor de Vídeo — macOS: dê dois cliques neste arquivo.
cd "$(dirname "$0")"
echo; echo " ==== Editor de Vídeo ===="; echo
if ! command -v python3 >/dev/null; then
  echo " O Python 3 não está instalado. Abrindo a página de download..."
  open "https://www.python.org/downloads/macos/"; read -r -p " Instale e abra este arquivo de novo. [Enter]"; exit 1
fi
if ! command -v ffmpeg >/dev/null; then
  if command -v brew >/dev/null; then
    echo " Instalando o ffmpeg (Homebrew)..."; brew install ffmpeg
  else
    echo " Falta o ffmpeg. Instale o Homebrew (https://brew.sh) e rode: brew install ffmpeg"
    read -r -p " [Enter] para sair"; exit 1
  fi
fi
if [ ! -x .venv/bin/python ]; then
  echo " Primeira vez: preparando o aplicativo (alguns minutos)..."
  python3 -m venv .venv && .venv/bin/python -m pip install --upgrade pip >/dev/null &&
  .venv/bin/python -m pip install -r requirements.txt || { echo " Falha na instalação."; read -r; exit 1; }
fi
exec .venv/bin/python servidor.py
