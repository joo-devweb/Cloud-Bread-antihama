// DefendUltra.js
import fs from 'fs';
import chalk from 'chalk';
import config from './config.js';
import { getContentType } from '@whiskeysockets/baileys';

// Pastikan file log bug ada saat startup
// Jika tidak ada, buat file kosong dengan array JSON
if (!fs.existsSync(config.logFilePath)) {
  fs.writeFileSync(config.logFilePath, '[]', 'utf8');
}

// Fungsi untuk membaca log yang sudah ada dari file
function readBugLogs() {
  try {
    const data = fs.readFileSync(config.logFilePath, 'utf8');
    // Jika file kosong, kembalikan array kosong agar JSON.parse tidak error
    if (!data.trim()) {
      return [];
    }
    return JSON.parse(data);
  } catch (error) {
    console.error(chalk.red(`[DefendUltra ERROR] Failed to read bug log file '${config.logFilePath}': ${error.message}`));
    // Kembalikan array kosong jika ada error parsing atau membaca
    return [];
  }
}

// Fungsi untuk menulis log ke file
function writeBugLogs(logs) {
  try {
    fs.writeFileSync(config.logFilePath, JSON.stringify(logs, null, 2), 'utf8');
  } catch (error) {
    console.error(chalk.red(`[DefendUltra ERROR] Failed to write to bug log file '${config.logFilePath}': ${error.message}`));
  }
}

/**
 * Mencatat detail bug yang terdeteksi ke file log dan menampilkan di konsol.
 * @param {object} bugData - Objek yang berisi detail bug.
 */
export function logBug(bugData) {
  const currentLogs = readBugLogs(); // Baca log yang sudah ada
  currentLogs.push(bugData); // Tambahkan data bug baru
  writeBugLogs(currentLogs); // Tulis kembali semua log ke file

  // Tampilkan informasi bug di konsol untuk visibilitas instan
  console.log(chalk.red(`\n--- 🐞 BUG DETECTED 🐞 ---`));
  console.log(chalk.red(`LID: ${bugData.LID}`));
  console.log(chalk.red(`GROUP/PRIVATE: ${bugData.chatType}`));
  console.log(chalk.red(`TIPE: ${bugData.bugType}`));
  console.log(chalk.red(`WAKTU: ${new Date(bugData.timestamp).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`)); // Format WIB
  console.log(chalk.red(`--- END BUG 🐞 ---`));
}

/**
 * Menangani bug yang terdeteksi dengan memblokir pengirim dan menghapus pesan.
 * @param {import('@whiskeysockets/baileys').WASocket} sock - Objek koneksi Baileys.
 * @param {import('@whiskeysockets/baileys').proto.IWebMessageInfo} protoMsg - Objek pesan yang diduga bug.
 * @param {string} bugType - Tipe bug yang terdeteksi.
 */
export async function handleBug(sock, protoMsg, bugType) {
  const senderJid = protoMsg.key.remoteJid;
  // Gunakan participant jika ada (untuk grup), jika tidak, gunakan remoteJid (untuk personal chat)
  const participantJid = protoMsg.key.participant || senderJid; 
  const chatType = senderJid.endsWith('@g.us') ? 'GROUP' : 'PRIVATE';
  const messageType = getContentType(protoMsg.message);

  // Siapkan data bug untuk logging
  const bugData = {
    LID: protoMsg.key.id,
    bugType: bugType,
    sender: participantJid,
    chatType: chatType,
    messageType: messageType,
    timestamp: Date.now(),
    // **PERBAIKAN KRUSIAL DI SINI:** Menggunakan JSON.parse(JSON.stringify())
    // untuk membuat salinan objek protoMsg yang dapat di-serialize ke JSON.
    // Ini mengatasi error "protoMsg.toJSON is not a function".
    rawMessage: JSON.parse(JSON.stringify(protoMsg)) 
  };

  logBug(bugData); // Catat bug

  try {
    // 🚫 Auto-block pengirim
    await sock.updateBlockStatus(participantJid, 'block');
    console.log(chalk.yellow(`🚫 Successfully blocked ${participantJid}!`));

    // 🗑️ Auto-delete pesan
    await sock.sendMessage(senderJid, { delete: protoMsg.key });
    console.log(chalk.yellow(`🗑️ Successfully deleted bug message from ${participantJid}!`));
  } catch (error) {
    console.error(chalk.red(`❌ [DefendUltra ERROR] Failed to handle bug from ${participantJid}:`), error.message);
    // Tambahkan log lebih detail jika error blocking/deleting terjadi
    // console.error(chalk.red('  Stack:'), error.stack);
  }
}
