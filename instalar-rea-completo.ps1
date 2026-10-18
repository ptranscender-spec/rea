# Instala o REA (rea-agents) com os motores e ferramentas externas gratuitas no Windows.
# Uso: abra o PowerShell como Administrador e rode:
#   Set-ExecutionPolicy -Scope Process Bypass; .\instalar-rea-completo.ps1
# Precisa de: Windows 10/11 com winget e acesso à internet.
$ErrorActionPreference = 'Stop'

$Tools = Join-Path $HOME '.local\share\rea-tools'
New-Item -ItemType Directory -Force $Tools | Out-Null
function Step($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}
function Set-UserEnv($name, $value) {
  if ($value) { [Environment]::SetEnvironmentVariable($name, $value, 'User'); Set-Item "env:$name" $value }
}
function Latest-Asset($repo, $pattern) {
  $rel = Invoke-RestMethod "https://api.github.com/repos/$repo/releases/latest"
  ($rel.assets | Where-Object { $_.name -match $pattern } | Select-Object -First 1).browser_download_url
}
function Find-Exe($name) { (Get-Command $name -ErrorAction SilentlyContinue).Source }

Step 'Programas base (Node.js, Python, Java 21, Git)'
$pkgs = 'OpenJS.NodeJS.LTS', 'Python.Python.3.12', 'EclipseAdoptium.Temurin.21.JDK', 'Git.Git',
        'WiresharkFoundation.Wireshark', 'Google.PlatformTools', 'sigrok.sigrok-cli'
foreach ($p in $pkgs) {
  winget install --id $p -e --accept-source-agreements --accept-package-agreements --silent
  if ($LASTEXITCODE -ne 0) { Write-Warning "winget não instalou $p (pode já estar instalado)" }
}
Refresh-Path

Step 'REA'
npm install --global rea-agents

Step 'Ferramentas Python (Frida, mitmproxy, pwntools)'
python -m venv "$Tools\py"
& "$Tools\py\Scripts\pip.exe" install --upgrade frida-tools mitmproxy pwntools

Step 'Wakaru (recuperação de JavaScript)'
npm install --global '@wakaru/cli@1.14.0'

Step 'Ghidra 12.1.4'
$rel = Invoke-RestMethod 'https://api.github.com/repos/NationalSecurityAgency/ghidra/releases/tags/Ghidra_12.1.4_build'
$zipUrl = ($rel.assets | Where-Object { $_.name -like '*.zip' } | Select-Object -First 1).browser_download_url
Invoke-WebRequest $zipUrl -OutFile "$Tools\ghidra.zip"
Expand-Archive "$Tools\ghidra.zip" -DestinationPath $Tools -Force; Remove-Item "$Tools\ghidra.zip"
$GhidraDir = (Get-ChildItem $Tools -Directory -Filter 'ghidra_12.1.4_PUBLIC*' | Select-Object -First 1).FullName

Step 'JADX MCP 0.7.1 (Android)'
$Jar = "$Tools\jadx-headless-mcp-0.7.1-all.jar"
Invoke-WebRequest 'https://github.com/1013503897/jadx-headless-mcp/releases/download/v0.7.1/jadx-headless-mcp-0.7.1-all.jar' -OutFile $Jar
if ((Get-FileHash $Jar -Algorithm SHA256).Hash -ne '6E5EACF500B64292BFB73C49797C1958F6EE44646E43E868039AE7FEB573FF75') {
  throw 'SHA-256 do JADX não confere'
}

Step 'apktool'
New-Item -ItemType Directory -Force "$Tools\apktool" | Out-Null
$apkJar = Latest-Asset 'iBotPeaches/Apktool' '^apktool_.*\.jar$'
Invoke-WebRequest $apkJar -OutFile "$Tools\apktool\apktool.jar"
Invoke-WebRequest 'https://raw.githubusercontent.com/iBotPeaches/Apktool/master/scripts/windows/apktool.bat' -OutFile "$Tools\apktool\apktool.bat"

Step 'WABT (WebAssembly)'
$wabtUrl = Latest-Asset 'WebAssembly/wabt' 'windows.*\.tar\.gz$'
if ($wabtUrl) {
  New-Item -ItemType Directory -Force "$Tools\wabt" | Out-Null
  Invoke-WebRequest $wabtUrl -OutFile "$Tools\wabt.tar.gz"
  tar -xzf "$Tools\wabt.tar.gz" -C "$Tools\wabt" --strip-components=1; Remove-Item "$Tools\wabt.tar.gz"
}

Step 'Rizin'
$rzUrl = Latest-Asset 'rizinorg/rizin' 'windows.*x86_64.*\.zip$|win.*64.*\.zip$'
if ($rzUrl) {
  Invoke-WebRequest $rzUrl -OutFile "$Tools\rizin.zip"
  Expand-Archive "$Tools\rizin.zip" -DestinationPath "$Tools\rizin" -Force; Remove-Item "$Tools\rizin.zip"
} else { Write-Warning 'Não encontrei o Rizin para Windows; instale-o de https://rizin.re' }

Step 'Kuna (descompilador)'
$kunaUrl = Latest-Asset 'Noelo-Lab/kuna' 'windows|win64|\.exe$'
if ($kunaUrl) {
  New-Item -ItemType Directory -Force "$Tools\kuna" | Out-Null
  if ($kunaUrl -like '*.zip') {
    Invoke-WebRequest $kunaUrl -OutFile "$Tools\kuna.zip"
    Expand-Archive "$Tools\kuna.zip" -DestinationPath "$Tools\kuna" -Force; Remove-Item "$Tools\kuna.zip"
  } else { Invoke-WebRequest $kunaUrl -OutFile "$Tools\kuna\kuna.exe" }
  $KunaExe = (Get-ChildItem "$Tools\kuna" -Recurse -Filter 'kuna.exe' | Select-Object -First 1).FullName
} else { Write-Warning 'Não encontrei o Kuna para Windows' }

Step 'Variáveis de ambiente do usuário'
Refresh-Path
Set-UserEnv 'GHIDRA_INSTALL_DIR' $GhidraDir
Set-UserEnv 'REA_JADX_MCP_JAR' $Jar
Set-UserEnv 'REA_ADB_PATH' (Find-Exe 'adb')
Set-UserEnv 'REA_APKTOOL_COMMAND' "$Tools\apktool\apktool.bat"
Set-UserEnv 'REA_TSHARK_COMMAND' ((Find-Exe 'tshark'), 'C:\Program Files\Wireshark\tshark.exe' | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1)
Set-UserEnv 'REA_SIGROK_COMMAND' (Find-Exe 'sigrok-cli')
if (Test-Path "$Tools\wabt\bin") { Set-UserEnv 'REA_WABT_BIN_DIRECTORY' "$Tools\wabt\bin" }
Set-UserEnv 'REA_MITMDUMP_COMMAND' "$Tools\py\Scripts\mitmdump.exe"
Set-UserEnv 'REA_WAKARU_COMMAND' (Find-Exe 'wakaru')
Set-UserEnv 'REA_PWNTOOLS_PYTHON' "$Tools\py\Scripts\python.exe"
Set-UserEnv 'REA_KUNA_COMMAND' $KunaExe
$extra = @("$Tools\py\Scripts") + (Get-ChildItem "$Tools\rizin" -Recurse -Filter 'rizin.exe' -ErrorAction SilentlyContinue | ForEach-Object { $_.DirectoryName })
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
foreach ($d in $extra) { if ($userPath -notlike "*$d*") { $userPath = "$userPath;$d" } }
[Environment]::SetEnvironmentVariable('Path', $userPath, 'User'); Refresh-Path

Step 'Registrar nos agentes (pede confirmação)'
rea setup

Step 'Diagnóstico final'
rea doctor
Write-Host "`nPronto. Abra um novo terminal e reinicie o seu agente (ex.: Claude Code)."
Write-Host 'Hopper não tem versão para Windows. IDA Pro e JEB são pagos: veja docs/ida-provider.md e docs/jeb-analysis.md.'
Write-Host 'binwalk e unblob não rodam bem no Windows nativo; para firmware use o WSL com o script de Linux.'
