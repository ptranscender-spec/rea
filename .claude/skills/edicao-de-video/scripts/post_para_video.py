#!/usr/bin/env python3
"""Transforma uma arte de post (imagem) num vídeo animado para Reels/TikTok/Stories.

Os blocos da arte (logo, título, tópicos, dica...) são recortados pelas coordenadas
informadas num JSON e entram um a um, com animação, sobre um fundo com zoom lento,
com trilha de fundo e efeitos sonoros. Opcionalmente com narração.

Uso:
  python3 post_para_video.py roteiro.json -o reels.mp4

Formato do roteiro (coordenadas em pixels da imagem original: [x0, y0, x1, y1]):
{
  "imagem": "arte.png",
  "fundo": [0, 0, 815, 1448],            # região usada como fundo (ex.: a foto da pessoa)
  "logo": [485, 20, 745, 230],           # opcional: abre o vídeo e depois fica pequeno no topo
  "abertura": 2.6,                       # segundos do logo sozinho
  "cenas": [
    {"regiao": [330, 232, 1040, 455], "duracao": 3.2, "entrada": "pop", "y": 0.30},
    {"regiao": [440, 475, 1035, 668], "duracao": 4.5, "entrada": "pop", "fixar": true},
    {"regiao": [445, 670, 1015, 800], "duracao": 5, "entrada": "direita", "y": 0.50},
    {"regiao": [370, 1150, 1080, 1295], "duracao": 6, "entrada": "baixo", "limpar": true}
  ],
  "final": 4,                            # segundos da arte inteira no fim (0 = sem)
  "cabecalho_y": 0.235,                  # altura onde fica o cartão marcado com "fixar"
  "cor": "#E5B43A"                       # cor da barra de progresso
}
Campos de cena: duracao (s), entrada (pop|direita|esquerda|baixo), y (centro vertical, 0 a 1),
largura (fração da largura do vídeo), fixar (vira cabeçalho fixo depois da cena), limpar
(remove o cabeçalho fixo nesta cena), pulso (true: leve pulsação para destacar).
"""
from __future__ import annotations

import argparse
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import editar_conversa as ec  # noqa: E402  (reaproveita trilha, efeitos e utilidades)

cv2 = ec.cv2


def hex_bgr(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return int(h[4:6], 16), int(h[2:4], 16), int(h[0:2], 16)


def fazer_cartao(img: np.ndarray, reg, largura_px: int, raio: int = 28) -> np.ndarray:
    """Recorta a região, amplia com qualidade e devolve BGRA com cantos arredondados e sombra."""
    x0, y0, x1, y1 = [int(v) for v in reg]
    rec = img[y0:y1, x0:x1]
    esc = largura_px / rec.shape[1]
    interp = cv2.INTER_CUBIC if esc > 1 else cv2.INTER_AREA
    rec = cv2.resize(rec, (largura_px, int(rec.shape[0] * esc)), interpolation=interp)
    if esc > 1.2:  # devolve nitidez perdida na ampliação
        borrado = cv2.GaussianBlur(rec, (0, 0), 1.2)
        rec = cv2.addWeighted(rec, 1.5, borrado, -0.5, 0)
    h, w = rec.shape[:2]
    pad = 26
    H, W = h + 2 * pad, w + 2 * pad
    out = np.zeros((H, W, 4), np.float32)
    # sombra
    sombra = np.zeros((H, W), np.float32)
    cv2.rectangle(sombra, (pad + 6, pad + 12), (pad + w + 6, pad + h + 12), 1.0, -1)
    sombra = cv2.GaussianBlur(sombra, (0, 0), 12) * 0.45
    out[..., 3] = sombra
    # cartão com cantos arredondados
    mask = np.zeros((h, w), np.uint8)
    r = min(raio, h // 4)
    cv2.rectangle(mask, (r, 0), (w - r, h), 255, -1)
    cv2.rectangle(mask, (0, r), (w, h - r), 255, -1)
    for cx, cy in ((r, r), (w - r - 1, r), (r, h - r - 1), (w - r - 1, h - r - 1)):
        cv2.circle(mask, (cx, cy), r, 255, -1, cv2.LINE_AA)
    m = mask.astype(np.float32)[..., None] / 255
    area = out[pad:pad + h, pad:pad + w]
    area[..., :3] = rec.astype(np.float32) * m + area[..., :3] * (1 - m)
    area[..., 3:] = m + area[..., 3:] * (1 - m)
    return out


def colar(base: np.ndarray, cartao: np.ndarray, cx: float, cy: float, esc: float = 1.0, alfa: float = 1.0) -> None:
    if alfa <= 0.003 or esc <= 0.02:
        return
    c = cartao
    if abs(esc - 1) > 0.003:
        c = cv2.resize(cartao, (max(1, int(cartao.shape[1] * esc)), max(1, int(cartao.shape[0] * esc))),
                       interpolation=cv2.INTER_LINEAR)
    h, w = c.shape[:2]
    x0, y0 = int(round(cx - w / 2)), int(round(cy - h / 2))
    H, W = base.shape[:2]
    a0, b0 = max(0, x0), max(0, y0)
    a1, b1 = min(W, x0 + w), min(H, y0 + h)
    if a1 <= a0 or b1 <= b0:
        return
    sub = c[b0 - y0:b1 - y0, a0 - x0:a1 - x0]
    k = sub[..., 3:] * alfa
    roi = base[b0:b1, a0:a1].astype(np.float32)
    base[b0:b1, a0:a1] = (sub[..., :3] * k + roi * (1 - k)).astype(np.uint8)


def back(x: float) -> float:
    """Ease-out com leve passada (efeito "pop")."""
    x = min(1.0, max(0.0, x))
    s = 1.70158
    return 1 + (s + 1) * (x - 1) ** 3 + s * (x - 1) ** 2


def main() -> None:
    ap = argparse.ArgumentParser(description="Transforma a arte de um post num vídeo animado.")
    ap.add_argument("roteiro")
    ap.add_argument("-o", "--saida", required=True)
    ap.add_argument("--formato", choices=["vertical", "quadrado", "4x5"], default="vertical")
    ap.add_argument("--musica", help="música própria (padrão: trilha ambiente gerada)")
    ap.add_argument("--sem-musica", action="store_true")
    ap.add_argument("--narracao", help="áudio de narração (a trilha abaixa sob a voz e o vídeo acompanha a duração)")
    ap.add_argument("--sem-efeitos", action="store_true")
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--crf", type=int, default=18)
    args = ap.parse_args()

    cfg = json.load(open(args.roteiro, encoding="utf-8"))
    pasta_cfg = os.path.dirname(os.path.abspath(args.roteiro))
    caminho = cfg["imagem"] if os.path.isabs(cfg["imagem"]) else os.path.join(pasta_cfg, cfg["imagem"])
    img = cv2.imread(caminho, cv2.IMREAD_COLOR)
    if img is None:
        sys.exit(f"Não consegui abrir a imagem: {caminho}")
    ow, oh = {"vertical": (1080, 1920), "quadrado": (1080, 1080), "4x5": (1080, 1350)}[args.formato]
    fps = args.fps
    cor = hex_bgr(cfg.get("cor", "#E5B43A"))

    # linha do tempo das cenas
    abertura = float(cfg.get("abertura", 2.6)) if cfg.get("logo") else 0.0
    cenas = cfg["cenas"]
    t = abertura
    for c in cenas:
        c["ini"] = t
        t += float(c.get("duracao", 4))
        c["fim"] = t
    final = float(cfg.get("final", 4))
    dur = t + final
    if args.narracao:
        dn = float(subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", args.narracao],
            capture_output=True, text=True).stdout.strip() or 0)
        if dn > dur:  # estica as cenas proporcionalmente para acompanhar a narração
            k = (dn - final) / max(0.1, t)
            for c in cenas:
                c["ini"] *= k
                c["fim"] *= k
            abertura *= k
            dur = dn + 0.5
    ec.log(f"Vídeo de {dur:.1f}s, {len(cenas)} cenas, {ow}x{oh}")

    # elementos
    fundo_reg = cfg.get("fundo", [0, 0, img.shape[1], img.shape[0]])
    fx0, fy0, fx1, fy1 = fundo_reg
    fundo_src = img[fy0:fy1, fx0:fx1]
    esc_f = max(ow / fundo_src.shape[1], oh / fundo_src.shape[0]) * 1.12
    fundo_src = cv2.resize(fundo_src, (int(fundo_src.shape[1] * esc_f), int(fundo_src.shape[0] * esc_f)),
                           interpolation=cv2.INTER_CUBIC)
    # degradê escuro no topo para os cartões destacarem
    # escurece suavemente a metade de baixo, onde ficam os cartões (o rosto fica limpo em cima)
    yy = np.linspace(0, 1, oh)
    grad = (np.clip((yy - 0.40) / 0.35, 0, 1) ** 1.5 * 0.55)[:, None, None]
    for c in cenas:
        c["cartao"] = fazer_cartao(img, c["regiao"], int(ow * float(c.get("largura", 0.92))))
    logo_grande = logo_peq = None
    if cfg.get("logo"):
        logo_grande = fazer_cartao(img, cfg["logo"], int(ow * 0.62), raio=40)
        logo_peq = fazer_cartao(img, cfg["logo"], int(ow * 0.26), raio=20)
    # fundo da abertura e do final: a arte inteira desfocada
    arte_bg = cv2.GaussianBlur(cv2.resize(img, (ow // 6, oh // 6)), (0, 0), 4)
    arte_bg = cv2.resize(arte_bg, (ow, oh))
    arte_inteira = fazer_cartao(img, [0, 0, img.shape[1], img.shape[0]], int(ow * 0.94), raio=30)

    sons: list[tuple[float, str]] = []
    if logo_grande is not None:
        sons.append((0.25, "pop"))
    for i, c in enumerate(cenas):
        sons.append((c["ini"] + 0.05, "whoosh" if c.get("entrada", "pop") != "pop" else "pop"))
    if final > 0:
        sons.append((dur - final + 0.1, "whoosh"))

    tmp = tempfile.mkdtemp(prefix="post_")
    try:
        # áudio
        entradas = []
        if not args.sem_musica:
            mus = os.path.join(tmp, "musica.wav")
            ec.log("Preparando trilha...")
            ec.preparar_musica(args.musica, dur, mus, -20.0 if not args.narracao else -27.0, tmp)
            entradas.append(mus)
        if not args.sem_efeitos:
            fx = os.path.join(tmp, "efeitos.wav")
            ec.gerar_efeitos(fx, dur, sorted(sons))
            entradas.append(fx)
        filtro_a = None
        if args.narracao:
            entradas.insert(0, args.narracao)
        n_a = len(entradas)
        if n_a:
            if args.narracao and not args.sem_musica:
                filtro_a = ("[1:a]aformat=channel_layouts=stereo,asplit=2[nv][nk];"
                            "[2:a][nk]sidechaincompress=threshold=0.02:ratio=10:attack=20:release=600[md];"
                            "[nv][md]" + ("[3:a]" if n_a == 3 else "") +
                            f"amix=inputs={n_a}:duration=longest:normalize=0,loudnorm=I=-14:TP=-1.5[a]")
            else:
                filtro_a = ("".join(f"[{i + 1}:a]" for i in range(n_a)) +
                            f"amix=inputs={n_a}:duration=longest:normalize=0,loudnorm=I=-14:TP=-1.5[a]")
        cmd = ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{ow}x{oh}",
               "-r", str(fps), "-i", "-"]
        for e in entradas:
            cmd += ["-i", e]
        fc = "[0:v]format=yuv420p[v]" + (f";{filtro_a}" if filtro_a else "")
        cmd += ["-filter_complex", fc, "-map", "[v]"] + (["-map", "[a]"] if filtro_a else []) + [
            "-c:v", "libx264", "-preset", "medium", "-crf", str(args.crf), "-c:a", "aac", "-b:a", "192k",
            "-t", f"{dur:.3f}", "-movflags", "+faststart", os.path.abspath(args.saida)]
        enc = subprocess.Popen(cmd, stdin=subprocess.PIPE)

        total = int(dur * fps)
        H_fixo = None  # (cartão, início do cabeçalho)
        cart_y = 0.30
        ec.log("Renderizando...")
        for n in range(total):
            t = n / fps
            # fundo
            if t < abertura or t >= dur - final:
                quadro = arte_bg.copy()
                quadro = (quadro * 0.85).astype(np.uint8)
            else:
                frac = (t - abertura) / max(1, dur - final - abertura)
                k = 1 / (1 + 0.10 * frac)            # zoom lento
                fw, fh = fundo_src.shape[1] * k / 1.12, fundo_src.shape[0] * k / 1.12
                fw, fh = min(fw, fundo_src.shape[1]), min(fh, fundo_src.shape[0])
                fw = min(fw, fh * ow / oh)
                fh = fw * oh / ow
                r = np.array([(fundo_src.shape[1] - fw) / 2, fundo_src.shape[0] - fh - (fundo_src.shape[0] - fh) * 0.35, fw, fh])
                quadro = ec.recortar(fundo_src, r, ow, oh)
                verde = np.array([30, 52, 14], np.float32)  # tom escuro da marca no degradê
                quadro = (quadro * (1 - grad) + verde * grad).astype(np.uint8)
                # entrada suave do fundo após a abertura
                if t - abertura < 0.4 and abertura > 0:
                    a = ec.ease((t - abertura) / 0.4)
                    quadro = cv2.addWeighted(quadro, a, (arte_bg * 0.85).astype(np.uint8), 1 - a, 0)

            # logo
            if logo_grande is not None:
                if t < abertura:
                    e = back((t - 0.15) / 0.45)
                    sai = ec.ease((abertura - t) / 0.3)
                    colar(quadro, logo_grande, ow / 2, oh * 0.45, max(0.02, e), min(1, sai * 1.0))
                elif t < dur - final:
                    a = ec.ease((t - abertura) / 0.4)
                    colar(quadro, logo_peq, ow / 2, oh * 0.075, 1.0, a)

            # cabeçalho fixo
            for c in cenas:
                if c["ini"] <= t < c["fim"] and c.get("limpar"):
                    H_fixo = None
            if H_fixo is not None and t < dur - final:
                cart, t_ini = H_fixo
                a = ec.ease((t - t_ini) / 0.35)
                y_ini = oh * float(cart_y)
                y_fim = oh * float(cfg.get("cabecalho_y", 0.235))
                colar(quadro, cart, ow / 2, y_ini + (y_fim - y_ini) * a, 1 - 0.18 * a, 1.0)

            # cena atual
            for c in cenas:
                if not (c["ini"] <= t < c["fim"]):
                    continue
                d = t - c["ini"]
                resta = c["fim"] - t
                ent = c.get("entrada", "pop")
                cy = oh * float(c.get("y", 0.30 if c.get("fixar") else 0.50))
                cx = ow / 2
                esc, alfa = 1.0, 1.0
                if ent == "pop":
                    esc = max(0.02, back(d / 0.45))
                    alfa = ec.ease(d / 0.2)
                else:
                    p = ec.ease(d / 0.45)
                    dx = {"direita": ow, "esquerda": -ow}.get(ent, 0)
                    dy = oh * 0.6 if ent == "baixo" else 0
                    cx += dx * (1 - p)
                    cy += dy * (1 - p)
                    alfa = min(1.0, p * 1.5)
                if c.get("pulso") and d > 0.6:
                    esc *= 1 + 0.02 * math.sin((d - 0.6) * 2 * math.pi / 1.6)
                if not c.get("fixar"):
                    alfa *= ec.ease(resta / 0.25)
                    esc *= 1 - 0.04 * (1 - ec.ease(resta / 0.25))
                colar(quadro, c["cartao"], cx, cy, esc, alfa)
                if c.get("fixar") and resta < 1 / fps + 1e-6:
                    H_fixo = (c["cartao"], c["fim"])
                    cart_y = c.get("y", 0.30)

            # final: arte inteira
            if final > 0 and t >= dur - final:
                d = t - (dur - final)
                e = ec.ease(d / 0.5)
                colar(quadro, arte_inteira, ow / 2, oh / 2, 0.85 + 0.15 * e + 0.02 * d / final, e)
                if t > dur - 0.6:
                    quadro = (quadro * ec.ease((dur - t) / 0.6)).astype(np.uint8)

            # barra de progresso ("minuto")
            prog = t / dur
            cv2.rectangle(quadro, (0, oh - 12), (ow, oh), (25, 25, 25), -1)
            cv2.rectangle(quadro, (0, oh - 12), (int(ow * prog), oh), cor, -1)
            enc.stdin.write(quadro.tobytes())
            if n % (fps * 2) == 0:
                print(f"\r[post] {100 * n / total:5.1f}%", end="", flush=True)
        enc.stdin.close()
        enc.wait()
        print()
        if enc.returncode:
            sys.exit("Falha no ffmpeg.")
        ec.log(f"Pronto: {args.saida}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
