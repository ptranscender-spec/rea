#!/usr/bin/env python3
"""Editor de Vídeo — aplicativo local (abre no navegador).

Roda os motores da skill de edição (editar_conversa.py e post_para_video.py) a partir de
uma tela simples, sem IA e sem gastar tokens. Os vídeos ficam em ~/EditorDeVideo.

Uso: python3 servidor.py   (ou os atalhos iniciar.bat / iniciar.command / iniciar.sh)
"""
from __future__ import annotations

import hashlib
import json
import os
import queue
import re
import shutil
import subprocess
import sys
import threading
import time
import uuid
import webbrowser

from flask import Flask, abort, jsonify, request, send_file, send_from_directory

AQUI = os.path.dirname(os.path.abspath(__file__))
CANDIDATOS_MOTOR = [
    os.path.join(AQUI, "motor"),
    os.path.join(AQUI, "..", ".claude", "skills", "edicao-de-video", "scripts"),
]
MOTOR = next((os.path.abspath(p) for p in CANDIDATOS_MOTOR
              if os.path.exists(os.path.join(p, "editar_conversa.py"))), None)
if not MOTOR:
    sys.exit("Não encontrei a pasta 'motor' com editar_conversa.py.")

BASE = os.environ.get("EDITOR_PASTA", os.path.join(os.path.expanduser("~"), "EditorDeVideo"))
TRABALHOS = os.path.join(BASE, "trabalhos")
CACHE = os.path.join(BASE, "cache_transcricoes")
for p in (TRABALHOS, CACHE):
    os.makedirs(p, exist_ok=True)

app = Flask(__name__, static_folder=os.path.join(AQUI, "web"), static_url_path="/static")
app.config["MAX_CONTENT_LENGTH"] = 8 * 1024 ** 3  # até 8 GB por envio

FILA: "queue.Queue[str]" = queue.Queue()
JOBS: dict[str, dict] = {}
TRAVA = threading.Lock()


# --------------------------------------------------------------------------- utilidades

def nome_seguro(nome: str) -> str:
    base, ext = os.path.splitext(os.path.basename(nome or "arquivo"))
    base = re.sub(r"[^A-Za-z0-9_-]+", "_", base)[:40] or "arquivo"
    return base + re.sub(r"[^A-Za-z0-9.]", "", ext.lower())[:6]


def salvar_upload(campo: str, pasta: str) -> str | None:
    f = request.files.get(campo)
    if not f or not f.filename:
        return None
    destino = os.path.join(pasta, nome_seguro(f.filename))
    f.save(destino)
    return destino


def impressao_digital(path: str) -> str:
    """Identifica o vídeo (para reaproveitar a transcrição) sem ler o arquivo inteiro."""
    h = hashlib.sha1(str(os.path.getsize(path)).encode())
    with open(path, "rb") as f:
        h.update(f.read(8 * 1024 * 1024))
    return h.hexdigest()[:20]


def novo_job(tipo: str, titulo: str) -> tuple[str, str]:
    jid = time.strftime("%Y%m%d-%H%M%S-") + uuid.uuid4().hex[:5]
    pasta = os.path.join(TRABALHOS, jid)
    os.makedirs(pasta)
    with TRAVA:
        JOBS[jid] = {"id": jid, "tipo": tipo, "titulo": titulo, "estado": "na fila", "progresso": 0,
                     "etapa": "Aguardando", "log": [], "pasta": pasta, "criado": time.time()}
    return jid, pasta


# --------------------------------------------------------------------------- execução

def executar(jid: str) -> None:
    job = JOBS[jid]
    job["estado"] = "processando"
    job["etapa"] = "Começando"
    env = dict(os.environ, PYTHONUNBUFFERED="1", PYTHONIOENCODING="utf-8")
    try:
        if job.get("antes"):
            job["antes"]()
        proc = subprocess.Popen(job["cmd"], cwd=job["pasta"], stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                env=env, text=True, encoding="utf-8", errors="replace", bufsize=1)
        job["pid"] = proc.pid
        buf = ""
        while True:
            ch = proc.stdout.read(1)
            if not ch:
                break
            if ch in "\r\n":
                linha = buf.strip()
                buf = ""
                if not linha:
                    continue
                m = re.search(r"\[(?:conversa|post)\]\s+(\d+(?:\.\d+)?)%", linha)
                if m:
                    job["progresso"] = float(m.group(1))
                    continue
                if re.match(r"(frame|size)=", linha) or "bitrate=" in linha:
                    continue
                job["log"].append(linha)
                job["log"] = job["log"][-200:]
                msg = re.sub(r"^\[(conversa|post)\]\s*", "", linha)
                if linha.startswith("[") and len(msg) < 140:
                    job["etapa"] = msg
            else:
                buf += ch
        proc.wait()
        if job.get("depois"):
            job["depois"]()
        if proc.returncode == 0 and os.path.exists(job["saida"]):
            job["estado"] = "pronto"
            job["progresso"] = 100
            job["etapa"] = "Pronto!"
        elif job.get("cancelado"):
            job["estado"] = "cancelado"
            job["etapa"] = "Cancelado"
        else:
            job["estado"] = "erro"
            ult = [l for l in job["log"] if l.strip()][-3:]
            job["etapa"] = "Erro: " + (" | ".join(ult) or "falha desconhecida")
    except Exception as e:  # noqa: BLE001
        job["estado"] = "erro"
        job["etapa"] = f"Erro: {e}"
    with open(os.path.join(job["pasta"], "log.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(job["log"]))


def trabalhador() -> None:
    while True:
        jid = FILA.get()
        if JOBS.get(jid, {}).get("cancelado"):
            continue
        executar(jid)


# --------------------------------------------------------------------------- rotas

@app.get("/")
def inicio():
    return send_from_directory(app.static_folder, "index.html")


@app.post("/api/editar")
def api_editar():
    titulo = request.form.get("titulo_job") or "Vídeo"
    jid, pasta = novo_job("editar", titulo)
    video = salvar_upload("video", pasta)
    if not video:
        shutil.rmtree(pasta, ignore_errors=True)
        JOBS.pop(jid, None)
        return jsonify(erro="Envie um vídeo."), 400
    o = json.loads(request.form.get("opcoes") or "{}")
    previa = bool(o.get("previa"))
    saida = os.path.join(pasta, "previa.mp4" if previa else "video_editado.mp4")
    cmd = [sys.executable, os.path.join(MOTOR, "editar_conversa.py"), video, "-o", saida]

    if o.get("formato") in ("vertical", "quadrado", "horizontal"):
        cmd += ["--formato", o["formato"]]
    if o.get("dinamico"):
        cmd.append("--dinamico")
    if o.get("cortar_pausas"):
        cmd.append("--cortar-pausas")
    if o.get("efeitos"):
        cmd.append("--efeitos")
    if o.get("maiusculas"):
        cmd.append("--maiusculas")
    if o.get("estilo_legenda") == "caixa":
        cmd += ["--estilo-legenda", "caixa"]
    if re.fullmatch(r"#[0-9A-Fa-f]{6}", o.get("cor") or ""):
        cmd += ["--cor-destaque", o["cor"]]
    if (o.get("titulo") or "").strip():
        cmd += ["--titulo", o["titulo"].strip()[:120]]
    nomes = [n.strip()[:60] for n in o.get("nomes", []) if n.strip()]
    cargos = [c.strip()[:60] for c in o.get("cargos", [])][: len(nomes)]
    if nomes:
        cmd += ["--nomes", *nomes]
        if any(cargos):
            cmd += ["--cargos", *cargos]
    if o.get("voz") in ("leve", "media", "forte"):
        cmd += ["--voz", o["voz"]]
    if o.get("zoom"):
        cmd += ["--zoom", str(float(o["zoom"]))]
    if o.get("transicao") in ("zoom", "fade", "corte"):
        cmd += ["--transicao", o["transicao"]]
    if o.get("modelo") in ("base", "small", "medium", "large-v3"):
        cmd += ["--modelo", o["modelo"]]

    legenda = o.get("legenda", "auto")
    srt = salvar_upload("srt", pasta)
    if legenda == "nenhuma":
        cmd += ["--legenda", "nenhuma"]
    elif srt:
        cmd += ["--legenda", srt]

    musica_modo = o.get("musica", "gerada")
    musica = salvar_upload("musica", pasta)
    if musica_modo == "nenhuma":
        cmd.append("--sem-musica")
    elif musica:
        cmd += ["--musica", musica]
    if o.get("volume_musica") is not None:
        cmd += ["--volume-musica", str(float(o["volume_musica"]))]

    # imagens de apoio (B-roll)
    itens = []
    for i, b in enumerate(o.get("broll", [])):
        arq = salvar_upload(f"broll_{i}", pasta)
        if arq and (b.get("palavra") or "").strip():
            itens.append({"arquivo": arq, "palavra": b["palavra"].strip(), "duracao": float(b.get("duracao") or 2.5),
                          "estilo": "janela" if b.get("estilo") == "janela" else "tela-cheia"})
    if itens:
        jb = os.path.join(pasta, "broll.json")
        json.dump(itens, open(jb, "w", encoding="utf-8"), ensure_ascii=False)
        cmd += ["--broll", jb]

    if previa:
        cmd += ["--trecho", f"0-{int(o.get('previa_segundos') or 30)}", "--preset", "veryfast"]

    # reaproveita a transcrição do mesmo vídeo (economiza minutos nas rodadas seguintes)
    analise = os.path.splitext(saida)[0] + "_analise"
    chave = impressao_digital(video)
    cache = os.path.join(CACHE, chave + ".json")

    def antes():
        if legenda == "auto" and not srt and os.path.exists(cache) and not previa:
            os.makedirs(analise, exist_ok=True)
            shutil.copy(cache, os.path.join(analise, "transcricao.json"))

    def depois():
        t = os.path.join(analise, "transcricao.json")
        if os.path.exists(t) and not previa:
            shutil.copy(t, cache)

    JOBS[jid].update(cmd=cmd, saida=saida, antes=antes, depois=depois, analise=analise, previa=previa)
    json.dump({"opcoes": o, "comando": cmd}, open(os.path.join(pasta, "pedido.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    FILA.put(jid)
    return jsonify(id=jid)


@app.post("/api/post")
def api_post():
    titulo = request.form.get("titulo_job") or "Post"
    jid, pasta = novo_job("post", titulo)
    imagem = salvar_upload("imagem", pasta)
    if not imagem:
        shutil.rmtree(pasta, ignore_errors=True)
        JOBS.pop(jid, None)
        return jsonify(erro="Envie a imagem do post."), 400
    r = json.loads(request.form.get("roteiro") or "{}")
    if not r.get("cenas"):
        return jsonify(erro="Marque pelo menos um bloco de texto."), 400
    r["imagem"] = os.path.basename(imagem)
    jr = os.path.join(pasta, "roteiro.json")
    json.dump(r, open(jr, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    saida = os.path.join(pasta, "post_animado.mp4")
    cmd = [sys.executable, os.path.join(MOTOR, "post_para_video.py"), jr, "-o", saida]
    o = json.loads(request.form.get("opcoes") or "{}")
    if o.get("formato") in ("vertical", "quadrado", "4x5"):
        cmd += ["--formato", o["formato"]]
    narr = salvar_upload("narracao", pasta)
    if narr:
        cmd += ["--narracao", narr]
    mus = salvar_upload("musica", pasta)
    if o.get("musica") == "nenhuma":
        cmd.append("--sem-musica")
    elif mus:
        cmd += ["--musica", mus]
    if o.get("sem_efeitos"):
        cmd.append("--sem-efeitos")
    JOBS[jid].update(cmd=cmd, saida=saida)
    FILA.put(jid)
    return jsonify(id=jid)


def publico(job: dict) -> dict:
    d = {k: job[k] for k in ("id", "tipo", "titulo", "estado", "progresso", "etapa", "criado")}
    d["log"] = job["log"][-12:]
    if job["estado"] == "pronto":
        d["video"] = f"/arquivo/{job['id']}/{os.path.basename(job['saida'])}"
        lt = os.path.join(job.get("analise") or os.path.splitext(job["saida"])[0] + "_analise", "linha_do_tempo.png")
        if os.path.exists(lt):
            d["linha_do_tempo"] = f"/arquivo/{job['id']}/{os.path.relpath(lt, job['pasta'])}"
        d["previa"] = bool(job.get("previa"))
    na_fila = [j for j in list(FILA.queue)]
    if job["id"] in na_fila:
        d["posicao_fila"] = na_fila.index(job["id"]) + 1
    return d


@app.get("/api/job/<jid>")
def api_job(jid):
    job = JOBS.get(jid)
    if not job:
        abort(404)
    return jsonify(publico(job))


@app.get("/api/jobs")
def api_jobs():
    return jsonify([publico(j) for j in sorted(JOBS.values(), key=lambda j: -j["criado"])][:30])


@app.post("/api/job/<jid>/cancelar")
def api_cancelar(jid):
    job = JOBS.get(jid)
    if not job:
        abort(404)
    job["cancelado"] = True
    if job.get("pid") and job["estado"] == "processando":
        try:
            if os.name == "nt":
                subprocess.run(["taskkill", "/F", "/T", "/PID", str(job["pid"])], capture_output=True)
            else:
                os.kill(job["pid"], 15)
        except OSError:
            pass
    elif job["estado"] == "na fila":
        job["estado"] = "cancelado"
        job["etapa"] = "Cancelado"
    return jsonify(ok=True)


@app.get("/arquivo/<jid>/<path:nome>")
def arquivo(jid, nome):
    job = JOBS.get(jid)
    if not job:
        abort(404)
    caminho = os.path.realpath(os.path.join(job["pasta"], nome))
    if not caminho.startswith(os.path.realpath(job["pasta"]) + os.sep) or not os.path.isfile(caminho):
        abort(404)
    return send_file(caminho, as_attachment=request.args.get("baixar") == "1")


@app.get("/api/abrir-pasta/<jid>")
def abrir_pasta(jid):
    job = JOBS.get(jid)
    if not job:
        abort(404)
    p = job["pasta"]
    if sys.platform.startswith("win"):
        os.startfile(p)  # type: ignore[attr-defined]
    elif sys.platform == "darwin":
        subprocess.Popen(["open", p])
    else:
        subprocess.Popen(["xdg-open", p], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return jsonify(ok=True)


@app.get("/api/verificar")
def verificar():
    """Checa se as ferramentas necessárias estão instaladas."""
    def tem_mod(m):
        try:
            __import__(m)
            return True
        except ImportError:
            return False
    ff = shutil.which("ffmpeg") is not None
    libass = False
    if ff:
        filtros = subprocess.run(["ffmpeg", "-hide_banner", "-filters"], capture_output=True, text=True).stdout
        libass = " ass " in filtros
    return jsonify(ffmpeg=ff, legendas=libass, opencv=tem_mod("cv2"), transcricao=tem_mod("faster_whisper"),
                   pasta=BASE)


def main() -> None:
    threading.Thread(target=trabalhador, daemon=True).start()
    porta = int(os.environ.get("EDITOR_PORTA", "8770"))
    url = f"http://127.0.0.1:{porta}"
    print(f"\n  Editor de Vídeo aberto em {url}\n  Seus vídeos ficam em {TRABALHOS}\n  (feche esta janela para sair)\n")
    if os.environ.get("EDITOR_SEM_NAVEGADOR") != "1":
        threading.Timer(1.2, lambda: webbrowser.open(url)).start()
    import logging
    logging.getLogger("werkzeug").setLevel(logging.ERROR)   # sem avisos técnicos na janela
    import flask.cli
    flask.cli.show_server_banner = lambda *a, **k: None
    app.run(host="127.0.0.1", port=porta, debug=False, threaded=True)


if __name__ == "__main__":
    main()
