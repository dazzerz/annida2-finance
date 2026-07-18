// Script untuk menjalankan bot di background tanpa jendela terminal
// Jalankan dengan: node run-hidden.js

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function startBot() {
  const botPath = join(__dirname, 'index.js');
  
  const child = spawn(process.execPath, [botPath], {
    cwd: __dirname,
    detached: false,
    stdio: 'inherit'
  });

  child.on('exit', (code) => {
    console.log(`[${new Date().toLocaleString('id-ID')}] Bot berhenti (kode: ${code}). Restart dalam 5 detik...`);
    setTimeout(startBot, 5000);
  });

  child.on('error', (err) => {
    console.error(`[${new Date().toLocaleString('id-ID')}] Error bot:`, err.message);
    setTimeout(startBot, 5000);
  });

  console.log(`[${new Date().toLocaleString('id-ID')}] Bot dimulai dengan PID: ${child.pid}`);
}

startBot();
