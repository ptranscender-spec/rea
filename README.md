# Instalação completa do REA

Scripts para instalar o [REA (Reverse Engineer Anything)](https://github.com/morluto/rea) com todos os motores e ferramentas externas gratuitas.

## Linux (Debian/Ubuntu) ou macOS
```bash
bash instalar-rea-completo.sh
```

## Windows (PowerShell como Administrador)
```powershell
Set-ExecutionPolicy -Scope Process Bypass; .\instalar-rea-completo.ps1
```

Depois, abra um novo terminal, reinicie o seu agente (ex.: Claude Code) e confira com `rea doctor`.

## O que é instalado
REA, Ghidra 12.1.4, JADX MCP 0.7.1, Rizin, Kuna, Wakaru, Frida, mitmproxy, pwntools,
GDB/LLDB, objdump, WABT, TShark, sigrok, ADB, apktool, binwalk e unblob
(no Linux/macOS também o Hopper demo, com sua confirmação).

IDA Pro e JEB são pagos e não estão incluídos.

## Funções
Veja [REA-funcoes-completas.md](REA-funcoes-completas.md) para a lista de todos os comandos.

## Skill de edição de vídeo
Em [.claude/skills/edicao-de-video](.claude/skills/edicao-de-video/SKILL.md) há uma skill para o Claude Code
que edita vídeos por conversa ("deixa mais dinâmico", "corta as pausas", "põe legenda e zoom"). Faz a edição completa sozinha: zoom em quem está falando,
cortes de pausa, transições, voz tratada, legendas animadas, título-gancho, nomes, trilha e efeitos sonoros. Também corta, junta, converte para vertical, comprime etc.
Ela é carregada automaticamente ao abrir o Claude Code nesta pasta; para usar em qualquer projeto,
copie a pasta para `~/.claude/skills/`.

## Aplicativo para clientes (sem IA, sem custo por uso)
A pasta [aplicativo](aplicativo/) tem um **Editor de Vídeo** que roda no computador do cliente e abre no
navegador. Ele usa o mesmo motor da skill, mas com uma tela de opções em vez de conversa, então não
gasta tokens. Tem duas abas: **Editar vídeo** (pausas, zoom, legenda, título, nomes, música, efeitos,
imagens de apoio) e **Post → Vídeo** (marca os blocos da arte com o mouse e gera o Reels).

Para gerar o pacote de entrega: `python3 aplicativo/empacotar.py` → `dist/EditorDeVideo.zip`.
O cliente descompacta e dá dois cliques em `iniciar.bat` (Windows) ou `iniciar.command` (Mac).
Na primeira vez ele instala Python, ffmpeg e as bibliotecas sozinho. Veja `aplicativo/LEIA-ME.txt`.
