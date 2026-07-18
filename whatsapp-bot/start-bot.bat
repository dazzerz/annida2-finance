@echo off
title Annida Bot
:loop
echo [%date% %time%] Memulai bot...
node "C:\Users\User\annida2-finance\whatsapp-bot\index.js"
echo [%date% %time%] Bot berhenti. Restart dalam 5 detik...
timeout /t 5 /nobreak >nul
goto loop
