// handler.js
import { isBug } from './Defender.js';
import { handleBug } from './DefendUltra.js';
import { addToProcessingQueue, logPerformanceMetric, getCurrentQueueSize } from './Performa.js';
import { getContentType } from '@whiskeysockets/baileys';
import chalk from 'chalk';

// Fungsi internal yang akan dipanggil oleh queue di Performa.js
// Ini adalah tempat logika deteksi dan penanganan bug sebenarnya terjadi
async function processSingleMessage(msg, sock) {
  // Abaikan pesan dari diri sendiri
  if (msg.key.fromMe) return;

  // Abaikan pesan jika tidak ada konten
  if (!msg.message) return;

  const startTime = process.hrtime.bigint(); // Mulai hitung waktu pemrosesan (nanosecond)

  const bugType = isBug(msg);

  if (bugType) {
    console.log(chalk.red(`\n[!] POTENSI BUG TERDETEKSI:`));
    console.log(chalk.red(`  LID: ${msg.key.id}`));
    console.log(chalk.red(`  Tipe Bug: ${bugType}`));
    console.log(chalk.red(`  Dari: ${msg.key.remoteJid} (${msg.key.participant || 'Unknown'})`));
    console.log(chalk.red(`  Tipe Pesan: ${getContentType(msg.message)}`));
    console.log(chalk.red(`  Waktu: ${new Date().toLocaleString('id-ID')}`)); // Format waktu Indonesia
    await handleBug(sock, msg, bugType);
  } else {
    // Anda bisa menambahkan logika penanganan pesan non-bug di sini jika diperlukan,
    // atau biarkan kosong jika fokus hanya pada pertahanan bug.
    // console.log(chalk.grey(`[Normal Message] From: ${msg.key.remoteJid}, Type: ${getContentType(msg.message)}`));
  }

  const endTime = process.hrtime.bigint(); // Selesai hitung waktu pemrosesan
  const processingTimeMs = Number(endTime - startTime) / 1_000_000; // Konversi ke milidetik
  
  // Log metrik performa
  logPerformanceMetric('MessageProcessingTime', processingTimeMs, 'ms');
  logPerformanceMetric('CurrentQueueSize', getCurrentQueueSize(), 'items');
}

// Fungsi utama yang dipanggil oleh Baileys saat ada pesan baru
export async function handleMessages({ messages, type }) {
  if (type !== 'notify') return;

  for (const msg of messages) {
    // Setiap pesan yang masuk akan ditambahkan ke antrean pemrosesan
    // agar tidak langsung membanjiri event loop utama.
    addToProcessingQueue(msg, processSingleMessage, global.sock);
  }
}