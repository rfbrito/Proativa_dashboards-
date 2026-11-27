@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === Robo da venda diaria - instalacao ===
where py >nul 2>nul
if errorlevel 1 (
  echo.
  echo O Python nao esta instalado. Baixe em https://www.python.org/downloads/ e marque "Add python.exe to PATH".
  pause
  exit /b 1
)
if not exist ".venv\Scripts\python.exe" py -3 -m venv .venv
".venv\Scripts\python.exe" -m pip install --quiet --upgrade pip openpyxl
if errorlevel 1 ( echo Falha ao instalar o openpyxl. & pause & exit /b 1 )
if not exist config_robo.json (
  copy config_robo.exemplo.json config_robo.json >nul
  echo.
  echo Preencha o config_robo.json que vai abrir agora, salve e feche o Bloco de Notas.
  notepad config_robo.json
)
echo.
echo Testando a leitura da planilha (nada e gravado)...
".venv\Scripts\python.exe" importar_venda_diaria.py --teste
if errorlevel 1 ( echo. & echo Corrija o erro acima e rode o instalar.bat de novo. & pause & exit /b 1 )
schtasks /Create /TN "GLP - Venda diaria" /TR "\"%~dp0.venv\Scripts\pythonw.exe\" \"%~dp0importar_venda_diaria.py\"" /SC HOURLY /MO 1 /ST 06:00 /F
echo.
echo Pronto. O robo roda de hora em hora e so importa quando a planilha muda.
echo Para importar agora, use o rodar_agora.bat.
pause
