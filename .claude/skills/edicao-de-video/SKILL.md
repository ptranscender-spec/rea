---
name: edicao-de-video
description: Edita vídeos com ffmpeg: cortar, juntar clipes, formato vertical 9:16 para Reels/TikTok/Shorts, legendas (queimadas ou em faixa), texto na tela, logo/marca d'água, trilha de fundo com ducking, tirar silêncios (jump cut), normalizar e limpar áudio, velocidade, fade, comprimir, versão para WhatsApp, GIF, thumbnail. Use sempre que o usuário pedir para editar, cortar, recortar, legendar, converter, redimensionar, comprimir ou preparar um vídeo para redes sociais, mesmo sem dizer "ffmpeg".
---

# Edição de vídeo

Toda edição passa pelo ffmpeg. O script `scripts/video.sh` (nesta pasta) já traz as
receitas testadas; use-o antes de escrever um comando ffmpeg do zero.

```bash
V="<pasta desta skill>/scripts/video.sh"
$V ajuda          # lista todos os comandos
```

## Fluxo de trabalho

1. **Inspecione primeiro:** `$V info entrada.mp4` (duração, resolução, fps, se tem áudio).
   Para ver o conteúdo, tire frames com `$V frames entrada.mp4 frames/ 5` e abra as imagens.
2. **Nunca sobrescreva o original.** Grave cada etapa num arquivo novo
   (`01_corte.mp4`, `02_vertical.mp4`, ...) para poder voltar atrás.
3. **Encadeie etapas nesta ordem** (evita retrabalho e perda de qualidade):
   cortar/juntar → tirar silêncio → velocidade → formato (vertical/quadrado) →
   texto/logo/legenda → música → normalizar áudio → comprimir/exportar.
4. **Confira o resultado:** `$V info` na saída e um frame com `$V capa saida.mp4 <tempo> check.jpg`
   para olhar legenda, texto e enquadramento antes de entregar.
5. Entregue o arquivo final e diga o que foi feito, duração e tamanho.

## Comandos

| Objetivo | Comando |
|---|---|
| Informações | `info <video>` |
| Cortar trecho (preciso) | `cortar <entrada> <inicio> <fim> <saida>` — tempos `00:01:05` ou `65.5` |
| Cortar sem recodificar (rápido, corta no keyframe) | `cortar-rapido <entrada> <inicio> <fim> <saida>` |
| Juntar clipes (tamanhos/fps diferentes ok) | `juntar <saida> <v1> <v2> [...]` |
| Vertical 1080x1920 (Reels/TikTok/Shorts) | `vertical <entrada> <saida> [blur\|corte]` |
| Quadrado 1080x1080 | `quadrado <entrada> <saida>` |
| Legenda queimada no vídeo | `legendar <entrada> <legenda.srt> <saida>` |
| Legenda liga/desliga (faixa) | `legenda-faixa <entrada> <legenda.srt> <saida.mp4>` |
| Texto/título na tela | `texto <entrada> "texto" <saida> [inicio] [fim]` |
| Logo / marca d'água | `logo <entrada> <logo.png> <saida> [se\|sd\|ie\|id]` |
| Música de fundo (abaixa sozinha quando há voz) | `musica <entrada> <musica> <saida> [volume=0.15]` |
| Trocar o áudio | `trocar-audio <entrada> <audio> <saida>` |
| Remover áudio | `mudo <entrada> <saida>` |
| Extrair áudio | `extrair-audio <entrada> <saida.mp3>` |
| Volume padrão de redes (-14 LUFS) | `normalizar <entrada> <saida>` |
| Limpar ruído da voz | `limpar-voz <entrada> <saida>` |
| Tirar pausas (jump cut) | `tirar-silencio <entrada> <saida> [limiar_dB=-35] [min_seg=0.6]` |
| Acelerar / câmera lenta | `velocidade <entrada> <fator> <saida>` (2 = 2x, 0.5 = metade) |
| Fade in/out | `fade <entrada> <saida> [segundos=0.5]` |
| Comprimir | `comprimir <entrada> <saida> [altura=1080]` (`CRF=23` mais qualidade, `CRF=30` menor) |
| Caber no WhatsApp (~16 MB) | `whatsapp <entrada> <saida>` |
| GIF | `gif <entrada> <saida.gif> [largura=480] [fps=12]` |
| Thumbnail | `capa <entrada> <tempo> <saida.jpg>` |
| Frames para revisão | `frames <entrada> <pasta> [a_cada_seg=5]` |

Variáveis opcionais: `CRF` (qualidade do vídeo, padrão 20; menor = melhor) e `ESTILO`
(estilo ASS da legenda, ex.: `ESTILO="FontName=Inter,FontSize=20,Bold=1,Alignment=2,MarginV=80"`).

## Legendas a partir da fala

Se o usuário quer legenda e não tem o `.srt`:
- Se houver `whisper` (`pip install openai-whisper`) ou `whisper.cpp`, transcreva:
  `whisper entrada.mp4 --language pt --output_format srt --output_dir .`
- Sem transcritor, peça o texto ao usuário ou escreva o `.srt` à mão no formato:
  ```
  1
  00:00:00,500 --> 00:00:03,000
  Primeira frase
  ```
- Para Reels/TikTok, prefira frases curtas (até ~35 caracteres por linha), fonte grande,
  `Alignment=2` e `MarginV` alto para a legenda não ficar sob os botões do app.

## Padrões por destino

| Destino | Formato | Observações |
|---|---|---|
| Reels / TikTok / Shorts | 1080x1920, 30 fps | `vertical`, legendas no terço central, até 90 s (Reels) / 60 s (Shorts) |
| Feed Instagram | 1080x1350 ou 1080x1080 | `quadrado` ou crop 4:5 |
| YouTube | 1920x1080 | H.264, `normalizar` (-14 LUFS) |
| WhatsApp | ≤ 720p, ≤ 16 MB | `whatsapp` |

Para 4:5 (1080x1350), adapte o filtro do `quadrado` trocando `1080:1080` por `1080:1350`.

## Quando sair do script

Escreva o ffmpeg diretamente para casos não cobertos (picture-in-picture, tela dividida,
transições `xfade`, correção de cor `eq`/`curves`, estabilização `deshake`, chroma key
`colorkey`). Regras que o script já segue e que valem para comandos novos:
- Saída `-c:v libx264 -pix_fmt yuv420p -movflags +faststart` + `-c:a aac` (toca em qualquer lugar).
- Use `-map "0:a?"` para não falhar em vídeos sem áudio.
- Coloque `-ss` antes do `-i` para buscar rápido; recodifique quando precisar de corte preciso.
- Textos com `:`, `%` ou aspas: use `drawtext=textfile=...:expansion=none` em vez de `text=`.
- Verifique o resultado com `ffprobe` e um frame extraído, nunca só pelo código de saída.

## Requisitos

`ffmpeg` (com libx264 e libass), `ffprobe` e `bc`. Instalação:
Linux `sudo apt install ffmpeg bc` · macOS `brew install ffmpeg` · Windows `winget install ffmpeg`
(no Windows, rode o script pelo Git Bash ou WSL).
