@echo off
chcp 65001 >nul
title JurisNexo
cd /d "%~dp0"
where node >/dev/null 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale a versao 22 LTS em https://nodejs.org e rode este arquivo de novo.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Instalando dependencias, aguarde...
  call npm install || goto erro
)
if not exist dist (
  echo Gerando as telas...
  call npm run build || goto erro
)
start "" /b cmd /c "timeout /t 4 /nobreak >nul & start http://localhost:3000"
echo JurisNexo rodando em http://localhost:3000  -  feche esta janela para desligar.
call npm start
pause
exit /b 0
:erro
echo Algo deu errado. Veja a mensagem acima.
pause
exit /b 1
