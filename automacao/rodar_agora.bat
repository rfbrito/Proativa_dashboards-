@echo off
chcp 65001 >nul
cd /d "%~dp0"
".venv\Scripts\python.exe" importar_venda_diaria.py --forcar
pause
