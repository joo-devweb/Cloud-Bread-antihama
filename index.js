// index.js
import readline from 'readline';
import chalk from 'chalk';
import fs from 'fs';
import pino from 'pino';
import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  makeCacheableSignalKeyStore,
  DisconnectReason
} from '@whiskeysockets/baileys';
import config from './config.js';
import { handleMessages } from './handler.js';
// Impor Performa.js untuk memastikan inisialisasi dan event handler shutdown-nya berjalan
import './Performa.js'; 

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

const askNumber = () =>
  new Promise(res =>
    rl.question(chalk.cyan('📱 Masukkan nomor (62xxx): '),
      n => res(n.replace(/[^0-9]/g, ''))));

export async function startBot() {
  console.log(chalk.magentaBright.bold(`\n🚀 Menjalankan ${config.botName}…\n`));

  const { state, saveCreds } = await useMultiFileAuthState(config.sessionName);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    browser: Browsers.ubuntu('Chrome'),
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
    },
    generateHighQualityLinkPreview: true,
  });
  global.sock = sock; // Penting: Membuat 'sock' dapat diakses secara global oleh handler dan performa

  sock.ev.on('creds.update', saveCreds);

  /* pairing pertama */
  if (!sock.authState.creds.registered) {
    const num = await askNumber();
    console.log(chalk.yellow('⏳ Tunggu 3 detik…'));
    await new Promise(r => setTimeout(r, 3000));
    console.log(chalk.yellow('🔑 Meminta pairing code…'));
    const code = await sock.requestPairingCode(num);
    console.log(chalk.green(`\nPAIRING CODE: ${code}\n`));
    console.log(chalk.cyan('➡️  WhatsApp › Linked Devices › Link a Device'));
  }

  /* koneksi update */
  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'open') {
      console.log(chalk.green('⚡ Connected as %s'), sock.user.id.split(':')[0]);
      rl.close();
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      console.log(chalk.red('⛔ Connection closed, code:'), code);

      if (code === DisconnectReason.loggedOut || code === 401) {
        console.log(chalk.red('🔒 Logged-out, delete session & restart…'));
        try { fs.rmSync(config.sessionName, { recursive: true, force: true }) } catch {}
        return setTimeout(startBot, 2000);
      }
      if (code === DisconnectReason.restartRequired || code === 515) {
        console.log(chalk.yellow('🔄 Restart required, reconnecting…'));
        return setTimeout(startBot, 2000);
      }
      setTimeout(startBot, 5000);
    }
  });

  // Event handler untuk menerima pesan
  sock.ev.on('messages.upsert', handleMessages);
}

startBot();