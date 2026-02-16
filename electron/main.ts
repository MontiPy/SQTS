import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDatabase, closeDatabase, saveDatabaseImmediately } from './database';
import { registerHandlers } from './handlers';

// ESM __dirname shim
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
console.log('[SQTS] __dirname resolved to:', __dirname);

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Handle failed loads (deep route fallback in production)
  mainWindow.webContents.on('did-fail-load', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Single instance lock
const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      // Initialize database
      console.log('[SQTS] Initializing database...');
      await getDatabase();
      console.log('[SQTS] Database initialized successfully');

      // Register all IPC handlers
      registerHandlers();

      // Register window focus handlers (for Electron keyboard event routing fix)
      ipcMain.handle('window:refocus', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.blur();
          mainWindow.focus();
          return { success: true };
        }
        return { success: false };
      });

      createWindow();
      console.log('[SQTS] Window created');
    } catch (error) {
      console.error('[SQTS] STARTUP FAILED:', error);
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Save database before quit (flag prevents re-entry during async cleanup)
app.on('before-quit', async (e) => {
  if (isQuitting) return;
  e.preventDefault();
  isQuitting = true;
  try {
    await saveDatabaseImmediately();
    await closeDatabase();
  } catch (error) {
    console.error('[SQTS] Error during shutdown cleanup:', error);
  }
  app.exit(0);
});
