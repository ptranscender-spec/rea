#!/usr/bin/env bash
# Atalhos de edição de vídeo com ffmpeg. Uso: video.sh <comando> [argumentos]
# Rode "video.sh ajuda" para a lista de comandos.
set -euo pipefail

die() { echo "Erro: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null || die "$1 não encontrado (instale o ffmpeg)"; }
need ffmpeg; need ffprobe

FF=(ffmpeg -hide_banner -loglevel error -stats -y)
# H.264 + AAC: toca em qualquer lugar (Instagram, TikTok, YouTube, WhatsApp)
VENC=(-c:v libx264 -preset medium -crf "${CRF:-20}" -pix_fmt yuv420p -movflags +faststart)
AENC=(-c:a aac -b:a 192k)

has_audio() { [ -n "$(ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "$1")" ]; }
duracao() { ffprobe -v error -show_entries format=duration -of csv=p=0 "$1"; }

cmd="${1:-ajuda}"; shift || true
case "$cmd" in
  info) # info <video>
    f="${1:?video}"
    ffprobe -v error -show_entries format=duration,size,bit_rate:stream=index,codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels \
      -of default=nw=1 "$f" ;;

  cortar) # cortar <entrada> <inicio> <fim> <saida>   (tempos: 00:01:05 ou 65.5)
    "${FF[@]}" -ss "${2:?inicio}" -to "${3:?fim}" -i "${1:?entrada}" "${VENC[@]}" "${AENC[@]}" "${4:?saida}" ;;

  cortar-rapido) # cortar-rapido <entrada> <inicio> <fim> <saida>  (sem recodificar; corta no keyframe)
    "${FF[@]}" -ss "${2:?inicio}" -to "${3:?fim}" -i "${1:?entrada}" -c copy -avoid_negative_ts make_zero "${4:?saida}" ;;

  juntar) # juntar <saida> <video1> <video2> [...]   (normaliza tudo para o tamanho do 1º)
    out="${1:?saida}"; shift; [ $# -ge 2 ] || die "informe pelo menos 2 vídeos"
    read -r W H < <(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=x "$1" | tr x ' ')
    inputs=(); filt=""; i=0
    for f in "$@"; do
      inputs+=(-i "$f")
      if has_audio "$f"; then a="[$i:a]aresample=48000,aformat=channel_layouts=stereo[a$i];"
      else a="anullsrc=r=48000:cl=stereo,atrim=0:$(duracao "$f")[a$i];"; fi
      filt+="[$i:v]scale=$W:$H:force_original_aspect_ratio=decrease,pad=$W:$H:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v$i];$a"
      i=$((i+1))
    done
    for ((j=0; j<i; j++)); do filt+="[v$j][a$j]"; done
    filt+="concat=n=$i:v=1:a=1[v][a]"
    "${FF[@]}" "${inputs[@]}" -filter_complex "$filt" -map "[v]" -map "[a]" "${VENC[@]}" "${AENC[@]}" "$out" ;;

  vertical) # vertical <entrada> <saida> [blur|corte]   9:16 1080x1920 para Reels/TikTok/Shorts
    modo="${3:-blur}"
    if [ "$modo" = corte ]; then
      vf="scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1"
      "${FF[@]}" -i "${1:?entrada}" -vf "$vf" "${VENC[@]}" "${AENC[@]}" "${2:?saida}"
    else
      fc="[0:v]split[a][b];[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:5[fundo];[b]scale=1080:1920:force_original_aspect_ratio=decrease[frente];[fundo][frente]overlay=(W-w)/2:(H-h)/2,setsar=1[v]"
      "${FF[@]}" -i "${1:?entrada}" -filter_complex "$fc" -map "[v]" -map "0:a?" "${VENC[@]}" "${AENC[@]}" "${2:?saida}"
    fi ;;

  quadrado) # quadrado <entrada> <saida>   1080x1080 com fundo desfocado
    fc="[0:v]split[a][b];[a]scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080,boxblur=20:5[fundo];[b]scale=1080:1080:force_original_aspect_ratio=decrease[frente];[fundo][frente]overlay=(W-w)/2:(H-h)/2,setsar=1[v]"
    "${FF[@]}" -i "${1:?entrada}" -filter_complex "$fc" -map "[v]" -map "0:a?" "${VENC[@]}" "${AENC[@]}" "${2:?saida}" ;;

  legendar) # legendar <entrada> <legenda.srt|.ass> <saida>   (queima a legenda no vídeo)
    sub="$(realpath "${2:?legenda}")"
    estilo="${ESTILO:-FontName=DejaVu Sans,FontSize=16,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=0,Alignment=2,MarginV=60}"
    sub_esc="${sub//:/\\:}"; sub_esc="${sub_esc//\'/\\\'}"
    "${FF[@]}" -i "${1:?entrada}" -vf "subtitles='$sub_esc':force_style='$estilo'" "${VENC[@]}" -c:a copy "${3:?saida}" ;;

  legenda-faixa) # legenda-faixa <entrada> <legenda.srt> <saida.mp4>   (legenda liga/desliga, sem queimar)
    "${FF[@]}" -i "${1:?entrada}" -i "${2:?legenda}" -map 0 -map 1 -c copy -c:s mov_text -metadata:s:s:0 language=por "${3:?saida}" ;;

  texto) # texto <entrada> <"texto"> <saida> [inicio] [fim]   (título/texto na tela)
    tf="$(mktemp "${TMPDIR:-/tmp}/texto.XXXXXX")"; trap 'rm -f "$tf"' EXIT; printf '%s' "${2:?texto}" > "$tf"
    en=""; [ -n "${4:-}" ] && en=":enable='between(t,${4},${5:-99999})'"
    "${FF[@]}" -i "${1:?entrada}" -vf "drawtext=textfile='$tf':expansion=none:fontcolor=white:fontsize=h/18:box=1:boxcolor=black@0.5:boxborderw=20:x=(w-text_w)/2:y=h*0.12$en" \
      "${VENC[@]}" -c:a copy "${3:?saida}" ;;

  logo) # logo <entrada> <logo.png> <saida> [posicao: se|sd|ie|id]   marca d'água
    case "${4:-sd}" in
      se) pos="20:20" ;; sd) pos="W-w-20:20" ;; ie) pos="20:H-h-20" ;; *) pos="W-w-20:H-h-20" ;;
    esac
    "${FF[@]}" -i "${1:?entrada}" -i "${2:?logo}" -filter_complex "[1:v][0:v]scale2ref=w=oh*mdar:h=ih*0.08[lg][base];[lg]format=rgba,colorchannelmixer=aa=0.85[lg2];[base][lg2]overlay=$pos[v]" \
      -map "[v]" -map "0:a?" "${VENC[@]}" -c:a copy "${3:?saida}" ;;

  musica) # musica <entrada> <musica> <saida> [volume_musica=0.15]   trilha de fundo com ducking na voz
    vol="${4:-0.15}"; d="$(duracao "$1")"
    if has_audio "$1"; then
      fc="[1:a]volume=$vol,aloop=loop=-1:size=2e9,atrim=0:$d[m];[m][0:a]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[duck];[0:a][duck]amix=inputs=2:duration=first:normalize=0,afade=t=out:st=$(echo "$d - 2" | bc -l):d=2[a]"
    else
      fc="[1:a]volume=$vol,aloop=loop=-1:size=2e9,atrim=0:$d,afade=t=out:st=$(echo "$d - 2" | bc -l):d=2[a]"
    fi
    "${FF[@]}" -i "${1:?entrada}" -i "${2:?musica}" -filter_complex "$fc" -map 0:v -map "[a]" -c:v copy "${AENC[@]}" -shortest "${3:?saida}" ;;

  trocar-audio) # trocar-audio <entrada> <audio> <saida>
    "${FF[@]}" -i "${1:?entrada}" -i "${2:?audio}" -map 0:v -map 1:a -c:v copy "${AENC[@]}" -shortest "${3:?saida}" ;;

  mudo) # mudo <entrada> <saida>
    "${FF[@]}" -i "${1:?entrada}" -an -c:v copy "${2:?saida}" ;;

  extrair-audio) # extrair-audio <entrada> <saida.mp3|.wav|.m4a>
    "${FF[@]}" -i "${1:?entrada}" -vn "${2:?saida}" ;;

  normalizar) # normalizar <entrada> <saida>   volume padrão de redes sociais (-14 LUFS)
    "${FF[@]}" -i "${1:?entrada}" -af loudnorm=I=-14:TP=-1.5:LRA=11 -c:v copy "${AENC[@]}" "${2:?saida}" ;;

  limpar-voz) # limpar-voz <entrada> <saida>   tira chiado/ruído leve e graves de fundo
    "${FF[@]}" -i "${1:?entrada}" -af "highpass=f=80,afftdn=nf=-25,loudnorm=I=-14:TP=-1.5" -c:v copy "${AENC[@]}" "${2:?saida}" ;;

  tirar-silencio) # tirar-silencio <entrada> <saida> [limiar_dB=-35] [min_seg=0.6]   corta pausas ("jump cut")
    th="${3:--35}"; md="${4:-0.6}"; in="${1:?entrada}"; out="${2:?saida}"
    total="$(duracao "$in")"
    mapfile -t ev < <(ffmpeg -hide_banner -i "$in" -af "silencedetect=n=${th}dB:d=$md" -f null - 2>&1 |
      grep -oE 'silence_(start|end): -?[0-9.]+' | sed 's/silence_//; s/: / /')
    sel=""; ini=0
    for e in "${ev[@]}"; do
      read -r tipo t <<<"$e"
      if [ "$tipo" = start ]; then fim="$(echo "$t + 0.1" | bc -l)"; sel+="between(t,$ini,$fim)+"
      else ini="$(echo "$t - 0.1" | bc -l)"; fi
    done
    sel+="between(t,$ini,$total)"
    [ "${#ev[@]}" -eq 0 ] && { echo "Nenhum silêncio encontrado; copiando."; cp "$in" "$out"; exit 0; }
    "${FF[@]}" -i "$in" -vf "select='$sel',setpts=N/FRAME_RATE/TB" -af "aselect='$sel',asetpts=N/SR/TB" "${VENC[@]}" "${AENC[@]}" "$out" ;;

  velocidade) # velocidade <entrada> <fator> <saida>   (2 = 2x mais rápido, 0.5 = câmera lenta)
    f="${2:?fator}"; atempo=""; r="$f"
    while (( $(echo "$r > 2" | bc -l) )); do atempo+="atempo=2,"; r="$(echo "$r / 2" | bc -l)"; done
    while (( $(echo "$r < 0.5" | bc -l) )); do atempo+="atempo=0.5,"; r="$(echo "$r / 0.5" | bc -l)"; done
    atempo+="atempo=$r"
    "${FF[@]}" -i "${1:?entrada}" -filter:v "setpts=PTS/$f" -filter:a "$atempo" "${VENC[@]}" "${AENC[@]}" "${3:?saida}" ;;

  fade) # fade <entrada> <saida> [segundos=0.5]   fade in/out de imagem e som
    s="${3:-0.5}"; d="$(duracao "$1")"; st="$(echo "$d - $s" | bc -l)"
    "${FF[@]}" -i "${1:?entrada}" -vf "fade=t=in:st=0:d=$s,fade=t=out:st=$st:d=$s" -af "afade=t=in:st=0:d=$s,afade=t=out:st=$st:d=$s" \
      "${VENC[@]}" "${AENC[@]}" "${2:?saida}" ;;

  comprimir) # comprimir <entrada> <saida> [altura=1080]   menor arquivo, boa qualidade (CRF=23..28)
    CRF="${CRF:-26}"
    "${FF[@]}" -i "${1:?entrada}" -vf "scale=-2:'min(${3:-1080},ih)'" -c:v libx264 -preset slow -crf "$CRF" -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 128k "${2:?saida}" ;;

  whatsapp) # whatsapp <entrada> <saida>   cabe no limite (~16 MB) do WhatsApp
    d="$(duracao "$1")"; kbps="$(echo "(15*8192/$d) - 128" | bc)"; [ "$kbps" -lt 200 ] && kbps=200
    "${FF[@]}" -i "${1:?entrada}" -vf "scale=-2:'min(720,ih)'" -c:v libx264 -preset slow -b:v "${kbps}k" -maxrate "${kbps}k" -bufsize "$((kbps*2))k" \
      -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 128k "${2:?saida}" ;;

  gif) # gif <entrada> <saida.gif> [largura=480] [fps=12]
    w="${3:-480}"; fps="${4:-12}"
    "${FF[@]}" -i "${1:?entrada}" -vf "fps=$fps,scale=$w:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse" "${2:?saida}" ;;

  capa) # capa <entrada> <tempo> <saida.jpg>   frame para thumbnail
    "${FF[@]}" -ss "${2:?tempo}" -i "${1:?entrada}" -frames:v 1 -q:v 2 "${3:?saida}" ;;

  frames) # frames <entrada> <pasta> [a_cada_seg=5]   tira frames para revisar o vídeo visualmente
    mkdir -p "${2:?pasta}"
    "${FF[@]}" -i "${1:?entrada}" -vf "fps=1/${3:-5},scale=640:-1" "$2/frame_%04d.jpg" ;;

  ajuda|*)
    grep -E '^  [a-z-]+\) #' "$0" | sed 's/) # /\t/; s/^  /  /' ;;
esac
