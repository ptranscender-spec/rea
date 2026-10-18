#!/usr/bin/env bash
# Instala o REA (rea-agents) com todos os motores e ferramentas externas gratuitas.
# Uso (Linux Debian/Ubuntu ou macOS com Homebrew):
#   bash instalar-rea-completo.sh
# Precisa de: Node.js 22+, npm, Python 3 e acesso à internet. Pede sudo no Linux.
set -euo pipefail

TOOLS="$HOME/.local/share/rea-tools"
ENV_FILE="$TOOLS/env.sh"
mkdir -p "$TOOLS"
OS="$(uname -s)"

step() { printf '\n==> %s\n' "$*"; }

latest_asset() { # repo, regex -> URL do asset da última release
  curl -fsSL "https://api.github.com/repos/$1/releases/latest" |
    grep -oE '"browser_download_url": *"[^"]+"' | cut -d'"' -f4 | grep -E "$2" | head -1
}

step "REA"
npm install --global rea-agents

step "Ferramentas do sistema"
if [ "$OS" = Linux ]; then
  sudo apt-get update
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
    openjdk-21-jdk-headless gdb lldb binutils binutils-multiarch wabt tshark \
    sigrok-cli adb apktool binwalk procps unzip curl python3-venv p7zip-full squashfs-tools
else
  brew install openjdk@21 gdb llvm binutils wabt wireshark sigrok-cli apktool binwalk rizin unzip
  brew install --cask android-platform-tools
fi

step "Ferramentas Python (Frida, mitmproxy, pwntools, unblob)"
python3 -m venv "$TOOLS/py"
"$TOOLS/py/bin/pip" install --upgrade frida-tools mitmproxy pwntools unblob

step "Wakaru (recuperação de JavaScript)"
npm install --global @wakaru/cli@1.14.0

step "Ghidra 12.1.4"
GHIDRA_URL="$(curl -fsSL https://api.github.com/repos/NationalSecurityAgency/ghidra/releases/tags/Ghidra_12.1.4_build |
  grep -oE '"browser_download_url": *"[^"]+\.zip"' | cut -d'"' -f4 | head -1)"
curl -fL -o "$TOOLS/ghidra.zip" "$GHIDRA_URL"
unzip -q -o "$TOOLS/ghidra.zip" -d "$TOOLS" && rm "$TOOLS/ghidra.zip"
GHIDRA_DIR="$(ls -d "$TOOLS"/ghidra_12.1.4_PUBLIC* | head -1)"

step "JADX MCP 0.7.1 (Android)"
JADX_JAR="$TOOLS/jadx-headless-mcp-0.7.1-all.jar"
curl -fL -o "$JADX_JAR" https://github.com/1013503897/jadx-headless-mcp/releases/download/v0.7.1/jadx-headless-mcp-0.7.1-all.jar
echo "6e5eacf500b64292bfb73c49797c1958f6ee44646e43e868039ae7feb573ff75  $JADX_JAR" |
  { command -v sha256sum >/dev/null && sha256sum -c - || shasum -a 256 -c -; }

if [ "$OS" = Linux ]; then
  step "Rizin"
  RIZIN_URL="$(latest_asset rizinorg/rizin 'static.*x86_64.*\.tar\.xz$')" || true
  if [ -n "${RIZIN_URL:-}" ]; then
    mkdir -p "$TOOLS/rizin" && curl -fL "$RIZIN_URL" | tar -xJ -C "$TOOLS/rizin" --strip-components=1
  else
    echo "Aviso: não encontrei o Rizin estático; instale-o de https://rizin.re"
  fi
fi

step "Kuna (descompilador)"
KUNA_URL="$(latest_asset Noelo-Lab/kuna "$( [ "$OS" = Linux ] && echo 'linux' || echo 'mac|darwin')")" || true
if [ -n "${KUNA_URL:-}" ]; then
  mkdir -p "$TOOLS/kuna"
  case "$KUNA_URL" in
    *.tar.gz|*.tgz) curl -fL "$KUNA_URL" | tar -xz -C "$TOOLS/kuna" ;;
    *.zip) curl -fL -o "$TOOLS/kuna.zip" "$KUNA_URL" && unzip -q -o "$TOOLS/kuna.zip" -d "$TOOLS/kuna" && rm "$TOOLS/kuna.zip" ;;
    *) curl -fL -o "$TOOLS/kuna/kuna" "$KUNA_URL" ;;
  esac
  KUNA_BIN="$(find "$TOOLS/kuna" -type f -name kuna | head -1)"; chmod +x "$KUNA_BIN"
fi

step "Variáveis de ambiente ($ENV_FILE)"
which_or() { command -v "$1" 2>/dev/null || echo "$2"; }
cat > "$ENV_FILE" <<EOF
export GHIDRA_INSTALL_DIR="$GHIDRA_DIR"
export REA_JADX_MCP_JAR="$JADX_JAR"
export REA_ADB_PATH="$(which_or adb '')"
export REA_APKTOOL_COMMAND="$(which_or apktool '')"
export REA_TSHARK_COMMAND="$(which_or tshark '')"
export REA_SIGROK_COMMAND="$(which_or sigrok-cli '')"
export REA_WABT_BIN_DIRECTORY="$(dirname "$(which_or wasm-objdump /usr/bin/x)")"
export REA_BINWALK_COMMAND="$(which_or binwalk '')"
export REA_UNBLOB_COMMAND="$TOOLS/py/bin/unblob"
export REA_MITMDUMP_COMMAND="$TOOLS/py/bin/mitmdump"
export REA_WAKARU_COMMAND="$(which_or wakaru '')"
export REA_PWNTOOLS_PYTHON="$TOOLS/py/bin/python"
${KUNA_BIN:+export REA_KUNA_COMMAND="$KUNA_BIN"}
export PATH="$TOOLS/py/bin:$TOOLS/rizin/bin:\$PATH"
EOF
for rc in "$HOME/.bashrc" "$HOME/.zshrc"; do
  [ -f "$rc" ] && ! grep -q "$ENV_FILE" "$rc" && echo ". \"$ENV_FILE\"" >> "$rc"
done
. "$ENV_FILE"

step "Registrar nos agentes + Hopper demo (pede confirmação)"
rea setup --install-hopper

step "Diagnóstico final"
rea doctor
echo
echo "Pronto. Abra um novo terminal e reinicie o seu agente (ex.: Claude Code)."
echo "IDA Pro e JEB são pagos: instale-os por conta própria e veja docs/ida-provider.md e docs/jeb-analysis.md."
