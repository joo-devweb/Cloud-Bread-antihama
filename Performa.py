# Performa.py
import json
import os
import time
from collections import Counter
import threading
import sys
import datetime # Untuk format waktu yang lebih baik

# Konfigurasi Path (harus sesuai dengan config.js)
BUG_LOG_FILE = './bug_logs.json'
PERFORMANCE_LOG_FILE = './performance_metrics.json'
MONITOR_INTERVAL_SECONDS = 5 # Interval monitoring (setiap berapa detik Python akan cek file)

# Threshold untuk peringatan
AVG_PROCESSING_TIME_WARN_MS = 200 # Peringatan jika rata-rata waktu pemrosesan > 200ms
MAX_QUEUE_SIZE_WARN_ITEMS = 100 # Peringatan jika ukuran antrean maks > 100 item

# Fungsi untuk membaca log JSON dengan aman
def read_json_log(file_path):
    if not os.path.exists(file_path):
        return []
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            if not content: # Handle empty file
                return []
            return json.loads(content)
    except json.JSONDecodeError:
        print(f"[{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] ERROR: Failed to read JSON file '{file_path}'. It might be corrupted or empty.")
        return []
    except Exception as e:
        print(f"[{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] ERROR: Unexpected error reading '{file_path}': {e}")
        return []

# Fungsi untuk menganalisis log bug
def analyze_bug_logs():
    logs = read_json_log(BUG_LOG_FILE)
    if not logs:
        return "No bug entries in log."

    total_bugs = len(logs)
    bug_type_counts = Counter(log['bugType'] for log in logs)
    sender_counts = Counter(log['sender'] for log in logs)
    chat_type_counts = Counter(log['chatType'] for log in logs)

    report = [
        "\n--- Bug Log Analysis ---",
        f"Total Bugs Detected: {total_bugs}",
        "\nBug Type Frequency (Top 5):"
    ]
    for bug_type, count in bug_type_counts.most_common(5):
        report.append(f"  - {bug_type}: {count} times")

    report.append("\nTop Bug Senders (Top 5):")
    for sender, count in sender_counts.most_common(5):
        report.append(f"  - {sender}: {count} times")

    report.append("\nChat Type Distribution:")
    for chat_type, count in chat_type_counts.items():
        report.append(f"  - {chat_type}: {count} times")

    report.append("--- End Analysis ---")
    return "\n".join(report)

# Fungsi untuk menganalisis metrik performa
def analyze_performance_metrics():
    metrics = read_json_log(PERFORMANCE_LOG_FILE)
    if not metrics:
        return "No performance metrics recorded."

    # Filter metrik terbaru (misalnya dalam 1 menit terakhir)
    # Gunakan waktu server sekarang (WIB)
    current_time_wib = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7))) # Palembang, WIB is UTC+7
    recent_metrics = [
        m for m in metrics
        if (current_time_wib - datetime.datetime.fromtimestamp(m['timestamp'] / 1000, datetime.timezone.utc).astimezone(datetime.timezone(datetime.timedelta(hours=7)))).total_seconds() < 60
    ]

    if not recent_metrics:
        return "No performance metrics in the last 1 minute."

    processing_times = [m['value'] for m in recent_metrics if m['name'] == 'MessageProcessingTime']
    queue_sizes = [m['value'] for m in recent_metrics if m['name'] == 'CurrentQueueSize']

    report = [
        "\n--- Performance Analysis (Last 1 Minute) ---"
    ]

    if processing_times:
        avg_time = sum(processing_times) / len(processing_times)
        max_time = max(processing_times)
        report.append(f"Average Message Processing Time: {avg_time:.2f} ms")
        report.append(f"Maximum Message Processing Time: {max_time:.2f} ms")
        if avg_time > AVG_PROCESSING_TIME_WARN_MS:
            report.append(f"  [ALERT]: Average processing time ({avg_time:.2f}ms) exceeds warning threshold ({AVG_PROCESSING_TIME_WARN_MS}ms)!")
    else:
        report.append("No message processing time data.")

    if queue_sizes:
        avg_queue_size = sum(queue_sizes) / len(queue_sizes)
        max_queue_size = max(queue_sizes)
        report.append(f"Average Queue Size: {avg_queue_size:.2f} items")
        report.append(f"Maximum Queue Size: {max_queue_size} items")
        if max_queue_size > MAX_QUEUE_SIZE_WARN_ITEMS:
            report.append(f"  [ALERT]: Max queue size ({max_queue_size} items) exceeds warning threshold ({MAX_QUEUE_SIZE_WARN_ITEMS} items)! Server might be overloaded.")
    else:
        report.append("No queue size data.")

    report.append("--- End Performance Analysis ---")
    return "\n".join(report)

# Fungsi utama untuk monitoring
def real_time_monitor():
    print(f"[{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Starting anti-bug system monitor...")
    last_bug_log_mtime = 0 # Last modification time for bug log
    last_perf_log_mtime = 0 # Last modification time for performance log

    while True:
        try:
            current_bug_log_mtime = os.path.getmtime(BUG_LOG_FILE) if os.path.exists(BUG_LOG_FILE) else 0
            current_perf_log_mtime = os.path.getmtime(PERFORMANCE_LOG_FILE) if os.path.exists(PERFORMANCE_LOG_FILE) else 0

            # Cek perubahan pada log bug
            if current_bug_log_mtime > last_bug_log_mtime:
                print(f"\n[{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Detecting bug log changes...")
                print(analyze_bug_logs())
                last_bug_log_mtime = current_bug_log_mtime

            # Cek perubahan pada log performa
            if current_perf_log_mtime > last_perf_log_mtime:
                print(f"\n[{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Detecting performance log changes...")
                print(analyze_performance_metrics())
                last_perf_log_mtime = current_perf_log_mtime

            sys.stdout.flush() # Ensure output is flushed immediately
            time.sleep(MONITOR_INTERVAL_SECONDS)

        except KeyboardInterrupt:
            print(f"[{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Monitoring stopped.")
            break
        except Exception as e:
            print(f"[{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] ERROR: Error in main monitor loop: {e}")
            time.sleep(MONITOR_INTERVAL_SECONDS)

if __name__ == "__main__":
    # Ensure log files exist to prevent errors during reading
    if not os.path.exists(BUG_LOG_FILE):
        with open(BUG_LOG_FILE, 'w') as f:
            f.write('[]')
    if not os.path.exists(PERFORMANCE_LOG_FILE):
        with open(PERFORMANCE_LOG_FILE, 'w') as f:
            f.write('[]')

    real_time_monitor()