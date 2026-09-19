"use strict";

const { app, BrowserWindow, shell, dialog } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

// Dua instance akan memperebutkan database yang sama, jadi yang kedua cukup
// memunculkan jendela yang sudah ada lalu keluar.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  return;
}

const userData = app.getPath("userData");
const dataDir = path.join(userData, "data");
fs.mkdirSync(dataDir, { recursive: true });

// Server dan beberapa default-nya membaca cwd. Direktori instalasi sering
// read-only, jadi cwd dipindah ke folder data pengguna sebelum server dimuat:
// itu sekaligus membuat dotenv menemukan <userData>/.env.
process.chdir(userData);

process.env.NODE_ENV = "production";
process.env.ARCHITECH_DATA_DIR = dataDir;
// Aset klien ikut di dalam paket, bukan di folder data.
process.env.ARCHITECH_DIST_DIR = path.join(__dirname, "..", "dist").replace("app.asar", "app.asar.unpacked");
// Port 0 = OS memilih port bebas, supaya tidak bentrok dengan proses lain.
process.env.PORT = "0";
// Aplikasi desktop tidak perlu terekspos ke jaringan lokal.
process.env.HOST = "127.0.0.1";

let mainWindow = null;

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 760,
    minHeight: 600,
    backgroundColor: "#101118",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Menampilkan jendela hanya setelah render pertama menghindari kedipan putih
  // di atas tema gelap.
  mainWindow.once("ready-to-show", () => mainWindow.show());

  // Tautan keluar dibuka di browser pengguna, bukan menggantikan aplikasi.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(`http://127.0.0.1:${port}`)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}`);
}

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.on("window-all-closed", () => {
  app.quit();
});

app.whenReady().then(async () => {
  try {
    const { serverReady } = require(path.join(__dirname, "..", "dist", "server.cjs"));
    const port = await serverReady;
    createWindow(port);
  } catch (error) {
    dialog.showErrorBox(
      "The Architech could not start",
      `The local server failed to start.\n\n${error && error.stack ? error.stack : String(error)}`
    );
    app.quit();
  }
});
