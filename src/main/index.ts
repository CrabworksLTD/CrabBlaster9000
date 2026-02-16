import 'dotenv/config'
import { app, BrowserWindow, shell, Menu } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { initDatabase } from './storage/database'
import { registerWalletIpc } from './ipc/wallet.ipc'
import { registerBotIpc } from './ipc/bot.ipc'
import { registerTransactionIpc } from './ipc/transaction.ipc'
import { registerSettingsIpc } from './ipc/settings.ipc'
import { getTelegramNotifier } from './services/telegram-notifier'
import { autoUpdater } from 'electron-updater'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: '#0f1118',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // Right-click context menu with paste support
  mainWindow.webContents.on('context-menu', (_event, params) => {
    const contextMenu = Menu.buildFromTemplate([
      { role: 'cut', visible: params.isEditable },
      { role: 'copy', visible: params.selectionText.length > 0 },
      { role: 'paste', visible: params.isEditable },
      { role: 'selectAll', visible: params.isEditable }
    ])
    contextMenu.popup()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    // Only allow HTTPS URLs to trusted domains
    const ALLOWED_DOMAINS = ['solscan.io', 'crabblaster.app', 'github.com']
    try {
      const url = new URL(details.url)
      if (url.protocol === 'https:' && ALLOWED_DOMAINS.some((d) => url.hostname === d || url.hostname.endsWith(`.${d}`))) {
        shell.openExternal(details.url)
      }
    } catch {
      // Invalid URL, don't open
    }
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // macOS needs an Edit menu for clipboard shortcuts (Cmd+C/V/X) to work
  const template: Electron.MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))

  initDatabase()
  getTelegramNotifier().init()

  registerWalletIpc()
  registerBotIpc()
  registerTransactionIpc()
  registerSettingsIpc()
  createWindow()

  autoUpdater.checkForUpdatesAndNotify()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}
