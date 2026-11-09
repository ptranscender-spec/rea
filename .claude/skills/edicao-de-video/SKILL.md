---
name: edicao-de-video
description: Edita vídeos por conversa, sem precisar de editor. O usuário manda o vídeo e pede em linguagem natural ("deixa mais dinâmico", "corta as pausas", "põe legenda e zoom", "coloca um título") e recebe o vídeo pronto. Edição automática completa de vídeos falados (uma pessoa para a câmera, conversas, podcasts e entrevistas): corte de pausas, zoom em quem está falando e zoom "soco" no ritmo das frases, transições com whoosh, voz tratada, legendas animadas palavra a palavra, título-gancho colorido, nome e cargo, trilha de fundo e efeitos sonoros. Também: cortar, juntar clipes, formato vertical 9:16 para Reels/TikTok/Shorts, legendas (queimadas ou em faixa), texto na tela, logo/marca d'água, trilha de fundo com ducking, tirar silêncios (jump cut), normalizar e limpar áudio, velocidade, fade, comprimir, versão para WhatsApp, GIF, thumbnail. Use sempre que o usuário pedir para editar, cortar, recortar, legendar, converter, redimensionar, comprimir ou preparar um vídeo para redes sociais, mesmo sem dizer "ffmpeg".
---

# Edição de vídeo

## Editar conversando (o jeito principal de usar)

O usuário não precisa saber nenhum comando: ele manda o vídeo e diz o que quer, e você
traduz o pedido nas opções de `scripts/editar_conversa.py`. Trate cada mensagem como uma
rodada de edição:

1. Mande o vídeo (uma prévia curta antes, se for longo) e a imagem `linha_do_tempo.png`
   de `<saida>_analise/`, que mostra as faixas T (textos), V (planos), A1 (voz), A2 (trilha) e
   A3 (efeitos). Use a ferramenta de enviar arquivos quando houver uma.
2. Responda numa linha o que mudou ("Pronto! Cortei as pausas: 12 s a menos.").
3. No próximo pedido, parta do comando anterior, que fica salvo em
   `<saida>_analise/comando.txt`, e mude só o que foi pedido. A transcrição é reaproveitada,
   então as rodadas seguintes são rápidas.

| O usuário diz | Opção |
|---|---|
| "deixa mais dinâmico", "estilo Reels/TikTok", "mais ritmo" | `--dinamico` (corta pausas, zoom "soco" a cada frase, planos curtos, efeitos) |
| "mais dinâmico ainda" / "menos agitado" | `--ritmo 2` / `--ritmo 4.5` (segundos entre trocas de zoom) |
| "corta as pausas", "tira os silêncios", "tira os vácuos" | `--cortar-pausas` (`--pausa-minima 0.3` corta mais, `0.7` mais natural) |
| "põe legenda" | é o padrão (transcrição automática); "legenda em caixa alta": `--maiusculas` |
| "põe zoom" | é o padrão (zoom em quem fala); "zoom mais fechado": `--zoom 1.3` |
| "coloca um título/gancho no começo: sem pagar editor" | `--titulo "sem pagar ~~editor~~"` (riscar a palavra que se nega; ` / ` separa linhas) |
| "efeito sonoro", "whoosh" / "tira os efeitos" | `--efeitos` / não usar `--efeitos` nem `--dinamico` (ou `--volume-efeitos -60`) |
| "põe música" / "tira a música" / "música mais baixa" | `--musica arquivo.mp3` ou trilha gerada / `--sem-musica` / `--volume-musica -31` |
| "melhora o áudio", "tem muito ruído" | `--voz forte` |
| "pra Reels/TikTok/Stories" | `--formato vertical` · feed: `--formato quadrado` · YouTube: `--formato horizontal` |
| "coloca meu nome" | `--nomes "Nome" --cargos "Cargo"` |
| "usa a cor da minha marca" | `--cor-destaque "#HEX"` |
| "corta do minuto 1 ao 2" | `video.sh cortar` antes, ou `--trecho 1:00-2:00` |

Se o pedido for vago ("deixa bonito", "edita pra mim"), use `--dinamico --formato vertical
--maiusculas` para redes sociais, ou o padrão para YouTube/podcast, e pergunte só o que não
dá para adivinhar: o nome que aparece na tela e o título-gancho, se ele quiser um.

## Vídeos falados (uma pessoa, conversa, podcast, entrevista): edição completa automática

Para qualquer vídeo de gente falando, use `scripts/editar_conversa.py`. Ele entrega, num
comando só:
- **zoom em quem está falando**, alternando entre as pessoas, com plano aberto de abertura e de
  respiro em falas longas (a cada ~9 s), transição de zoom animado ou dissolve e um leve zoom
  lento durante cada plano;
- **voz tratada**: ruído e chiado reduzidos (o limiar se ajusta ao nível medido no vídeo),
  silêncio entre frases limpo, graves embolados cortados, presença, de-esser, compressão e
  volume final em -14 LUFS (padrão de Instagram/YouTube/TikTok);
- **legendas animadas** palavra a palavra (a palavra falada fica em destaque), fonte em
  negrito com contorno, frases curtas, posição que acompanha o enquadramento;
- **nome e cargo** de cada pessoa em lower third animado, na primeira vez que ela aparece;
- **trilha de fundo** (sua música, ou uma trilha ambiente original gerada) que abaixa sozinha
  quando alguém fala;
- correção de cor leve, nitidez e vinheta;
- com `--dinamico`: **pausas cortadas** (emenda sem estalo; a legenda acompanha), **zoom "soco"**
  alternando a cada frase (com uma pessoa só, alterna normal, close e zoom apertado), cortes
  sempre no início de uma palavra, e **efeitos sonoros** (whoosh nas transições, pop nos textos);
- com `--titulo`: **título-gancho** grande e colorido no começo, uma palavra por linha, entrada
  com "pop" e risco vermelho animado na palavra entre `~~ ~~`.

### Passo a passo

1. **Dependências** (uma vez): `pip install -r <pasta da skill>/scripts/requirements.txt`.
   Precisa de `opencv-python-headless` **4.x** (a 5.x não traz o detector de rostos).
2. **Pergunte ao usuário** o que não dá para adivinhar: nomes e cargos (da esquerda para a
   direita no vídeo), formato (original/horizontal, vertical 9:16, quadrado) e se tem uma
   música própria. Se ele não souber, siga com os padrões.
3. **Análise primeiro** (rápida, não renderiza):
   ```bash
   C="<pasta da skill>/scripts/editar_conversa.py"
   python3 $C entrada.mp4 -o final.mp4 --nomes "Ana Souza" "Carlos Lima" \
       --cargos "Apresentadora" "Convidado" --so-analise
   ```
   Isso cria `final_analise/` com:
   - `pessoas.jpg`: abra e confira se cada rosto tem a caixa e o nome certos. Se os nomes
     estiverem trocados, inverta a ordem em `--nomes`. Se faltar ou sobrar gente, use `--pessoas N`.
   - `planos.json`: os cortes (início, fim, plano aberto ou close de qual pessoa).
   - `transcricao.json`: as palavras da legenda. **Revise** a grafia de nomes próprios,
     marcas e termos técnicos e corrija direto no JSON. As próximas execuções reutilizam esse
     arquivo; apague-o para transcrever de novo.
4. **Prévia** de um trecho, para o usuário aprovar o visual antes do render longo:
   `python3 $C entrada.mp4 -o previa.mp4 --nomes ... --trecho 0:00-0:40 --preset veryfast`
   Extraia 2 ou 3 quadros (`video.sh capa`) e confira legenda, nomes e enquadramento.
5. **Render final** com o mesmo comando, sem `--so-analise` e sem `--trecho`. Ele gera
   `final.mp4` e `final.srt`. Para conferir: `video.sh info final.mp4`, alguns quadros e a duração.

### Opções úteis

| Opção | Efeito |
|---|---|
| `--formato vertical` | 1080x1920. Abre com tela dividida (uma pessoa em cima e outra embaixo, legenda no meio) e alterna closes em tela cheia |
| `--formato quadrado` / `horizontal` | 1080x1080 / 1920x1080 |
| `--musica trilha.mp3` / `--sem-musica` | música própria (fica em loop e com fade) ou nenhuma |
| `--volume-musica -24` | trilha mais alta (padrão -27 LUFS; -30 fica mais discreta) |
| `--voz leve\|media\|forte` | intensidade da limpeza de ruído (`forte` para ambiente barulhento) |
| `--maiusculas` | legenda em CAIXA ALTA (estilo Reels) |
| `--estilo-legenda caixa` | legenda sobre faixa escura, sem destaque por palavra |
| `--cor-destaque "#00E5FF"` | cor da palavra falada e da faixa do cargo (use a cor da marca) |
| `--fonte "Montserrat" --pasta-fontes ./fontes` | fonte da marca (arquivo .ttf/.otf na pasta) |
| `--zoom 1.3` | closes mais fechados (`0.8` mais abertos) |
| `--transicao corte\|fade\|zoom` | estilo da troca de plano (padrão `zoom`; entre duas pessoas é sempre dissolve curto) |
| `--max-close 7` / `--min-plano 1.5` | ritmo: planos mais curtos deixam mais dinâmico |
| `--abertura 0` | começa direto no close |
| `--legenda arquivo.srt` / `nenhuma` | legenda pronta em vez de transcrever |
| `--modelo medium` | transcrição mais precisa (mais lenta). Padrão `small` |
| `--falantes cortes.csv` | cortes manuais, linhas `inicio,fim,pessoa` (pessoa 0 = plano aberto) |
| `--sem-cor` | não mexe na cor nem na nitidez |
| `--dinamico` | atalho para o estilo Reels: `--cortar-pausas --efeitos --ritmo 2.8`, planos curtos, abertura de 1,5 s |
| `--cortar-pausas --pausa-minima 0.45` | corta silêncios maiores que 0,45 s |
| `--ritmo 3` | troca o aperto do zoom a cada ~3 s, sempre no início de uma frase |
| `--efeitos --volume-efeitos -4` | faixa de efeitos sonoros (sintetizados, sem direitos autorais) |
| `--titulo "texto" --titulo-ate 3.5 --fonte-titulo "Fonte"` | título-gancho animado nos primeiros segundos |

### Como decide quem está falando

1. Acha os rostos e agrupa por posição (cada grupo é uma pessoa, da esquerda para a direita).
2. Mede o movimento da boca de cada pessoa, descontando o movimento da cabeça, e cruza com o
   áudio: só há close quando alguém fala.
3. Se cada pessoa tem um microfone num canal (estéreo L/R), usa o volume de cada canal como
   pista principal. É a forma mais confiável: recomende gravar assim.
4. Suaviza o resultado: planos de no mínimo 2 s, pausas curtas não cortam, sobreposição de
   falas vira plano aberto.

**Se errar** (pessoas de perfil, rosto coberto, câmera se movendo): rode com `--so-analise`,
veja `planos.json`, escreva um CSV com os trechos certos e passe em `--falantes`.

**Limitações:** foi pensado para câmera fixa e pessoas sentadas. Com vários ângulos de câmera
já editados, use `--falantes` ou só as legendas/voz (`--abertura 0 --max-close 9999`). Sem
internet na primeira execução, o modelo do Whisper não baixa: passe `--legenda arquivo.srt`.
O render roda em cerca de 0,6x o tempo real em 1080p com 4 núcleos (10 min de vídeo levam ~15 min).

## Outras edições (comandos rápidos)

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
