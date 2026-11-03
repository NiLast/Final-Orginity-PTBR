@echo off
setlocal
cd /d "%~dp0"

set "NODE_EXE=%~dp0_arquivos\runtime\node.exe"
set "INSTALLER=%~dp0_arquivos\Aplicar-Traducao.js"
set "GAME_DIR=%~1"

if not defined GAME_DIR set "GAME_DIR=%~dp0."

if not exist "%NODE_EXE%" (
  echo ERRO: os arquivos internos do patch nao foram encontrados.
  echo Extraia o ZIP inteiro antes de executar este instalador.
  echo.
  pause
  exit /b 1
)

"%NODE_EXE%" "%INSTALLER%" --game "%GAME_DIR%\."
if errorlevel 1 (
  echo.
  echo A traducao nao foi instalada. Consulte a mensagem acima.
  echo O patch deve ser extraido dentro da pasta principal do jogo.
  echo.
  pause
  exit /b 1
)

echo.
echo Traducao instalada com sucesso.
echo O idioma pode ser alterado nas opcoes do jogo.
echo.
pause
