// @ts-ignore
import V86Pkg from 'v86';
const V86Starter = V86Pkg.V86Starter || V86Pkg;

const outputEl = document.getElementById('output') as HTMLDivElement;
const screenEl = document.getElementById('screen') as HTMLDivElement;
const containerEl = document.getElementById('terminal-container') as HTMLDivElement;

function printLog(text: string, type: 'normal' | 'system' | 'error' = 'normal') {
  const line = document.createElement('div');
  line.className = `log-line ${type}`;
  line.textContent = text;
  outputEl.appendChild(line);
  containerEl.scrollTop = containerEl.scrollHeight;
}

printLog('Web_Linux OS [Version 0.2.0]', 'system');
printLog('Initializing WebAssembly v86 Emulator...', 'system');

// IndexedDBから保存された状態を取得
async function getSavedState(): Promise<ArrayBuffer | null> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open("WebLinuxDB", 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("states");
      };
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("states", "readonly");
        const store = tx.objectStore("states");
        const getReq = store.get("last_state");
        getReq.onsuccess = () => resolve(getReq.result || null);
        getReq.onerror = () => resolve(null);
      };
      request.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

// IndexedDBへ現在の状態を保存
async function saveState(buffer: ArrayBuffer) {
  try {
    const request = indexedDB.open("WebLinuxDB", 1);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("states", "readwrite");
      const store = tx.objectStore("states");
      store.put(buffer, "last_state");
      printLog("[IndexedDB] State saved to browser storage", "system");
    };
  } catch (e) {
    console.error("Failed to save state to IndexedDB", e);
  }
}

async function bootEmulator() {
  const savedState = await getSavedState();
  if (savedState) {
    printLog("Restoring previous Linux state from IndexedDB...", "system");
  } else {
    printLog("Booting fresh Linux OS image...", "system");
  }

  try {
    const emulator = new V86Starter({
      wasm_path: "/v86.wasm",
      memory_size: 64 * 1024 * 1024,
      vga_memory_size: 2 * 1024 * 1024,
      screen_container: screenEl,
      bios: { url: "/seabios.bin" },
      vga_bios: { url: "/vgabios.bin" },
      cdrom: { url: "/linux.iso" },
      initial_state: savedState ? { buffer: savedState } : undefined,
      autostart: true,
    });

    printLog("Emulator initialized. Booting kernel...", "system");

    // シリアルポートからの文字出力イベント処理
    emulator.add_listener("serial0-output-char", (char: string) => {
      screenEl.innerText += char;
      containerEl.scrollTop = containerEl.scrollHeight;
    });

    // 1分ごとの自動保存処理
    setInterval(async () => {
      try {
        const state = await emulator.save_state();
        if (state) saveState(state);
      } catch (err) {
        console.warn("Auto-save skipped:", err);
      }
    }, 60000);

    // スマホ用ボタン操作
    document.querySelectorAll('.key-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = (btn as HTMLButtonElement).dataset.key;
        if (key === 'Tab') {
          emulator.serial0_send("  ");
        } else if (key === 'Escape') {
          emulator.serial0_send("\x1b");
        } else if (key === 'ArrowUp') {
          emulator.serial0_send("\x1b[A");
        } else if (key === 'ArrowDown') {
          emulator.serial0_send("\x1b[B");
        }
      });
    });

  } catch (error) {
    printLog(`Boot Error: ${error}`, 'error');
  }
}

bootEmulator();