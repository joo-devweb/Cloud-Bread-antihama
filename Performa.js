// Performa.js
import chalk from 'chalk';
import fs from 'fs';
import config from './config.js';

// Antrean untuk memproses pesan secara berurutan
const messageQueue = [];
let isProcessingQueue = false;

// Array untuk menyimpan metrik performa sementara sebelum ditulis ke file
const performanceMetricsBuffer = [];
const METRIC_WRITE_INTERVAL_MS = 5000; // Tulis metrik setiap 5 detik
let metricTimer = null;

// Pastikan file log performa ada saat startup
if (!fs.existsSync(config.performanceLogPath)) {
  fs.writeFileSync(config.performanceLogPath, '[]', 'utf8');
}

// Fungsi untuk membaca metrik yang sudah ada (jika ada)
function readPerformanceLogs() {
  try {
    const data = fs.readFileSync(config.performanceLogPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // console.error(chalk.red(`Error reading performance log file: ${error.message}`)); // Terlalu verbose
    return [];
  }
}

// Fungsi untuk menulis metrik ke file
function writePerformanceMetricsToFile() {
  if (performanceMetricsBuffer.length === 0) return;

  const currentLogs = readPerformanceLogs();
  currentLogs.push(...performanceMetricsBuffer); // Tambahkan metrik baru
  performanceMetricsBuffer.length = 0; // Kosongkan buffer sementara

  try {
    fs.writeFileSync(config.performanceLogPath, JSON.stringify(currentLogs, null, 2), 'utf8');
    // console.log(chalk.blue(`[PERF] Performance metrics written to ${config.performanceLogPath}`));
  } catch (error) {
    console.error(chalk.red(`Error writing performance metrics: ${error.message}`));
  }
}

// Inisialisasi timer untuk menulis metrik secara berkala
function initMetricWriter() {
  if (metricTimer) return; // Pastikan hanya satu timer berjalan
  metricTimer = setInterval(writePerformanceMetricsToFile, METRIC_WRITE_INTERVAL_MS);
}

// Panggil saat modul dimuat
initMetricWriter();

// Fungsi untuk menambahkan pesan ke antrean
export function addToProcessingQueue(message, handlerFunction, sock) {
    messageQueue.push({ message, handlerFunction, sock });
    // Jika antrean tidak sedang diproses, mulai proses
    if (!isProcessingQueue) {
        processQueue();
    }
}

// Fungsi internal untuk memproses antrean
async function processQueue() {
    isProcessingQueue = true;
    while (messageQueue.length > 0) {
        const { message, handlerFunction, sock } = messageQueue.shift(); // Ambil pesan pertama dari antrean
        try {
            await handlerFunction(message, sock); // Panggil handler asli untuk memproses pesan
        } catch (error) {
            console.error(chalk.red(`\n❌ Error processing message from queue: ${error.message}`));
            // Lakukan logging error yang lebih mendalam jika diperlukan
        }
    }
    isProcessingQueue = false;
}

// Fungsi untuk mencatat metrik performa ke buffer
export function logPerformanceMetric(metricName, value, unit = '') {
    performanceMetricsBuffer.push({
        timestamp: Date.now(),
        name: metricName,
        value: value,
        unit: unit
    });
}

// Fungsi untuk mendapatkan ukuran antrean saat ini
export function getCurrentQueueSize() {
    return messageQueue.length;
}

// Handle shutdown untuk menulis metrik terakhir sebelum keluar
process.on('beforeExit', () => {
    clearInterval(metricTimer);
    writePerformanceMetricsToFile();
});

process.on('SIGINT', () => { // Handle Ctrl+C
    clearInterval(metricTimer);
    writePerformanceMetricsToFile();
    process.exit();
});

process.on('SIGTERM', () => { // Handle kill signal
    clearInterval(metricTimer);
    writePerformanceMetricsToFile();
    process.exit();
});