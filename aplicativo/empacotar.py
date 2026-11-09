#!/usr/bin/env python3
"""Gera EditorDeVideo.zip pronto para entregar ao cliente (aplicativo + motor da skill)."""
import os
import zipfile

AQUI = os.path.dirname(os.path.abspath(__file__))
MOTOR = os.path.join(AQUI, "..", ".claude", "skills", "edicao-de-video", "scripts")
SAIDA = os.path.join(AQUI, "..", "dist", "EditorDeVideo.zip")
os.makedirs(os.path.dirname(SAIDA), exist_ok=True)

with zipfile.ZipFile(SAIDA, "w", zipfile.ZIP_DEFLATED) as z:
    def add(origem, destino, executavel=False):
        info = zipfile.ZipInfo.from_file(origem, destino)
        if executavel:
            info.external_attr = 0o100755 << 16
        with open(origem, "rb") as f:
            dados = f.read()
        if origem.endswith(".bat"):  # o Windows quer CRLF em arquivos .bat
            dados = dados.replace(b"\r\n", b"\n").replace(b"\n", b"\r\n")
        z.writestr(info, dados, zipfile.ZIP_DEFLATED)
    for nome in ("servidor.py", "requirements.txt", "LEIA-ME.txt", "iniciar.bat", "iniciar.command", "iniciar.sh"):
        add(os.path.join(AQUI, nome), f"EditorDeVideo/{nome}", nome.endswith((".command", ".sh")))
    add(os.path.join(AQUI, "web", "index.html"), "EditorDeVideo/web/index.html")
    for nome in ("editar_conversa.py", "post_para_video.py", "video.sh"):
        add(os.path.join(MOTOR, nome), f"EditorDeVideo/motor/{nome}", nome.endswith(".sh"))
print("Gerado:", os.path.abspath(SAIDA))
