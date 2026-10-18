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
