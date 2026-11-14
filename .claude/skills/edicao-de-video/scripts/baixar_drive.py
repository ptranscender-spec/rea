#!/usr/bin/env python3
"""Baixa um arquivo do Google Drive a partir do link de compartilhamento ("qualquer pessoa com o link").
Uso: python3 baixar_drive.py "https://drive.google.com/file/d/ID/view?usp=sharing" pasta_destino/
"""
import re
import shutil
import sys
import urllib.request
import os

link, destino = sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "."
m = re.search(r"/d/([A-Za-z0-9_-]{20,})", link) or re.search(r"[?&]id=([A-Za-z0-9_-]{20,})", link)
if not m:
    sys.exit("Não achei o ID do arquivo no link.")
fid = m.group(1)
url = f"https://drive.usercontent.google.com/download?id={fid}&export=download&confirm=t"
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
with urllib.request.urlopen(req, timeout=600) as r:
    tipo = r.headers.get("Content-Type", "")
    if "text/html" in tipo:
        sys.exit("O Drive devolveu uma página em vez do arquivo: confira se o compartilhamento está "
                 "como 'Qualquer pessoa com o link'.")
    nome = re.search(r'filename="?([^";]+)', r.headers.get("Content-Disposition", "")) 
    nome = nome.group(1) if nome else f"{fid}.mp4"
    os.makedirs(destino, exist_ok=True)
    caminho = os.path.join(destino, os.path.basename(nome))
    with open(caminho, "wb") as f:
        shutil.copyfileobj(r, f, 1 << 20)
print(caminho, os.path.getsize(caminho) // (1 << 20), "MB")
