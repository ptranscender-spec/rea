#!/bin/bash
# Editor de Vídeo — Linux: bash iniciar.sh
cd "$(dirname "$0")"
echo; echo " ==== Editor de Vídeo ===="; echo
if ! command -v python3 >/dev/null; then
  echo " O Python 3 não está instalado. Abrindo a página de download..."
  echo " Instale com: sudo apt install python3 python3-venv"; exit 1
fi
if ! command -v ffmpeg >/dev/null; then
  echo " Instalando o ffmpeg..."; sudo apt-get install -y ffmpeg || { echo " Instale o ffmpeg e rode de novo."; exit 1; }
fi
if [ ! -x .venv/bin/python ]; then
  echo " Primeira vez: preparando o aplicativo (alguns minutos)..."
  python3 -m venv .venv && .venv/bin/python -m pip install --upgrade pip >/dev/null &&
  .venv/bin/python -m pip install -r requirements.txt || { echo " Falha na instalação."; read -r; exit 1; }
fi
exec .venv/bin/python servidor.py
