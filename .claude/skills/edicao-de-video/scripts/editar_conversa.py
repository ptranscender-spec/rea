#!/usr/bin/env python3
"""Edição automática de vídeos de conversa (podcast, entrevista, bate-papo).

Recebe um vídeo com uma ou mais pessoas falando e entrega:
  * zoom na pessoa que está falando, alternando com plano aberto, com transições suaves;
  * voz tratada (ruído, graves, presença, compressão, volume padrão de redes);
  * legendas animadas palavra a palavra, com fonte bonita e contorno;
  * nome (e cargo) de cada pessoa em lower third animado;
  * trilha de fundo que abaixa sozinha quando alguém fala;
  * pausas cortadas, zoom "soco" no ritmo das frases e efeitos sonoros (--dinamico);
  * título de abertura animado e colorido (--titulo "sem pagar ~~editor~~");
  * leve correção de cor e nitidez.

Uso básico:
  python3 editar_conversa.py entrada.mp4 -o final.mp4 --nomes "Ana Souza" "Carlos Lima"

Rode com --help para todas as opções. Requer: ffmpeg, numpy, opencv-python-headless
(4.x, que traz o detector de rostos) e, para legendas automáticas, faster-whisper.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
import wave
from dataclasses import dataclass, field

import numpy as np

try:
    import cv2
except ImportError:  # pragma: no cover
    sys.exit("Falta o OpenCV: pip install 'opencv-python-headless<5' numpy")

ANALISE_FPS = 10          # quadros por segundo usados na análise de quem fala
JANELA = 1.0 / ANALISE_FPS


def log(msg: str) -> None:
    print(f"[conversa] {msg}", flush=True)


def run(cmd: list[str], **kw) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, check=True, **kw)


# --------------------------------------------------------------------------- vídeo

@dataclass
class Info:
    w: int
    h: int
    fps: float
    dur: float
    canais: int


def sondar(path: str) -> Info:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries",
         "stream=codec_type,width,height,avg_frame_rate,r_frame_rate,channels:format=duration",
         "-of", "json", path], check=True, capture_output=True, text=True).stdout
    j = json.loads(out)
    v = next((s for s in j["streams"] if s["codec_type"] == "video"), None)
    if not v:
        sys.exit("O arquivo não tem vídeo.")
    a = next((s for s in j["streams"] if s["codec_type"] == "audio"), None)

    def frac(s: str) -> float:
        n, d = (s or "0/1").split("/")
        return float(n) / float(d) if float(d) else 0.0

    fps = frac(v.get("avg_frame_rate")) or frac(v.get("r_frame_rate")) or 30.0
    fps = min(max(round(fps * 1000) / 1000, 12.0), 60.0)
    return Info(int(v["width"]), int(v["height"]), fps, float(j["format"]["duration"]),
                int(a["channels"]) if a else 0)


def ler_quadros(path: str, w: int, h: int, fps: float, gray: bool = False):
    """Gera quadros (numpy) via ffmpeg, já redimensionados para w x h."""
    pix = "gray" if gray else "bgr24"
    # -v quiet: ao parar a leitura antes do fim, o ffmpeg reclamaria de "broken pipe"
    cmd = ["ffmpeg", "-v", "quiet", "-i", path, "-vf", f"fps={fps},scale={w}:{h}:flags=bicubic",
           "-f", "rawvideo", "-pix_fmt", pix, "-"]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, bufsize=10 ** 8)
    tam = w * h * (1 if gray else 3)
    try:
        while True:
            buf = p.stdout.read(tam)
            if len(buf) < tam:
                break
            yield np.frombuffer(buf, np.uint8).reshape((h, w) if gray else (h, w, 3))
    finally:
        p.stdout.close()
        p.wait()


# --------------------------------------------------------------------------- áudio

def ler_wav(path: str) -> tuple[np.ndarray, int]:
    with wave.open(path, "rb") as f:
        sr, ch, n = f.getframerate(), f.getnchannels(), f.getnframes()
        x = np.frombuffer(f.readframes(n), np.int16).astype(np.float32) / 32768.0
    return x.reshape(-1, ch), sr


def escrever_wav(path: str, x: np.ndarray, sr: int) -> None:
    x = np.clip(x, -1, 1)
    if x.ndim == 1:
        x = x[:, None]
    with wave.open(path, "wb") as f:
        f.setnchannels(x.shape[1])
        f.setsampwidth(2)
        f.setframerate(sr)
        f.writeframes((x * 32767).astype("<i2").tobytes())


def rms_por_janela(x: np.ndarray, sr: int, n: int) -> np.ndarray:
    passo = int(sr * JANELA)
    x = x[: passo * min(n, len(x) // passo)]
    r = np.sqrt((x.reshape(-1, passo) ** 2).mean(axis=1) + 1e-12)
    return np.pad(r, (0, max(0, n - len(r))))


def niveis_audio(path: str) -> tuple[float, float]:
    """(nível da fala, nível do ruído de fundo) em dBFS, por janelas de 100 ms."""
    x, sr = ler_wav(path)
    r = rms_por_janela(x.mean(axis=1), sr, len(x) // int(sr * JANELA))
    db = 20 * np.log10(r[r > 1e-7] + 1e-9) if (r > 1e-7).any() else np.array([-60.0])
    return float(np.percentile(db, 90)), float(np.percentile(db, 10))


def tratar_voz(entrada: str, saida: str, modelo_ruido: str | None, intensidade: str,
               fala_db: float, ruido_db: float) -> None:
    """Cadeia de tratamento de voz estilo podcast, ajustada aos níveis medidos do vídeo."""
    nr = {"leve": 8, "media": 14, "forte": 22}[intensidade]
    ganho = float(np.clip(-20 - fala_db, -20, 30))          # fala em ~-20 dBFS antes da cadeia
    piso = float(np.clip(ruido_db + ganho, -75, -25))       # ruído de fundo depois do ganho
    snr = fala_db - ruido_db
    # expansor nas pausas: limiar entre o ruído e a fala, só se houver separação suficiente
    gate = []
    if snr > 12:
        lim = 10 ** ((piso + min(10, snr * 0.4)) / 20)
        faixa = {"leve": 0.2, "media": 0.08, "forte": 0.04}[intensidade]
        gate = [f"agate=threshold={lim:.5f}:ratio=3:range={faixa}:attack=5:release=300:knee=4"]
    filtros = ["aformat=channel_layouts=mono", f"volume={ganho:.1f}dB", "highpass=f=75", "lowpass=f=15000"]
    if modelo_ruido:
        filtros.append(f"arnndn=m='{modelo_ruido}':mix=0.85")
    filtros += [
        f"afftdn=nr={nr}:nf={piso:.0f}:tn=1",             # ruído de fundo (chiado, ar-condicionado)
        *gate,                                            # silencia o chiado entre as frases
        "equalizer=f=250:t=q:w=1.0:g=-2.5",               # tira o "embolado"
        "equalizer=f=3200:t=q:w=1.3:g=2.5",               # presença / inteligibilidade
        "equalizer=f=9000:t=h:w=0.7:g=1.5",               # brilho
        "deesser=i=0.35",                                 # chiado do "s"
        "acompressor=threshold=-21dB:ratio=2.5:attack=10:release=220:makeup=2dB",  # nivela as vozes
        "alimiter=limit=0.95:level=disabled",
        "aformat=channel_layouts=stereo",                 # voz centralizada nos dois lados
    ]
    run(["ffmpeg", "-v", "error", "-y", "-i", entrada, "-vn", "-ar", "48000",
         "-af", ",".join(filtros), saida])


def gerar_trilha(saida: str, dur: float, sr: int = 48000, seed: int = 7) -> None:
    """Trilha ambiente suave e original (pad + arpejo), sem direitos autorais."""
    rng = np.random.default_rng(seed)
    n = int(dur * sr) + sr
    t = np.arange(n) / sr
    bpm = 84
    compasso = 4 * 60 / bpm
    nota = lambda m: 440.0 * 2 ** ((m - 69) / 12)  # noqa: E731
    acordes = [[57, 60, 64, 67, 71], [53, 57, 60, 64, 67], [48, 55, 60, 64, 67], [55, 59, 62, 66, 69]]
    dur_acorde = compasso * 2
    L = np.zeros(n, np.float32)
    R = np.zeros(n, np.float32)
    atk = 1.2
    k = 0
    inicio = 0.0
    while inicio < dur + 1:
        ac = acordes[k % len(acordes)]
        a, b = int(inicio * sr), min(n, int((inicio + dur_acorde + atk) * sr))
        tt = t[a:b] - inicio
        env = np.minimum(1, tt / atk) * np.clip((dur_acorde + atk - tt) / atk, 0, 1)
        for i, m in enumerate(ac):
            f = nota(m)
            for det, pan in ((0.9985, 0.3), (1.0015, 0.7)):
                s = np.sin(2 * np.pi * f * det * tt + rng.uniform(0, 6.28))
                s += 0.18 * np.sin(2 * np.pi * 2 * f * det * tt)
                s *= env * (0.05 if i else 0.07)
                L[a:b] += s * (1 - pan)
                R[a:b] += s * pan
        # arpejo leve em colcheias
        passo = 60 / bpm / 2
        seq = ac[1:] + ac[2:4][::-1]
        for j in range(int(dur_acorde / passo)):
            ini = inicio + j * passo
            a2, b2 = int(ini * sr), min(n, int((ini + 1.2) * sr))
            if a2 >= n:
                break
            tt2 = t[a2:b2] - ini
            f = nota(seq[j % len(seq)] + 12)
            s = np.sin(2 * np.pi * f * tt2) * np.exp(-tt2 * 4.5) * 0.035
            pan = 0.5 + 0.3 * math.sin(j * 0.9)
            L[a2:b2] += s * (1 - pan)
            R[a2:b2] += s * pan
        # grave suave
        a3, b3 = int(inicio * sr), min(n, int((inicio + dur_acorde) * sr))
        tt3 = t[a3:b3] - inicio
        s = np.sin(2 * np.pi * nota(ac[0] - 12) * tt3) * 0.08 * np.minimum(1, tt3 / 0.3) * np.exp(-tt3 * 0.25)
        L[a3:b3] += s
        R[a3:b3] += s
        inicio += dur_acorde
        k += 1
    x = np.stack([L, R], 1)[: int(dur * sr)]
    x /= max(1e-6, np.abs(x).max()) / 0.8
    bruto = saida + ".bruto.wav"
    escrever_wav(bruto, x, sr)
    run(["ffmpeg", "-v", "error", "-y", "-i", bruto, "-af",
         "aecho=0.8:0.6:70|140:0.25|0.15,lowpass=f=9000", saida])
    os.remove(bruto)


def preparar_musica(arquivo: str | None, dur: float, saida: str, lufs: float, tmp: str) -> None:
    fonte = arquivo
    if not fonte:
        fonte = os.path.join(tmp, "trilha_gerada.wav")
        gerar_trilha(fonte, dur)
    fade = max(0.0, dur - 3)
    run(["ffmpeg", "-v", "error", "-y", "-stream_loop", "-1", "-i", fonte, "-t", f"{dur:.3f}",
         "-ac", "2", "-ar", "48000", "-af",
         f"loudnorm=I={lufs}:TP=-3:LRA=7,afade=t=in:d=1.5,afade=t=out:st={fade:.3f}:d=3", saida])


# --------------------------------------------------------------------------- rostos

@dataclass
class Pessoa:
    idx: int
    cx: np.ndarray            # centro x por janela de análise (coordenadas do original)
    cy: np.ndarray
    s: np.ndarray             # tamanho do rosto (lado do quadrado)
    nome: str = ""
    cargo: str = ""

    def em(self, t: float) -> tuple[float, float, float]:
        i = int(np.clip(t / JANELA, 0, len(self.cx) - 1))
        return float(self.cx[i]), float(self.cy[i]), float(self.s[i])


def detectores():
    base = cv2.data.haarcascades
    frontal = cv2.CascadeClassifier(os.path.join(base, "haarcascade_frontalface_default.xml"))
    alt = cv2.CascadeClassifier(os.path.join(base, "haarcascade_frontalface_alt2.xml"))
    perfil = cv2.CascadeClassifier(os.path.join(base, "haarcascade_profileface.xml"))
    if frontal.empty():
        sys.exit("Detector de rostos não encontrado; instale opencv-python-headless<5.")
    return frontal, alt, perfil


def achar_rostos(g: np.ndarray, det) -> list[tuple[float, float, float]]:
    frontal, alt, perfil = det
    h, w = g.shape
    mn = max(24, int(min(w, h) * 0.06))
    g = cv2.equalizeHist(g)
    caixas = []
    for c, img, flip in ((frontal, g, False), (alt, g, False), (perfil, g, False),
                         (perfil, cv2.flip(g, 1), True)):
        for (x, y, ww, hh) in c.detectMultiScale(img, 1.1, 6, minSize=(mn, mn)):
            if flip:
                x = w - x - ww
            caixas.append((x + ww / 2, y + hh / 2, float(ww)))
    # junta caixas sobrepostas
    caixas.sort(key=lambda b: -b[2])
    final: list[tuple[float, float, float]] = []
    for b in caixas:
        if all(math.hypot(b[0] - f[0], b[1] - f[1]) > 0.5 * max(b[2], f[2]) for f in final):
            final.append(b)
    return final


def agrupar_pessoas(dets: list[tuple[float, float, float, float]], w: float, n_forcado: int | None):
    """Agrupa detecções (t, cx, cy, s) em pessoas pela posição horizontal."""
    if not dets:
        return []
    xs = np.array([d[1] for d in dets])
    ordem = np.sort(xs)
    if n_forcado:
        k = n_forcado
    else:
        lacunas = np.diff(ordem) > 0.10 * w
        k = int(lacunas.sum()) + 1
    k = max(1, min(k, len(xs)))
    centros = np.quantile(xs, (np.arange(k) + 0.5) / k)
    for _ in range(30):  # k-means 1D
        rot = np.argmin(np.abs(xs[:, None] - centros[None]), axis=1)
        novos = np.array([xs[rot == j].mean() if (rot == j).any() else centros[j] for j in range(k)])
        if np.allclose(novos, centros):
            break
        centros = novos
    rot = np.argmin(np.abs(xs[:, None] - centros[None]), axis=1)
    grupos = [[d for d, r in zip(dets, rot) if r == j] for j in range(k)]
    total_t = len({d[0] for d in dets})
    # descarta falsos positivos (aparecem em poucos quadros), a menos que o nº tenha sido forçado
    if not n_forcado:
        grupos = [g for g in grupos if len(g) >= 0.2 * total_t]
    grupos.sort(key=lambda g: np.median([d[1] for d in g]))
    return grupos


def serie_suave(grupo, n: int, col: int) -> np.ndarray:
    """Série por janela de análise, mediana móvel de ±3 s, com preenchimento."""
    ts = np.array([d[0] for d in grupo])
    vs = np.array([d[col] for d in grupo])
    out = np.empty(n)
    raio = 3.0
    glob = float(np.median(vs))
    for i in range(n):
        t = i * JANELA
        m = np.abs(ts - t) <= raio
        out[i] = np.median(vs[m]) if m.sum() >= 2 else glob
    # suavização extra para a câmera não "tremer"
    k = int(2.0 / JANELA) | 1
    pad = np.pad(out, (k // 2, k // 2), mode="edge")
    return np.convolve(pad, np.ones(k) / k, mode="valid")


def analisar_video(path: str, info: Info, n_forcado: int | None, pasta: str):
    aw = min(960, info.w)
    ah = int(round(info.h * aw / info.w / 2) * 2)
    esc = info.w / aw
    det = detectores()
    n = int(math.ceil(info.dur / JANELA))
    dets: list[tuple[float, float, float, float]] = []
    quadros_det: list[tuple[float, np.ndarray]] = []
    log(f"Analisando rostos e bocas ({aw}x{ah}, {ANALISE_FPS} qps)...")
    # 1ª passada: detecção de rostos a cada 0,5 s
    for i, g in enumerate(ler_quadros(path, aw, ah, ANALISE_FPS, gray=True)):
        if i % 5 == 0:
            t = i * JANELA
            for cx, cy, s in achar_rostos(g, det):
                dets.append((t, cx, cy, s))
            if i % 50 == 0:
                quadros_det.append((t, g))
    grupos = agrupar_pessoas(dets, aw, n_forcado)
    pessoas = [Pessoa(j, serie_suave(g, n, 1) * esc, serie_suave(g, n, 2) * esc, serie_suave(g, n, 3) * esc)
               for j, g in enumerate(grupos)]
    log(f"Pessoas encontradas: {len(pessoas)}")
    if not pessoas:
        return pessoas, np.zeros((0, n))
    # 2ª passada: movimento da boca (região inferior do rosto) menos movimento da testa
    mov = np.zeros((len(pessoas), n))
    ant = None
    for i, g in enumerate(ler_quadros(path, aw, ah, ANALISE_FPS, gray=True)):
        if i >= n:
            break
        g = cv2.GaussianBlur(g, (3, 3), 0).astype(np.int16)
        if ant is not None:
            d = np.abs(g - ant)
            for p in pessoas:
                cx, cy, s = (v / esc for v in p.em(i * JANELA))
                x0, x1 = int(cx - 0.28 * s), int(cx + 0.28 * s)
                by0, by1 = int(cy + 0.12 * s), int(cy + 0.55 * s)
                ty0, ty1 = int(cy - 0.45 * s), int(cy - 0.15 * s)
                x0, x1 = max(0, x0), min(aw, x1)
                boca = d[max(0, by0):min(ah, by1), x0:x1]
                testa = d[max(0, ty0):min(ah, ty1), x0:x1]
                if boca.size and testa.size:
                    mov[p.idx, i] = max(0.0, boca.mean() - 0.7 * testa.mean())
        ant = g
    salvar_diagnostico(pasta, quadros_det, pessoas, esc)
    return pessoas, mov


def salvar_diagnostico(pasta: str, quadros, pessoas, esc) -> None:
    if not quadros:
        return
    t, g = quadros[len(quadros) // 2]
    img = cv2.cvtColor(g, cv2.COLOR_GRAY2BGR)
    for p in pessoas:
        cx, cy, s = (v / esc for v in p.em(t))
        cv2.rectangle(img, (int(cx - s / 2), int(cy - s / 2)), (int(cx + s / 2), int(cy + s / 2)), (0, 220, 255), 2)
        rot = f"{p.idx + 1}: {p.nome or 'Pessoa ' + str(p.idx + 1)}"
        cv2.putText(img, rot, (int(cx - s / 2), int(cy - s / 2) - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 220, 255), 2)
    cv2.imwrite(os.path.join(pasta, "pessoas.jpg"), img)


# --------------------------------------------------------------------------- quem fala

def zscore(x: np.ndarray, piso: float = 0.0) -> np.ndarray:
    med = np.median(x)
    mad = np.median(np.abs(x - med))
    return (x - med) / max(1.4826 * mad, piso, 1e-6)


def media_movel(x: np.ndarray, seg: float) -> np.ndarray:
    k = max(1, int(seg / JANELA)) | 1
    pad = np.pad(x, [(0, 0)] * (x.ndim - 1) + [(k // 2, k // 2)], mode="edge")
    ker = np.ones(k) / k
    if x.ndim == 1:
        return np.convolve(pad, ker, mode="valid")
    return np.stack([np.convolve(r, ker, mode="valid") for r in pad])


def detectar_fala(audio_analise: str, n: int) -> tuple[np.ndarray, np.ndarray | None]:
    """Retorna máscara de fala por janela e, se houver, a energia L/R (microfones separados)."""
    x, sr = ler_wav(audio_analise)
    mono = x.mean(axis=1)
    r = rms_por_janela(mono, sr, n)
    db = 20 * np.log10(r + 1e-9)
    piso = np.percentile(db, 15)
    teto = np.percentile(db, 95)
    lim = piso + max(6.0, 0.35 * (teto - piso))
    fala = media_movel((db > lim).astype(float), 0.5) > 0.3
    canais = None
    if x.shape[1] >= 2:
        l, rr = rms_por_janela(x[:, 0], sr, n), rms_por_janela(x[:, 1], sr, n)
        if fala.sum() > 10:
            corr = np.corrcoef(l[fala], rr[fala])[0, 1]
            dif = np.abs(20 * np.log10((l[fala] + 1e-9) / (rr[fala] + 1e-9)))
            if corr < 0.85 and np.median(dif) > 4:  # cada pessoa no seu canal
                canais = np.stack([l, rr])
                log("Áudio com um microfone por canal: usando também o volume de cada canal.")
    return fala, canais


def quem_fala(pessoas, mov, fala, canais, n) -> np.ndarray:
    """Rótulo por janela: índice da pessoa, -1 = plano aberto (silêncio/sobreposição)."""
    k = len(pessoas)
    rot = np.full(n, -1)
    if k == 0:
        return rot
    if k == 1:
        rot[fala] = 0
        return rot
    # piso: sem ele, ruído de compressão numa imagem parada vira "movimento" amplificado
    z = np.stack([zscore(media_movel(m, 0.6), piso=0.4) for m in mov])
    if canais is not None and k == 2:
        # um microfone por canal é a pista mais confiável: o vídeo vira desempate
        lr = 20 * np.log10((canais[0] + 1e-9) / (canais[1] + 1e-9))
        z *= 0.35
        z[0] += np.clip(lr / 4, -3, 3)
        z[1] -= np.clip(lr / 4, -3, 3)
    z = media_movel(z, 0.8)
    ordem = np.argsort(-z, axis=0)
    melhor, segundo = ordem[0], ordem[1]
    margem = z[melhor, np.arange(n)] - z[segundo, np.arange(n)]
    ativo = z[melhor, np.arange(n)] > 0.3
    rot = np.where(fala & ativo & (margem > 0.35), melhor, -1)
    return rot


def ler_falantes_manuais(path: str, n: int, k: int) -> np.ndarray:
    rot = np.full(n, -1)
    with open(path, encoding="utf-8") as f:
        for linha in f:
            linha = linha.split("#")[0].strip()
            if not linha:
                continue
            ini, fim, p = [c.strip() for c in linha.replace(";", ",").split(",")[:3]]
            a, b = int(tempo_seg(ini) / JANELA), int(tempo_seg(fim) / JANELA)
            p = int(p) - 1
            rot[a:b] = p if 0 <= p < k else -1
    return rot


def tempo_seg(s: str) -> float:
    partes = [float(p) for p in str(s).replace(",", ".").split(":")]
    v = 0.0
    for p in partes:
        v = v * 60 + p
    return v


# --------------------------------------------------------------------------- planos

@dataclass
class Plano:
    ini: float
    fim: float
    tipo: str          # "aberto" | "close" | "dividido"
    pessoa: int = -1
    nivel: float = 1.0  # aperto extra do zoom ("soco" do modo dinâmico)


def planejar(rot: np.ndarray, k: int, dur: float, min_plano: float, max_close: float,
             abertura: float, vertical: bool) -> list[Plano]:
    n = len(rot)
    # rótulos com memória: silêncios curtos mantêm o plano anterior
    lab = rot.copy()
    ult = -1
    sil = 0
    for i in range(n):
        if lab[i] == -1:
            sil += 1
            if sil * JANELA < 1.6:
                lab[i] = ult
        else:
            sil = 0
            ult = lab[i]
    # segmentos
    segs: list[list] = []
    for i, v in enumerate(lab):
        if segs and segs[-1][2] == v:
            segs[-1][1] = i + 1
        else:
            segs.append([i, i + 1, int(v)])
    # funde segmentos curtos no vizinho mais longo
    mudou = True
    while mudou and len(segs) > 1:
        mudou = False
        j = min(range(len(segs)), key=lambda q: segs[q][1] - segs[q][0])
        if (segs[j][1] - segs[j][0]) * JANELA >= min_plano:
            break
        viz = [q for q in (j - 1, j + 1) if 0 <= q < len(segs)]
        alvo = max(viz, key=lambda q: segs[q][1] - segs[q][0])
        segs[alvo][0] = min(segs[alvo][0], segs[j][0])
        segs[alvo][1] = max(segs[alvo][1], segs[j][1])
        segs.pop(j)
        fundidos = [segs[0]]
        for s in segs[1:]:
            if s[2] == fundidos[-1][2]:
                fundidos[-1][1] = s[1]
            else:
                fundidos.append(s)
        segs = fundidos
        mudou = True
    aberto = "dividido" if (vertical and k >= 2) else "aberto"
    planos: list[Plano] = []
    for a, b, v in segs:
        ini, fim = a * JANELA, min(dur, b * JANELA)
        if v < 0 or k == 0:
            planos.append(Plano(ini, fim, aberto))
            continue
        # closes muito longos: intercala um plano aberto de respiro
        t = ini
        while fim - t > max_close + min_plano:
            planos.append(Plano(t, t + max_close, "close", v))
            corte = min(fim, t + max_close + 2.5)
            planos.append(Plano(t + max_close, corte, aberto))
            t = corte
        if fim - t > 0.05:
            planos.append(Plano(t, fim, "close", v))
    # abre com plano aberto (apresentação)
    if abertura > 0 and planos and k >= 1:
        primeiro_fim = min(abertura, dur)
        novos = [Plano(0, primeiro_fim, aberto)]
        for p in planos:
            if p.fim <= primeiro_fim:
                continue
            if p.ini < primeiro_fim:
                p.ini = primeiro_fim
            novos.append(p)
        planos = novos
    # junta planos iguais consecutivos
    final: list[Plano] = []
    for p in planos:
        if final and final[-1].tipo == p.tipo and final[-1].pessoa == p.pessoa and final[-1].nivel == p.nivel:
            final[-1].fim = p.fim
        else:
            final.append(p)
    if final:
        final[-1].fim = dur
    return final


def alinhar_cortes(planos: list[Plano], palavras: list[dict], tol: float = 0.5) -> list[Plano]:
    """Move cada corte para logo antes do início de uma palavra (nunca corta no meio da fala)."""
    if not palavras or len(planos) < 2:
        return planos
    inicios = np.array([p["inicio"] for p in palavras])
    for i in range(1, len(planos)):
        b = planos[i].ini
        perto = inicios[(inicios > b - tol) & (inicios < b + tol * 0.6)]
        if len(perto):
            nb = float(perto[np.argmin(np.abs(perto - b))]) - 0.06
            if nb - planos[i - 1].ini > 0.6 and planos[i].fim - nb > 0.6:
                planos[i - 1].fim = planos[i].ini = nb
    return planos


def dinamizar(planos: list[Plano], palavras: list[dict], ritmo: float, k: int) -> list[Plano]:
    """Quebra planos longos no início das frases, alternando o aperto do zoom (corte "soco")."""
    if ritmo <= 0:
        return planos
    frases = [f[0]["inicio"] - 0.04 for f in agrupar_frases(palavras, 34, 7)] if palavras else []
    if k == 1 and planos:
        # uma pessoa falando para a câmera: depois da abertura, alterna enquadramentos a cada frase
        variantes = [("close", 1.0), ("aberto", 1.0), ("close", 1.28), ("aberto", 1.22)]
        ini = planos[0].fim if planos[0].tipo == "aberto" and len(planos) > 1 else 0.0
        fim = planos[-1].fim
        cortes = [ini]
        for f in frases:
            if f >= cortes[-1] + ritmo * 0.8 and f <= fim - 1.0:
                cortes.append(f)
        if not frases:
            while cortes[-1] + ritmo <= fim - 1.0:
                cortes.append(cortes[-1] + ritmo)
        cortes.append(fim)
        novos = planos[:1] if ini > 0 else []
        for i, (a, b) in enumerate(zip(cortes, cortes[1:])):
            tipo, nv = variantes[i % len(variantes)]
            novos.append(Plano(a, b, tipo, 0 if tipo == "close" else -1, nv))
        return novos
    niveis = [1.0, 1.3]
    novos: list[Plano] = []
    for pl in planos:
        quebra = pl.tipo == "close" or (pl.tipo == "aberto" and k <= 1)
        if not quebra or pl.fim - pl.ini < ritmo * 1.6:
            novos.append(pl)
            continue
        t, j = pl.ini, 0
        while True:
            alvos = [f for f in frases if t + ritmo * 0.8 <= f <= pl.fim - 1.0]
            if frases:
                prox = alvos[0] if alvos else None
            else:
                prox = t + ritmo if t + ritmo <= pl.fim - 1.0 else None
            if prox is None:
                novos.append(Plano(t, pl.fim, pl.tipo, pl.pessoa, niveis[j % 2]))
                break
            novos.append(Plano(t, prox, pl.tipo, pl.pessoa, niveis[j % 2]))
            t, j = prox, j + 1
    return novos


def tipo_transicao(ant: Plano | None, pl: Plano, modo: str) -> str:
    """'corte', 'zoom' ou 'fade' para a entrada do plano pl."""
    if ant is None or modo == "corte":
        return "corte"
    if ant.tipo == pl.tipo and ant.pessoa == pl.pessoa:
        return "corte"   # mesmo enquadramento com outro aperto: corte seco ("soco")
    if ant.tipo == pl.tipo == "close" or modo == "fade" or "dividido" in (ant.tipo, pl.tipo):
        return "fade"
    return "zoom"


# --------------------------------------------------------------------------- pausas

def detectar_trechos_de_fala(wav: str, palavras: list[dict], pausa_min: float, fps: float,
                             folga: float = 0.12) -> list[tuple[float, float]]:
    """Trechos a manter: fala (áudio + palavras), com pausas menores que pausa_min preservadas."""
    x, sr = ler_wav(wav)
    mono = x.mean(axis=1)
    passo = int(sr * 0.02)
    n = len(mono) // passo
    r = np.sqrt((mono[: n * passo].reshape(n, passo) ** 2).mean(axis=1) + 1e-12)
    db = 20 * np.log10(r)
    piso, teto = np.percentile(db, 10), np.percentile(db, 90)
    fala = db > piso + max(6.0, 0.3 * (teto - piso))
    for p in palavras:
        fala[int(p["inicio"] / 0.02):int(p["fim"] / 0.02) + 1] = True
    dur = n * 0.02
    trechos: list[list[float]] = []
    i = 0
    while i < n:
        if fala[i]:
            j = i
            while j < n and fala[j]:
                j += 1
            a, b = max(0.0, i * 0.02 - folga), min(dur, j * 0.02 + folga)
            if trechos and a - trechos[-1][1] < pausa_min:
                trechos[-1][1] = b
            else:
                trechos.append([a, b])
            i = j
        i += 1
    q = lambda v: round(v * fps) / fps  # noqa: E731  (alinha à grade de quadros)
    return [(q(a), q(b)) for a, b in trechos if q(b) - q(a) >= 0.2]


def mapear_palavras(palavras: list[dict], trechos) -> list[dict]:
    out, acum = [], 0.0
    bases = []
    for a, b in trechos:
        bases.append((a, b, acum))
        acum += b - a
    for p in palavras:
        meio = (p["inicio"] + p["fim"]) / 2
        for a, b, base in bases:
            if a <= meio < b:
                out.append(dict(p, inicio=round(max(a, p["inicio"]) - a + base, 3),
                                fim=round(min(b, p["fim"]) - a + base, 3)))
                break
    return out


def cortar_pausas(entrada: str, info: Info, trechos, saida: str, tmp: str) -> None:
    """Gera o vídeo só com os trechos de fala (emendas de áudio com fade de 8 ms)."""
    wav = os.path.join(tmp, "cortes.wav")
    run(["ffmpeg", "-v", "error", "-y", "-i", entrada, "-vn", "-ar", "48000", "-ac", str(min(2, info.canais)), wav])
    x, sr = ler_wav(wav)
    f = int(sr * 0.008)
    rampa = np.linspace(0, 1, f)[:, None]
    partes = []
    for a, b in trechos:
        seg = x[int(a * sr):int(b * sr)].copy()
        if len(seg) > 2 * f:
            seg[:f] *= rampa
            seg[-f:] *= rampa[::-1]
        partes.append(seg)
    aud = os.path.join(tmp, "cortes_audio.wav")
    escrever_wav(aud, np.concatenate(partes), sr)
    cmd = ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{info.w}x{info.h}",
           "-r", f"{info.fps}", "-i", "-", "-i", aud, "-map", "0:v", "-map", "1:a", "-c:v", "libx264",
           "-preset", "veryfast", "-crf", "12", "-pix_fmt", "yuv420p", "-c:a", "pcm_s16le", "-shortest", saida]
    enc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    k = 0
    try:
        for nq, img in enumerate(ler_quadros(entrada, info.w, info.h, info.fps)):
            t = (nq + 0.5) / info.fps
            while k < len(trechos) and t >= trechos[k][1]:
                k += 1
            if k >= len(trechos):
                break
            if t >= trechos[k][0]:
                enc.stdin.write(img.tobytes())
    finally:
        enc.stdin.close()
        enc.wait()
    if enc.returncode:
        sys.exit("Falha ao cortar as pausas.")


# --------------------------------------------------------------------------- B-roll (imagens e vídeos de apoio)

@dataclass
class Broll:
    ini: float
    fim: float
    arquivo: str
    estilo: str = "tela-cheia"   # "tela-cheia" | "janela"
    eh_video: bool = False
    img: np.ndarray | None = None
    leitor: object = None


def _sem_acento(s: str) -> str:
    import unicodedata
    s = unicodedata.normalize("NFD", s.lower())
    return re.sub(r"[^a-z0-9 ]", "", "".join(c for c in s if unicodedata.category(c) != "Mn"))


def baixar(url: str, pasta: str) -> str:
    """Baixa um link (Higgsfield, Canva, qualquer URL direta) para a pasta temporária."""
    import urllib.request
    ext = os.path.splitext(url.split("?")[0])[1] or ".bin"
    destino = os.path.join(pasta, f"broll_{abs(hash(url)) % 10 ** 8}{ext}")
    if not os.path.exists(destino):
        req = urllib.request.Request(url, headers={"User-Agent": "editar-conversa/1.0"})
        with urllib.request.urlopen(req, timeout=120) as r, open(destino, "wb") as f:
            shutil.copyfileobj(r, f)
    return destino


def carregar_brolls(path: str, palavras: list[dict], trechos, dur: float, tmp: str) -> list[Broll]:
    """Lê o JSON de B-roll. Cada item: {"arquivo": caminho ou URL, "palavra": "texto falado"
    ou "inicio": segundos do vídeo original, "duracao": 2.5, "estilo": "tela-cheia"|"janela"}."""
    itens = json.load(open(path, encoding="utf-8"))
    base_dir = os.path.dirname(os.path.abspath(path))
    textos = [_sem_acento(p["palavra"]) for p in palavras]
    out: list[Broll] = []
    cursor = 0.0
    for it in itens:
        arq = it["arquivo"]
        if re.match(r"https?://", arq):
            log(f"Baixando B-roll: {arq[:70]}...")
            arq = baixar(arq, tmp)
        elif not os.path.isabs(arq):
            arq = os.path.join(base_dir, arq)
        if not os.path.exists(arq):
            log(f"Atenção: B-roll não encontrado, pulando: {arq}")
            continue
        ini = None
        if it.get("palavra") and palavras:
            alvo = _sem_acento(it["palavra"]).split()
            for i in range(len(textos) - len(alvo) + 1):
                if palavras[i]["inicio"] >= cursor and textos[i:i + len(alvo)] == alvo:
                    ini = palavras[i]["inicio"] - 0.1
                    break
            if ini is None:
                log(f"Atenção: a palavra '{it['palavra']}' não aparece na fala; B-roll pulado.")
                continue
        elif "inicio" in it:
            t = tempo_seg(it["inicio"])
            if trechos:  # converte do tempo original para o tempo depois do corte de pausas
                acum, novo = 0.0, None
                for a, b in trechos:
                    if a <= t < b:
                        novo = acum + t - a
                        break
                    acum += b - a
                t = novo if novo is not None else acum
            ini = t
        if ini is None:
            continue
        ini = max(0.0, ini)
        fim = min(dur, ini + float(it.get("duracao", 2.5)))
        if fim - ini < 0.5:
            continue
        eh_video = os.path.splitext(arq)[1].lower() in (".mp4", ".mov", ".webm", ".mkv", ".m4v", ".gif")
        out.append(Broll(ini, fim, arq, it.get("estilo", "tela-cheia"), eh_video))
        cursor = fim
    log(f"B-roll: {len(out)} inserções.")
    return out


def quadro_broll(b: Broll, t: float, base: np.ndarray, ow: int, oh: int, fps: float) -> np.ndarray:
    """Desenha o B-roll sobre o quadro base, com entrada em zoom/fade e saída em fade."""
    if b.eh_video:
        if b.leitor is None:
            vf = (f"fps={fps},scale={ow}:{oh}:force_original_aspect_ratio=increase,crop={ow}:{oh}"
                  if b.estilo == "tela-cheia" else f"fps={fps},scale={int(ow * 0.84)}:-2")
            info_b = sondar(b.arquivo)
            if b.estilo == "tela-cheia":
                w, h = ow, oh
            else:
                w = int(ow * 0.84) // 2 * 2
                h = int(round(info_b.h * w / info_b.w / 2)) * 2
            cmd = ["ffmpeg", "-v", "quiet", "-stream_loop", "-1", "-i", b.arquivo, "-vf", vf + f",scale={w}:{h}",
                   "-f", "rawvideo", "-pix_fmt", "bgr24", "-"]
            b.leitor = (subprocess.Popen(cmd, stdout=subprocess.PIPE, bufsize=10 ** 8), w, h)
        p, w, h = b.leitor
        buf = p.stdout.read(w * h * 3)
        midia = np.frombuffer(buf, np.uint8).reshape(h, w, 3) if len(buf) == w * h * 3 else np.zeros((h, w, 3), np.uint8)
    else:
        if b.img is None:
            im = cv2.imread(b.arquivo, cv2.IMREAD_COLOR)
            if im is None:
                im = np.zeros((oh, ow, 3), np.uint8)
            if b.estilo == "tela-cheia":
                esc = max(ow / im.shape[1], oh / im.shape[0]) * 1.12
            else:
                esc = ow * 0.84 / im.shape[1] * 1.08
            b.img = cv2.resize(im, (int(im.shape[1] * esc), int(im.shape[0] * esc)), interpolation=cv2.INTER_AREA)
        im = b.img
        frac = (t - b.ini) / max(0.1, b.fim - b.ini)
        k = 1.0 / (1.0 + 0.08 * frac)       # zoom lento para dentro (Ken Burns)
        if b.estilo == "tela-cheia":
            w, h = ow, oh
        else:
            w = int(ow * 0.84) // 2 * 2
            h = int(im.shape[0] / 1.08 * w / (im.shape[1] / 1.08)) // 2 * 2
        cw, ch = im.shape[1] * k / (1.12 if b.estilo == "tela-cheia" else 1.08), im.shape[0] * k / (1.12 if b.estilo == "tela-cheia" else 1.08)
        cw, ch = min(cw, im.shape[1]), min(ch, im.shape[0])
        r = np.array([(im.shape[1] - cw) / 2, (im.shape[0] - ch) / 2, cw, ch])
        midia = recortar(im, r, w, h)
    # entrada (0,25 s): cresce de 92% e aparece; saída (0,2 s): some
    ent = ease((t - b.ini) / 0.25)
    sai = ease((b.fim - t) / 0.2)
    alfa = min(ent, sai)
    esc = 0.92 + 0.08 * ent
    if b.estilo == "tela-cheia":
        cartao = midia
        if esc < 0.999:
            cartao = cv2.resize(midia, (int(ow * esc), int(oh * esc)))
        out = base.copy()
        y0, x0 = (oh - cartao.shape[0]) // 2, (ow - cartao.shape[1]) // 2
        roi = out[y0:y0 + cartao.shape[0], x0:x0 + cartao.shape[1]]
        out[y0:y0 + cartao.shape[0], x0:x0 + cartao.shape[1]] = cv2.addWeighted(cartao, alfa, roi, 1 - alfa, 0)
        return out
    # janela: cartão com borda branca e sombra, no terço superior
    borda = max(6, ow // 140)
    cartao = cv2.copyMakeBorder(midia, borda, borda, borda, borda, cv2.BORDER_CONSTANT, value=(255, 255, 255))
    cartao = cv2.resize(cartao, (int(cartao.shape[1] * esc), int(cartao.shape[0] * esc)))
    ch_, cw_ = cartao.shape[:2]
    x0 = (ow - cw_) // 2
    y0 = int(oh * (0.16 if oh > ow else 0.10))
    y0 = min(y0, oh - ch_)
    out = base.copy()
    sombra = out.copy()
    cv2.rectangle(sombra, (x0 + 10, y0 + 14), (x0 + cw_ + 10, y0 + ch_ + 14), (0, 0, 0), -1)
    out = cv2.addWeighted(sombra, 0.35 * alfa, out, 1 - 0.35 * alfa, 0)
    roi = out[y0:y0 + ch_, x0:x0 + cw_]
    out[y0:y0 + ch_, x0:x0 + cw_] = cv2.addWeighted(cartao[: roi.shape[0], : roi.shape[1]], alfa, roi, 1 - alfa, 0)
    return out


# --------------------------------------------------------------------------- efeitos sonoros

def gerar_efeitos(saida: str, dur: float, eventos: list[tuple[float, str]], sr: int = 48000) -> None:
    """Faixa de efeitos: whoosh nas transições, pop nos textos. Sintetizados (sem direitos)."""
    n = int(dur * sr) + sr
    L = np.zeros(n, np.float32)
    R = np.zeros(n, np.float32)
    rng = np.random.default_rng(3)

    def whoosh(d: float, ganho: float):
        m = int(d * sr)
        t = np.arange(m) / sr
        ruido = rng.normal(0, 1, m)
        corte = 300 + 3500 * np.sin(np.pi * t / d) ** 2         # varredura de filtro
        alpha = 1 - np.exp(-2 * np.pi * corte / sr)
        y = np.zeros(m)
        acc = 0.0
        for i in range(m):                                        # passa-baixas variável
            acc += alpha[i] * (ruido[i] - acc)
            y[i] = acc
        env = np.sin(np.pi * t / d) ** 1.5
        y = y * env / (np.abs(y).max() + 1e-9) * ganho
        pan = t / d
        return y * (1 - pan * 0.7), y * (0.3 + pan * 0.7)

    def pop(ganho: float):
        m = int(0.09 * sr)
        t = np.arange(m) / sr
        f = 900 * np.exp(-t * 18) + 280
        y = np.sin(2 * np.pi * np.cumsum(f) / sr) * np.exp(-t * 45) * ganho
        return y, y

    for t0, tipo in eventos:
        if tipo == "whoosh":
            a, b = whoosh(0.5, 0.30)
            t0 -= 0.25
        elif tipo == "swish":
            a, b = whoosh(0.22, 0.16)
            t0 -= 0.11
        else:
            a, b = pop(0.22)
        i = int(max(0.0, t0) * sr)
        j = min(n, i + len(a))
        L[i:j] += a[: j - i]
        R[i:j] += b[: j - i]
    escrever_wav(saida, np.stack([L, R], 1)[: int(dur * sr)], sr)


# --------------------------------------------------------------------------- enquadramento

def ease(x: float) -> float:
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


class Camera:
    def __init__(self, info: Info, ow: int, oh: int, pessoas: list[Pessoa], zoom: float, vertical: bool):
        self.info, self.ow, self.oh, self.p, self.zoom, self.vertical = info, ow, oh, pessoas, zoom, vertical
        self.asp = ow / oh

    def _caixa(self, cx, cy, ch, asp, ancora_y=0.40):
        W, H = self.info.w, self.info.h
        ch = min(ch, H, W / asp)
        cw = ch * asp
        x0 = min(max(cx - cw / 2, 0), W - cw)
        y0 = min(max(cy - ancora_y * ch, 0), H - ch)
        return np.array([x0, y0, cw, ch], float)

    def close(self, j: int, t: float, asp: float | None = None, aperto: float = 3.0, nivel: float = 1.0) -> np.ndarray:
        asp = asp or self.asp
        cx, cy, s = self.p[j].em(t)
        z = self.zoom * nivel
        ch = aperto * s / z
        if asp < 1:  # vertical: mais altura para caber ombros
            ch = 3.4 * s / z
        lim = (self.oh if asp >= 1 else self.ow / asp) / 2.6 / math.sqrt(nivel)
        ch = max(ch, lim)  # limita a ampliação (evita imagem borrada)
        return self._caixa(cx, cy, ch, asp)

    def aberto(self, t: float) -> np.ndarray:
        W, H = self.info.w, self.info.h
        if not self.p or self.vertical:
            return self._caixa(W / 2, H / 2, H, self.asp, 0.5)
        xs0 = min(p.em(t)[0] - 1.6 * p.em(t)[2] for p in self.p)
        xs1 = max(p.em(t)[0] + 1.6 * p.em(t)[2] for p in self.p)
        ys0 = min(p.em(t)[1] - 1.3 * p.em(t)[2] for p in self.p)
        ys1 = max(p.em(t)[1] + 2.4 * p.em(t)[2] for p in self.p)
        ch = max(ys1 - ys0, (xs1 - xs0) / self.asp, 0.72 * H)
        return self._caixa((xs0 + xs1) / 2, (ys0 + ys1) / 2, ch, self.asp, 0.5)

    def apertar(self, r: np.ndarray, nivel: float, cx: float, cy: float) -> np.ndarray:
        """Aperta o enquadramento r em direção a (cx, cy), sem sair do quadro."""
        if nivel == 1.0:
            return r
        x0, y0, w, h = r
        nw, nh = w / nivel, h / nivel
        nx = min(max(cx - (cx - x0) / nivel, 0), self.info.w - nw)
        ny = min(max(cy - (cy - y0) / nivel, 0), self.info.h - nh)
        return np.array([nx, ny, nw, nh])

    @staticmethod
    def respiro(r: np.ndarray, frac: float, cx: float, cy: float) -> np.ndarray:
        """Zoom lento (Ken Burns) de até 5% ao longo do plano, ancorado no rosto."""
        k = 1 - 0.05 * frac
        x0, y0, w, h = r
        nw, nh = w * k, h * k
        ax = (cx - x0) / w
        ay = (cy - y0) / h
        return np.array([cx - ax * nw, cy - ay * nh, nw, nh])


def recortar(img: np.ndarray, r: np.ndarray, ow: int, oh: int) -> np.ndarray:
    x0, y0, w, h = r
    sx, sy = ow / w, oh / h
    m = np.array([[sx, 0, -x0 * sx], [0, sy, -y0 * sy]], np.float32)
    interp = cv2.INTER_AREA if sx < 1 else cv2.INTER_CUBIC
    return cv2.warpAffine(img, m, (ow, oh), flags=interp, borderMode=cv2.BORDER_REFLECT)


# --------------------------------------------------------------------------- legendas e nomes

def cor_ass(hexcor: str, alfa: int = 0) -> str:
    h = hexcor.lstrip("#")
    r, g, b = h[0:2], h[2:4], h[4:6]
    return f"&H{alfa:02X}{b}{g}{r}".upper()


def escolher_fonte(pedida: str | None) -> str:
    if pedida:
        return pedida
    prefer = ["Montserrat", "Poppins", "Inter", "Roboto", "Open Sans", "Lato", "Arial", "Helvetica", "DejaVu Sans"]
    if shutil.which("fc-list"):
        fams = subprocess.run(["fc-list", ":", "family"], capture_output=True, text=True).stdout
        tem = {f.strip() for linha in fams.splitlines() for f in linha.split(",")}
        for p in prefer:
            if p in tem:
                return p
    return "Arial"


def transcrever(audio: str, idioma: str, modelo: str) -> list[dict]:
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        WhisperModel = None
    if WhisperModel:
        log(f"Transcrevendo com faster-whisper ({modelo})... pode levar alguns minutos.")
        try:
            m = WhisperModel(modelo, device="auto", compute_type="int8")
            segs, _ = m.transcribe(audio, language=idioma, word_timestamps=True, vad_filter=True,
                                   beam_size=5, condition_on_previous_text=False)
            return [{"inicio": round(w.start, 3), "fim": round(w.end, 3), "palavra": w.word.strip()}
                    for s in segs for w in (s.words or []) if w.word.strip()]
        except Exception as erro:  # sem internet para baixar o modelo, GPU sem driver etc.
            log(f"Falha na transcrição ({erro.__class__.__name__}: {erro}). Seguindo sem legendas; "
                "use --legenda arquivo.srt para fornecer o texto.")
            return []
    try:
        import whisper  # openai-whisper
    except ImportError:
        log("Nenhum transcritor instalado (pip install faster-whisper). Seguindo sem legendas.")
        return []
    log(f"Transcrevendo com openai-whisper ({modelo})...")
    r = whisper.load_model(modelo).transcribe(audio, language=idioma, word_timestamps=True)
    return [{"inicio": round(w["start"], 3), "fim": round(w["end"], 3), "palavra": w["word"].strip()}
            for s in r["segments"] for w in s.get("words", []) if w["word"].strip()]


def palavras_de_srt(path: str) -> list[dict]:
    txt = open(path, encoding="utf-8-sig").read()
    out = []
    for bloco in re.split(r"\n\s*\n", txt.strip()):
        linhas = bloco.strip().splitlines()
        tl = next((l for l in linhas if "-->" in l), None)
        if not tl:
            continue
        a, b = [tempo_seg(x.strip().split()[0]) for x in tl.split("-->")]
        texto = " ".join(l for l in linhas[linhas.index(tl) + 1:]).strip()
        texto = re.sub(r"<[^>]+>|\{[^}]+\}", "", texto)
        ps = texto.split()
        if not ps:
            continue
        pesos = np.array([len(p) + 2 for p in ps], float)
        cum = np.concatenate([[0], np.cumsum(pesos)]) / pesos.sum() * (b - a) + a
        out += [{"inicio": round(cum[i], 3), "fim": round(cum[i + 1], 3), "palavra": p} for i, p in enumerate(ps)]
    return out


def escrever_srt(palavras: list[dict], path: str) -> None:
    def ts(s):
        ms = int(round(s * 1000))
        return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"
    with open(path, "w", encoding="utf-8") as f:
        for i, fr in enumerate(agrupar_frases(palavras, 42, 8), 1):
            f.write(f"{i}\n{ts(fr[0]['inicio'])} --> {ts(fr[-1]['fim'])}\n{' '.join(p['palavra'] for p in fr)}\n\n")


def agrupar_frases(palavras, max_chars: int, max_palavras: int) -> list[list[dict]]:
    frases: list[list[dict]] = []
    atual: list[dict] = []
    for p in palavras:
        if atual:
            texto = " ".join(q["palavra"] for q in atual + [p])
            pausa = p["inicio"] - atual[-1]["fim"]
            fim_frase = re.search(r"[.!?…]$", atual[-1]["palavra"])
            virgula = atual[-1]["palavra"].endswith(",") and len(atual) >= 3
            if (len(texto) > max_chars or len(atual) >= max_palavras or pausa > 0.5 or fim_frase
                    or virgula or p["fim"] - atual[0]["inicio"] > 3.5):
                frases.append(atual)
                atual = []
        atual.append(p)
    if atual:
        frases.append(atual)
    return frases


def esc_ass(s: str) -> str:
    return s.replace("\\", "\\\\").replace("{", "(").replace("}", ")").replace("\n", " ")


def ts_ass(s: float) -> str:
    cs = int(round(max(0, s) * 100))
    return f"{cs // 360000}:{cs // 6000 % 60:02d}:{cs // 100 % 60:02d}.{cs % 100:02d}"


def plano_em(planos: list[Plano], t: float) -> Plano:
    for p in planos:
        if p.ini <= t < p.fim:
            return p
    return planos[-1]


PALETA_TITULO = ["#FF6B5B", "#7CF29A", "#FFD84D", "#5BD1FF", "#C99BFF"]


def escurecer(hexcor: str, k: float = 0.5) -> str:
    h = hexcor.lstrip("#")
    return "#" + "".join(f"{int(int(h[i:i + 2], 16) * k):02X}" for i in (0, 2, 4))


def eventos_titulo(titulo: str, ate: float, ow: int, oh: int, fonte: str, vertical: bool) -> tuple[list, list]:
    """Título-gancho: uma palavra (ou bloco entre ' / ') por linha, cores vivas, entrada com pop.
    Palavras entre ~~ ~~ recebem um risco vermelho animado."""
    blocos = [b.strip() for b in titulo.split(" / ")] if " / " in titulo else titulo.split()
    if len(blocos) > 5:
        blocos = [" ".join(blocos[i:i + 2]) for i in range(0, len(blocos), 2)]
    # palavra riscada (~~x~~) sempre em linha própria, para o risco ficar certinho sobre ela
    linhas_t: list[str] = []
    for bl in blocos:
        resto: list[str] = []
        for tok in re.split(r"(~~[^~]+~~)", bl):
            tok = tok.strip()
            if not tok:
                continue
            if tok.startswith("~~"):
                if resto:
                    linhas_t.append(" ".join(resto))
                    resto = []
                linhas_t.append(tok)
            else:
                resto.append(tok)
        if resto:
            linhas_t.append(" ".join(resto))
    blocos = linhas_t
    base = min(ow, oh)
    tam = int(base * (0.185 if vertical else 0.12) * (1 if len(blocos) <= 3 else 0.8))
    xs = [0.36, 0.62, 0.50, 0.40, 0.60]
    rots = [4, -3, 0, 3, -2]
    y0 = oh * (0.12 if vertical else 0.20)
    ev, sons = [], []
    for i, bloco in enumerate(blocos):
        riscar = bloco.startswith("~~") and bloco.endswith("~~")
        txt = esc_ass(bloco.strip("~"))
        cor = PALETA_TITULO[i % len(PALETA_TITULO)]
        largura_est = len(txt) * tam * 0.60
        x = int(min(max(ow * xs[i % len(xs)], largura_est / 2 + ow * 0.05), ow - largura_est / 2 - ow * 0.05))
        y = int(y0 + i * tam * 1.02)
        t0 = 0.25 + i * 0.32
        if t0 >= ate - 0.3:
            break
        ini, fim = ts_ass(t0), ts_ass(ate)
        anim = ("\\fscx20\\fscy20\\alpha&HFF&\\t(0,120,\\alpha&H00&\\fscx118\\fscy118)"
                "\\t(120,260,\\fscx100\\fscy100)\\fad(0,300)")
        ev.append((t0, f"Dialogue: 5,{ini},{fim},Titulo,,0,0,0,,{{\\an5\\pos({x},{y})\\frz{rots[i % 5]}"
                       f"\\1c{cor_ass(cor)}\\3c{cor_ass(escurecer(cor, 0.45))}{anim}}}{txt}"))
        sons.append((t0, "pop"))
        if riscar:
            t1 = t0 + 0.45
            w, h = int(largura_est * 1.08), max(8, int(tam * 0.13))
            ev.append((t1, f"Dialogue: 6,{ts_ass(t1)},{fim},Barra,,0,0,0,,{{\\an5\\pos({x},{y + int(tam * 0.05)})"
                           f"\\frz{rots[i % 5] - 1}\\1c{cor_ass('#FF3B3B')}\\bord2\\3c{cor_ass('#FFB0A8')}\\blur2"
                           f"\\fscx0\\t(0,220,\\fscx100)\\fad(0,300)\\p1}}m 0 0 l {w} 0 {w} {h} 0 {h}{{\\p0}}"))
            sons.append((t1, "swish"))
    estilo = (f"Style: Titulo,{fonte},{tam},&H00FFFFFF,&H00FFFFFF,&H00000000,&H78000000,-1,0,0,0,100,100,1,0,1,"
              f"{max(3, int(tam * 0.06))},{max(3, int(tam * 0.07))},5,0,0,0,1")
    return [estilo] + ev, sons


def gerar_ass(path: str, ow: int, oh: int, palavras, planos, pessoas, fonte: str, destaque: str,
              estilo: str, maiusculas: bool, vertical: bool, cam: Camera,
              titulo: str | None = None, titulo_ate: float = 3.5, fonte_titulo: str | None = None) -> list:
    """Escreve o .ass e devolve os eventos sonoros dos textos [(tempo, tipo)]."""
    base = min(ow, oh)
    tam_leg = int(base * (0.068 if vertical else 0.062))
    tam_nome = int(base * 0.052)
    tam_cargo = int(base * 0.036)
    contorno = max(2, int(tam_leg * 0.09))
    branco, preto = "&H00FFFFFF", "&H00000000"
    linhas = [
        "[Script Info]", "ScriptType: v4.00+", f"PlayResX: {ow}", f"PlayResY: {oh}",
        "WrapStyle: 0", "ScaledBorderAndShadow: yes", "YCbCr Matrix: TV.709", "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, "
        "Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
        "Alignment, MarginL, MarginR, MarginV, Encoding",
    ]
    if estilo == "caixa":
        linhas.append(f"Style: Leg,{fonte},{tam_leg},{branco},{branco},&H50000000,&H50000000,-1,0,0,0,100,100,0,0,3,"
                      f"{int(tam_leg * 0.28)},0,2,60,60,60,1")
    else:
        linhas.append(f"Style: Leg,{fonte},{tam_leg},{branco},{branco},{preto},&H96000000,-1,0,0,0,100,100,0.5,0,1,"
                      f"{contorno},{max(1, contorno // 2)},2,60,60,60,1")
    linhas += [
        f"Style: Nome,{fonte},{tam_nome},{branco},{branco},&H1E141414,&H00000000,-1,0,0,0,100,100,0.5,0,3,"
        f"{int(tam_nome * 0.32)},0,1,0,0,0,1",
        f"Style: Cargo,{fonte},{tam_cargo},&H00141414,&H00141414,{cor_ass(destaque)},&H00000000,-1,0,0,0,100,100,"
        f"0.5,0,3,{int(tam_cargo * 0.32)},0,1,0,0,0,1",
        f"Style: Barra,{fonte},10,{cor_ass(destaque)},{branco},{preto},{preto},0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1",
    ]
    ev = []
    sons: list[tuple[float, str]] = []
    if titulo:
        tit, sons_t = eventos_titulo(titulo, titulo_ate, ow, oh, fonte_titulo or fonte, vertical)
        linhas.append(tit[0])
        ev += tit[1:]
        sons += sons_t
    linhas += ["", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"]

    def y_legenda(pl: Plano) -> int:
        if vertical:
            return int(oh * 0.5 + tam_leg * 0.5) if pl.tipo == "dividido" else int(oh * 0.74)
        return int(oh * 0.90)

    cor_dest = cor_ass(destaque)
    # legendas palavra a palavra, divididas nos cortes de plano para mudar de posição
    frases = agrupar_frases(palavras, 24 if vertical else 34, 5 if vertical else 7)
    for fi, fr in enumerate(frases):
        prox = frases[fi + 1][0]["inicio"] if fi + 1 < len(frases) else fr[-1]["fim"] + 1
        fim_frase = min(prox, fr[-1]["fim"] + 0.6)
        txts = [p["palavra"].upper() if maiusculas else p["palavra"] for p in fr]
        for i, p in enumerate(fr):
            a = fr[0]["inicio"] if i == 0 else p["inicio"]
            b = fr[i + 1]["inicio"] if i + 1 < len(fr) else fim_frase
            if b - a < 0.02:
                continue
            partes = []
            for j, tx in enumerate(txts):
                tx = esc_ass(tx)
                partes.append(f"{{\\1c{cor_dest}\\fscx106\\fscy106}}{tx}{{\\r}}" if j == i else tx)
            texto = " ".join(partes)
            # quebra a frase nos cortes de plano
            cortes = [a] + [pl.ini for pl in planos if a < pl.ini < b] + [b]
            for c0, c1 in zip(cortes, cortes[1:]):
                pl = plano_em(planos, (c0 + c1) / 2)
                fad = "\\fad(80,0)" if (i == 0 and c0 == a) else ""
                ev.append((c0, f"Dialogue: 2,{ts_ass(c0)},{ts_ass(c1)},Leg,,0,0,0,,"
                               f"{{\\an2\\pos({ow // 2},{y_legenda(pl)}){fad}}}{texto}"))
    # nomes (lower thirds): na primeira vez que a pessoa aparece em destaque
    mostrados = set()
    for pl in planos:
        if pl.tipo == "close" and pl.pessoa not in mostrados and pl.fim - pl.ini >= 2.0:
            alvos = [(pl.pessoa, None)]
        elif pl.tipo == "dividido" and pl.fim - pl.ini >= 2.0:
            alvos = [(j, j) for j in range(min(2, len(pessoas))) if j not in mostrados]
        else:
            continue
        for j, metade in alvos:
            if j in mostrados or not pessoas[j].nome:
                continue
            mostrados.add(j)
            ini = max(pl.ini + 0.4, titulo_ate + 0.2 if titulo else 0)
            if ini > pl.fim - 1.5:
                mostrados.discard(j)
                continue
            sons.append((ini, "pop"))
            fim = min(pl.fim - 0.1, ini + 4.5)
            x = int(ow * (0.06 if not vertical else 0.08))
            if vertical and metade is not None:
                y = int(oh * (0.44 if metade == 0 else 0.94))
            elif vertical:
                y = int(oh * 0.63)
            else:
                y = int(oh * 0.80)
            nome, cargo = esc_ass(pessoas[j].nome), esc_ass(pessoas[j].cargo)
            pad_n = int(tam_nome * 0.32)
            y_nome = y - (int(tam_cargo * 1.75) if cargo else 0)
            mov = f"\\move({x - 40},{y_nome},{x},{y_nome},0,300)"
            ev.append((ini, f"Dialogue: 3,{ts_ass(ini)},{ts_ass(fim)},Nome,,0,0,0,,{{\\an1{mov}\\fad(250,300)}}{nome}"))
            if cargo:
                mc = f"\\move({x - 40},{y},{x},{y},80,380)"
                ev.append((ini, f"Dialogue: 3,{ts_ass(ini + 0.08)},{ts_ass(fim)},Cargo,,0,0,0,,"
                                f"{{\\an1{mc}\\fad(250,300)}}{cargo}"))
            topo = y_nome - tam_nome - pad_n
            altura = y - topo + int(tam_cargo * 0.35 if cargo else pad_n)
            bx = x - pad_n - 12
            ev.append((ini, f"Dialogue: 4,{ts_ass(ini)},{ts_ass(fim)},Barra,,0,0,0,,"
                            f"{{\\an7\\move({bx - 40},{topo},{bx},{topo},0,300)\\fad(250,300)\\p1}}"
                            f"m 0 0 l 8 0 8 {altura} 0 {altura}{{\\p0}}"))
    ev.sort(key=lambda e: e[0])
    linhas += [e[1] for e in ev]
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(linhas) + "\n")
    return sons


# --------------------------------------------------------------------------- render

def renderizar(args, info: Info, planos, pessoas, ow, oh, fps, tmp, ass, voz, musica, efeitos=None, brolls=()):
    vertical = oh > ow
    cam = Camera(info, ow, oh, pessoas, args.zoom, vertical)
    T = args.duracao_transicao
    modo = args.transicao

    def quadro_plano(img, pl: Plano, t: float):
        frac = (t - pl.ini) / max(0.5, pl.fim - pl.ini)
        if pl.tipo == "close":
            cx, cy, s = pessoas[pl.pessoa].em(t)
            r = Camera.respiro(cam.close(pl.pessoa, t, nivel=pl.nivel), frac, cx, cy)
            return recortar(img, r, ow, oh), r
        if pl.tipo == "dividido":
            meia = oh // 2
            topo = recortar(img, cam.close(0, t, ow / meia, 2.6), ow, meia)
            baixo = recortar(img, cam.close(1, t, ow / (oh - meia), 2.6), ow, oh - meia)
            out = np.vstack([topo, baixo])
            cv2.line(out, (0, meia), (ow, meia), (20, 20, 20), max(2, oh // 400))
            return out, None
        r = cam.aberto(t)
        if vertical and len(pessoas) == 1:  # uma pessoa no vertical: altura inteira, centrado nela
            fx, fy, _ = pessoas[0].em(t)
            r = cam.apertar(cam._caixa(fx, info.h / 2, info.h, ow / oh, 0.5), pl.nivel, fx, fy)
            return recortar(img, Camera.respiro(r, frac * 0.6, fx, fy), ow, oh), r
        if pl.nivel != 1.0:  # "soco" no plano aberto (vídeo de uma pessoa): aperta em direção ao rosto
            if pessoas:
                fx, fy, _ = pessoas[0].em(t)
            else:
                fx, fy = info.w / 2, info.h * 0.4
            r = cam.apertar(r, pl.nivel, fx, fy)
            return recortar(img, Camera.respiro(r, frac * 0.6, fx, fy), ow, oh), r
        if vertical:  # plano aberto vertical: imagem inteira sobre fundo desfocado
            fundo = recortar(img, cam._caixa(info.w / 2, info.h / 2, info.h, ow / oh, 0.5), ow, oh)
            fundo = cv2.GaussianBlur(cv2.resize(fundo, (ow // 8, oh // 8)), (0, 0), 3)
            fundo = (cv2.resize(fundo, (ow, oh)) * 0.6).astype(np.uint8)
            fw = ow
            fh = int(info.h * ow / info.w)
            frente = cv2.resize(img, (fw, fh), interpolation=cv2.INTER_AREA)
            y0 = (oh - fh) // 2
            fundo[y0:y0 + fh] = frente
            return fundo, None
        cx, cy = r[0] + r[2] / 2, r[1] + r[3] / 2
        r = Camera.respiro(r, frac * 0.6, cx, cy)
        return recortar(img, r, ow, oh), r

    # filtros finais de vídeo e áudio
    vf = [f"ass=legendas.ass:fontsdir='{args.pasta_fontes}'" if args.pasta_fontes else "ass=legendas.ass"] if ass else []
    if args.cor:
        vf = ["eq=contrast=1.05:saturation=1.10:gamma=1.01", "unsharp=5:5:0.45:5:5:0.0", "vignette=PI/6"] + vf
    vf.append("format=yuv420p")
    entradas_audio = [voz] + ([musica] if musica else []) + ([efeitos] if efeitos else [])
    fx_idx = 1 + len(entradas_audio) - 1 if efeitos else None
    partes, mix = [], ["[v1]"]
    if musica:
        partes.append("[1:a]asplit=2[v1][vk];"
                      "[2:a][vk]sidechaincompress=threshold=0.015:ratio=12:attack=20:release=700:makeup=1[md]")
        mix.append("[md]")
    else:
        partes.append("[1:a]anull[v1]")
    if efeitos:
        partes.append(f"[{fx_idx}:a]volume={args.volume_efeitos}dB[fx]")
        mix.append("[fx]")
    partes.append(f"{''.join(mix)}amix=inputs={len(mix)}:duration=first:normalize=0,"
                  "loudnorm=I=-14:TP=-1.5:LRA=9[a]")
    af = ";".join(partes)
    fc = f"[0:v]{','.join(vf)}[v];{af}"
    cmd = ["ffmpeg", "-v", "error", "-y",
           "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{ow}x{oh}", "-r", f"{fps}", "-i", "-",
           ] + [x for a in entradas_audio for x in ("-i", a)] + [
        "-filter_complex", fc, "-map", "[v]", "-map", "[a]",
        "-c:v", "libx264", "-preset", args.preset, "-crf", str(args.crf), "-profile:v", "high",
        "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", "-shortest",
        os.path.abspath(args.saida)]
    if ass:
        shutil.copy(ass, os.path.join(tmp, "legendas.ass"))
    enc = subprocess.Popen(cmd, stdin=subprocess.PIPE, cwd=tmp)
    log(f"Renderizando {ow}x{oh} @ {fps:g} qps, {len(planos)} planos...")
    idx = 0
    total = int(info.dur * fps)
    try:
        for n, img in enumerate(ler_quadros(args.entrada, info.w, info.h, fps)):
            t = n / fps
            while idx + 1 < len(planos) and t >= planos[idx + 1].ini:
                idx += 1
            pl = planos[idx]
            out, r = quadro_plano(img, pl, t)
            ant = planos[idx - 1] if idx > 0 else None
            # entre closes de pessoas diferentes, dissolve curto (uma panorâmica passaria pelo vazio);
            # mesmo enquadramento com outro aperto: corte seco
            tr = tipo_transicao(ant, pl, modo)
            Tt = T * 0.6 if tr == "fade" else T
            if tr != "corte" and t - pl.ini < Tt:
                k = ease((t - pl.ini) / Tt)
                out_a, r_a = quadro_plano(img, ant, t)
                if tr == "zoom" and r is not None and r_a is not None:
                    out = recortar(img, r_a * (1 - k) + r * k, ow, oh)
                else:
                    out = cv2.addWeighted(out_a, 1 - k, out, k, 0)
            for b in brolls:
                if b.ini <= t < b.fim:
                    out = quadro_broll(b, t, out, ow, oh, fps)
            enc.stdin.write(np.ascontiguousarray(out).tobytes())
            if n % int(fps * 2) == 0:
                print(f"\r[conversa] {100 * n / max(1, total):5.1f}%", end="", flush=True)
    finally:
        enc.stdin.close()
        enc.wait()
        for b in brolls:
            if b.leitor:
                b.leitor[0].kill()
    print()
    if enc.returncode:
        sys.exit("Falha no ffmpeg ao gerar o vídeo final.")


# --------------------------------------------------------------------------- principal

def main() -> None:
    ap = argparse.ArgumentParser(description="Edição automática de conversas (zoom em quem fala, voz, legendas, nomes, trilha).")
    ap.add_argument("entrada")
    ap.add_argument("-o", "--saida", required=True)
    ap.add_argument("--nomes", nargs="*", default=[], help="nomes na ordem da esquerda para a direita")
    ap.add_argument("--cargos", nargs="*", default=[], help="cargo/descrição de cada pessoa (mesma ordem)")
    ap.add_argument("--pessoas", type=int, help="força o número de pessoas (padrão: nº de nomes ou automático)")
    ap.add_argument("--formato", choices=["original", "horizontal", "vertical", "quadrado"], default="original")
    ap.add_argument("--legenda", default="auto", help="auto (transcreve), nenhuma, ou arquivo .srt / .json de palavras")
    ap.add_argument("--idioma", default="pt")
    ap.add_argument("--modelo", default="small", help="modelo do Whisper: base, small, medium, large-v3")
    ap.add_argument("--estilo-legenda", choices=["destaque", "caixa"], default="destaque")
    ap.add_argument("--maiusculas", action="store_true", help="legendas em CAIXA ALTA")
    ap.add_argument("--fonte", help="fonte das legendas e nomes (padrão: Montserrat/Poppins/Inter/Arial)")
    ap.add_argument("--pasta-fontes", help="pasta com arquivos .ttf/.otf para a fonte escolhida")
    ap.add_argument("--cor-destaque", default="#FFC400", help="cor da palavra falada e do cargo")
    ap.add_argument("--musica", help="arquivo de música de fundo (padrão: trilha ambiente gerada)")
    ap.add_argument("--sem-musica", action="store_true")
    ap.add_argument("--volume-musica", type=float, default=-27.0, help="volume da trilha em LUFS (padrão -27)")
    ap.add_argument("--voz", choices=["leve", "media", "forte"], default="media", help="intensidade da redução de ruído")
    ap.add_argument("--modelo-ruido", help="modelo RNNoise (.rnnn) para o filtro arnndn, opcional")
    ap.add_argument("--zoom", type=float, default=1.0, help=">1 aproxima mais nos closes")
    ap.add_argument("--transicao", choices=["zoom", "fade", "corte"], default="zoom")
    ap.add_argument("--duracao-transicao", type=float, default=0.45)
    ap.add_argument("--min-plano", type=float, default=2.0, help="duração mínima de um plano (s)")
    ap.add_argument("--max-close", type=float, default=9.0, help="close mais longo antes de um plano aberto (s)")
    ap.add_argument("--abertura", type=float, default=3.0, help="segundos iniciais em plano aberto")
    ap.add_argument("--falantes", help="CSV manual 'inicio,fim,pessoa' (pessoa 0 = plano aberto)")
    ap.add_argument("--sem-cor", dest="cor", action="store_false", help="não aplica correção de cor/nitidez")
    ap.add_argument("--crf", type=int, default=18)
    ap.add_argument("--preset", default="medium")
    ap.add_argument("--trecho", help="processa só um trecho, ex. 1:00-1:30 (para prévia rápida)")
    ap.add_argument("--so-analise", action="store_true", help="só analisa: gera pessoas.jpg, planos e transcrição")
    g = ap.add_argument_group("estilo dinâmico (Reels/TikTok)")
    g.add_argument("--dinamico", action="store_true",
                   help="atalho: corta pausas, zoom 'soco' no ritmo das frases, planos curtos e efeitos sonoros")
    g.add_argument("--cortar-pausas", action="store_true", help="remove os silêncios entre as falas")
    g.add_argument("--pausa-minima", type=float, default=0.45, help="pausas maiores que isso são cortadas (s)")
    g.add_argument("--ritmo", type=float, default=0.0, help="troca o aperto do zoom a cada ~N s, no início das frases")
    g.add_argument("--efeitos", action="store_true", help="whoosh nas transições e pop nos textos")
    g.add_argument("--volume-efeitos", type=float, default=-4.0, help="ganho da faixa de efeitos em dB")
    g.add_argument("--titulo", help="título-gancho animado no início; ~~palavra~~ sai riscada; ' / ' separa linhas")
    g.add_argument("--titulo-ate", type=float, default=3.5, help="até quando o título fica na tela (s)")
    g.add_argument("--fonte-titulo", help="fonte do título (padrão: a mesma das legendas)")
    g.add_argument("--broll", help="JSON com imagens/vídeos de apoio (arquivo ou URL do Higgsfield/Canva) "
                                   "e a palavra da fala onde entram")
    args = ap.parse_args()
    if args.dinamico:
        args.cortar_pausas = True
        args.efeitos = True
        args.ritmo = args.ritmo or 2.8
        args.min_plano = min(args.min_plano, 1.3)
        args.max_close = min(args.max_close, 6.0)
        args.abertura = min(args.abertura, 1.5)
        args.duracao_transicao = min(args.duracao_transicao, 0.35)

    for b in ("ffmpeg", "ffprobe"):
        if not shutil.which(b):
            sys.exit(f"{b} não encontrado.")
    base_saida = os.path.splitext(os.path.abspath(args.saida))[0]
    pasta = base_saida + "_analise"
    os.makedirs(pasta, exist_ok=True)
    tmp = tempfile.mkdtemp(prefix="conversa_")
    desloc = 0.0
    try:
        if args.trecho:
            a, b = args.trecho.split("-")
            desloc = tempo_seg(a)
            corte = os.path.join(tmp, "trecho.mp4")
            run(["ffmpeg", "-v", "error", "-y", "-ss", str(tempo_seg(a)), "-to", str(tempo_seg(b)), "-i", args.entrada,
                 "-c:v", "libx264", "-preset", "veryfast", "-crf", "14", "-c:a", "pcm_s16le", corte.replace(".mp4", ".mkv")])
            args.entrada = corte.replace(".mp4", ".mkv")
        info = sondar(args.entrada)
        if info.canais == 0:
            sys.exit("O vídeo não tem áudio; esta edição depende da fala.")
        log(f"Entrada: {info.w}x{info.h} @ {info.fps:g} qps, {info.dur:.1f}s, {info.canais} canal(is) de áudio")
        with open(os.path.join(pasta, "comando.txt"), "w", encoding="utf-8") as f:
            f.write(" ".join(f'"{x}"' if " " in x else x for x in sys.argv) + "\n")

        # saída
        if args.formato == "vertical":
            ow, oh = 1080, 1920
        elif args.formato == "quadrado":
            ow, oh = 1080, 1080
        elif args.formato == "horizontal" or info.w >= info.h:
            esc = min(1.0, 1920 / max(info.w, 1), 1080 / max(info.h, 1)) if args.formato == "horizontal" or info.w > 1920 else 1.0
            ow, oh = int(info.w * esc) // 2 * 2, int(info.h * esc) // 2 * 2
            if args.formato == "horizontal" and info.w < info.h:
                ow, oh = 1920, 1080
        else:
            ow, oh = info.w // 2 * 2, info.h // 2 * 2
        vertical = oh > ow
        fps = info.fps if info.fps <= 31 else (info.fps / 2 if info.fps >= 48 else info.fps)

        # 1) transcrição (no tempo do vídeo inteiro; deslocada quando há --trecho)
        bruto = os.path.join(tmp, "analise.wav")
        run(["ffmpeg", "-v", "error", "-y", "-i", args.entrada, "-vn", "-ar", "16000", bruto])
        palavras: list[dict] = []
        jtrans = os.path.join(pasta, "transcricao.json")
        if args.legenda == "auto":
            if os.path.exists(jtrans):
                palavras = json.load(open(jtrans, encoding="utf-8"))
                log(f"Usando transcrição existente (apague para refazer): {jtrans}")
            else:
                palavras = [dict(p, inicio=round(p["inicio"] + desloc, 3), fim=round(p["fim"] + desloc, 3))
                            for p in transcrever(bruto, args.idioma, args.modelo)]
                if palavras and not args.trecho:
                    json.dump(palavras, open(jtrans, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
        elif args.legenda.lower().endswith(".json"):
            palavras = json.load(open(args.legenda, encoding="utf-8"))
        elif args.legenda.lower().endswith(".srt"):
            palavras = palavras_de_srt(args.legenda)
        if palavras and not args.trecho and args.legenda not in ("auto",):
            json.dump(palavras, open(jtrans, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
        if desloc or args.trecho:
            palavras = [dict(p, inicio=p["inicio"] - desloc, fim=p["fim"] - desloc) for p in palavras
                        if p["fim"] > desloc and p["inicio"] < desloc + info.dur]

        # 2) corte de pausas
        trechos = None
        if args.cortar_pausas:
            nivel0 = os.path.join(tmp, "pausas.wav")
            run(["ffmpeg", "-v", "error", "-y", "-i", args.entrada, "-vn", "-ac", "1", "-ar", "48000", nivel0])
            trechos = detectar_trechos_de_fala(nivel0, palavras, args.pausa_minima, info.fps)
            fica = sum(b - a for a, b in trechos)
            if trechos and info.dur - fica > 0.5:
                sem = os.path.join(tmp, "sem_pausas.mkv")
                log(f"Cortando pausas: {info.dur - fica:.1f}s removidos em {max(0, len(trechos) - 1)} cortes...")
                cortar_pausas(args.entrada, info, trechos, sem, tmp)
                args.entrada = sem
                info = sondar(sem)
                palavras = mapear_palavras(palavras, trechos)
            else:
                trechos = None
                log("Sem pausas relevantes para cortar.")
        if palavras:
            escrever_srt(palavras, base_saida + ".srt")

        # 3) voz
        voz = os.path.join(tmp, "voz.wav")
        nivel = os.path.join(tmp, "nivel.wav")  # banda cheia: o chiado agudo conta no ruído
        run(["ffmpeg", "-v", "error", "-y", "-i", args.entrada, "-vn", "-ac", "1", "-ar", "48000", nivel])
        fala_db, ruido_db = niveis_audio(nivel)
        log(f"Tratando a voz (fala {fala_db:.0f} dBFS, ruído de fundo {ruido_db:.0f} dBFS)...")
        tratar_voz(args.entrada, voz, args.modelo_ruido, args.voz, fala_db, ruido_db)

        # 4) quem fala e planos
        n = int(math.ceil(info.dur / JANELA))
        n_pessoas = args.pessoas or (len(args.nomes) if args.nomes else None)
        pessoas, mov = analisar_video(args.entrada, info, n_pessoas, pasta)
        for j, p in enumerate(pessoas):
            p.nome = args.nomes[j] if j < len(args.nomes) else ""
            p.cargo = args.cargos[j] if j < len(args.cargos) else ""
        if args.nomes and len(pessoas) != len(args.nomes):
            log(f"Atenção: {len(args.nomes)} nomes informados, mas {len(pessoas)} pessoas detectadas.")
        mono16 = os.path.join(tmp, "analise_canais.wav")
        run(["ffmpeg", "-v", "error", "-y", "-i", args.entrada, "-vn", "-ar", "16000", "-ac", str(min(2, info.canais)), mono16])
        fala, canais = detectar_fala(mono16, n)
        if args.falantes:
            rot = ler_falantes_manuais(args.falantes, n, len(pessoas))
        else:
            rot = quem_fala(pessoas, mov, fala, canais, n)
        planos = planejar(rot, len(pessoas), info.dur, args.min_plano, args.max_close, args.abertura, vertical)
        planos = alinhar_cortes(planos, palavras)
        planos = dinamizar(planos, palavras, args.ritmo, len(pessoas))
        salvar_diagnostico_final(pasta, pessoas, planos, info)

        # 5) textos
        fonte = escolher_fonte(args.fonte)
        cam = Camera(info, ow, oh, pessoas, args.zoom, vertical)
        ass = os.path.join(pasta, "legendas.ass")
        sons = gerar_ass(ass, ow, oh, palavras, planos, pessoas, fonte, args.cor_destaque, args.estilo_legenda,
                         args.maiusculas, vertical, cam, args.titulo, args.titulo_ate, args.fonte_titulo)
        log(f"Fonte: {fonte}. Legendas: {len(palavras)} palavras. Arquivos de análise em {pasta}")

        # 6) B-roll, trilha e efeitos
        brolls = carregar_brolls(args.broll, palavras, trechos, info.dur, tmp) if args.broll else []
        musica = efeitos = None
        if not args.sem_musica and not args.so_analise:
            musica = os.path.join(tmp, "musica.wav")
            log("Preparando trilha de fundo...")
            preparar_musica(args.musica, info.dur, musica, args.volume_musica, tmp)
        if args.efeitos:
            for i in range(1, len(planos)):
                tr = tipo_transicao(planos[i - 1], planos[i], args.transicao)
                if tr != "corte":
                    sons.append((planos[i].ini + args.duracao_transicao / 2, "whoosh"))
                elif planos[i].nivel > planos[i - 1].nivel:
                    sons.append((planos[i].ini, "swish"))
            sons += [(b.ini + 0.12, "whoosh") for b in brolls]
            efeitos = os.path.join(tmp, "efeitos.wav")
            gerar_efeitos(efeitos, info.dur, sorted(sons))
        desenhar_linha_do_tempo(os.path.join(pasta, "linha_do_tempo.png"), info.dur, planos, palavras,
                                args.titulo_ate if args.titulo else 0, voz, musica, efeitos, len(pessoas), brolls)
        if args.so_analise:
            return

        renderizar(args, info, planos, pessoas, ow, oh, fps, tmp, ass, voz, musica, efeitos, brolls)
        log(f"Pronto: {args.saida} ({info.dur:.1f}s)")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def desenhar_linha_do_tempo(path, dur, planos, palavras, titulo_ate, voz, musica, efeitos, k, brolls=()) -> None:
    """Imagem tipo editor: faixas T (textos), V (planos), A1 voz, A2 trilha, A3 efeitos."""
    W, rot_w, alt = 1600, 70, 54
    faixas = [("T", None), ("V", None), ("A1", voz), ("A2", musica), ("A3", efeitos)]
    img = np.full((len(faixas) * alt + 40, W, 3), 28, np.uint8)
    px = lambda t: int(rot_w + (W - rot_w - 10) * t / max(dur, 1e-6))  # noqa: E731
    cores = [(91, 107, 255), (255, 209, 91), (154, 242, 124), (255, 155, 201), (77, 216, 255)]
    for i, (nome, _) in enumerate(faixas):
        y = 30 + i * alt
        cv2.putText(img, nome, (14, y + 32), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (200, 200, 200), 2)
        cv2.rectangle(img, (rot_w, y + 4), (W - 10, y + alt - 4), (40, 40, 40), -1)
    y = 30
    if titulo_ate:
        cv2.rectangle(img, (px(0), y + 8), (px(titulo_ate), y + alt - 8), (255, 155, 201), -1)
    for fr in agrupar_frases(palavras, 34, 7):
        cv2.rectangle(img, (px(fr[0]["inicio"]), y + 14), (max(px(fr[-1]["fim"]), px(fr[0]["inicio"]) + 2), y + alt - 14),
                      (77, 205, 255), -1)
    y = 30 + alt
    for pl in planos:
        cor = (110, 110, 110) if pl.pessoa < 0 else cores[pl.pessoa % len(cores)]
        if pl.nivel > 1:
            cor = tuple(min(255, int(c * 1.25)) for c in cor)
        cv2.rectangle(img, (px(pl.ini) + 1, y + 6), (px(pl.fim) - 1, y + alt - 6), cor, -1)
    for b in brolls:  # B-roll por cima do vídeo, em roxo listrado
        cv2.rectangle(img, (px(b.ini), y + 2), (px(b.fim), y + alt - 2), (255, 120, 170), -1)
        cv2.putText(img, "B", (px(b.ini) + 4, y + 34), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (40, 20, 40), 2)
    for i, (nome, arq) in enumerate(faixas[2:], start=2):
        if not arq or not os.path.exists(arq):
            continue
        x, sr = ler_wav(arq)
        m = np.abs(x).max(axis=1)
        y = 30 + i * alt
        cor = [(124, 242, 154), (255, 155, 201), (77, 216, 255)][i - 2]
        colunas = W - rot_w - 10
        bloco = max(1, len(m) // colunas)
        picos = m[: bloco * colunas].reshape(-1, bloco).max(axis=1)
        picos = picos / (picos.max() + 1e-9)
        meio = y + alt // 2
        for c, v in enumerate(picos):
            h = int(v * (alt / 2 - 6))
            cv2.line(img, (rot_w + c, meio - h), (rot_w + c, meio + h), cor, 1)
    for seg in range(0, int(dur) + 1, max(1, int(dur // 15) or 1)):
        cv2.putText(img, f"{seg // 60}:{seg % 60:02d}", (px(seg) - 12, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.45,
                    (170, 170, 170), 1)
    cv2.imwrite(path, img)


def salvar_diagnostico_final(pasta: str, pessoas, planos, info) -> None:
    dados = {
        "pessoas": [{"pessoa": p.idx + 1, "nome": p.nome, "x_medio": round(float(np.median(p.cx))),
                     "y_medio": round(float(np.median(p.cy))), "tamanho_rosto": round(float(np.median(p.s)))}
                    for p in pessoas],
        "planos": [{"inicio": round(p.ini, 2), "fim": round(p.fim, 2), "tipo": p.tipo,
                    "pessoa": (p.pessoa + 1 if p.pessoa >= 0 else None), "zoom": p.nivel} for p in planos],
    }
    json.dump(dados, open(os.path.join(pasta, "planos.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    resumo = {}
    for p in planos:
        chave = f"close pessoa {p.pessoa + 1}" if p.tipo == "close" else p.tipo
        resumo[chave] = resumo.get(chave, 0) + p.fim - p.ini
    log("Planos: " + ", ".join(f"{k} {v:.0f}s" for k, v in resumo.items()) + f" ({len(planos)} cortes)")


if __name__ == "__main__":
    main()
