// DefendUltra.js
import fs from 'fs';
import chalk from 'chalk';
import config from './config.js';
import { getContentType } from '@whiskeysockets/baileys';

// Pastikan file log bug ada saat startup
if (!fs.existsSync(config.logFilePath)) {
  fs.writeFileSync(config.logFilePath, '[]', 'utf8');
}

// Fungsi untuk membaca log yang sudah ada
function readBugLogs() {
  try {
    const data = fs.readFileSync(config.logFilePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(chalk.red(`Error reading bug log file: ${error.message}`));
    return [];
  }
}

// Fungsi untuk menulis log
function writeBugLogs(logs) {
  try {
    fs.writeFileSync(config.logFilePath, JSON.stringify(logs, null, 2), 'utf8');
  } catch (error) {
    console.error(chalk.red(`Error writing to bug log file: ${error.message}`));
  }
}

export function logBug(bugData) {
  const currentLogs = readBugLogs();
  currentLogs.push(bugData);
  writeBugLogs(currentLogs);

  console.log(chalk.red(`\n--- BUG DETECTED ---`));
  console.log(chalk.red(`LID: ${bugData.LID}`));
  console.log(chalk.red(`GROUP/PRIVATE: ${bugData.chatType}`));
  console.log(chalk.red(`TIPE: ${bugData.bugType}`));
  console.log(chalk.red(`WAKTU: ${new Date(bugData.timestamp).toLocaleString()}`));
  console.log(chalk.red(`--- END BUG ---`));
}

export async function handleBug(sock, protoMsg, bugType) {
  const senderJid = protoMsg.key.remoteJid;
  const participantJid = protoMsg.key.participant || senderJid;
  const chatType = senderJid.endsWith('@g.us') ? 'GROUP' : 'PRIVATE';
  const messageType = getContentType(protoMsg.message);

  const bugData = {
    LID: protoMsg.key.id,
    bugType: bugType,
    sender: participantJid,
    chatType: chatType,
    messageType: messageType,
    timestamp: Date.now(),
    rawMessage: protoMsg.toJSON() // Simpan seluruh proto message untuk analisis lebih lanjut
  };

  logBug(bugData);

  try {
    // Auto-block pengirim
    await sock.updateBlockStatus(participantJid, 'block');
    console.log(chalk.yellow(`🚫 Successfully blocked ${participantJid}`));

    // Auto-delete pesan
    await sock.sendMessage(senderJid, { delete: protoMsg.key });
    console.log(chalk.yellow(`🗑️ Successfully deleted bug message from ${participantJid}`));
  } catch (error) {
    console.error(chalk.red(`❌ Failed to handle bug from ${participantJid}:`), error);
  }
}