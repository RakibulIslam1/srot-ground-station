// =============================================================================
//  Bondor — Electron main process. Creates the window and bridges the renderer's
//  IPC calls to the MAVLink IO layer; forwards decoded telemetry back as events.
// =============================================================================

import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { MavlinkConnection } from './mavlink/connection'
import { listSerialPorts } from './mavlink/serialLink'
import {
  IPC,
  type ConnectOptions,
  type CommandLongArgs,
  type ManualControlArgs,
  type ParamSetArgs
} from '../shared/protocol'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#141218',
    title: 'Bondor',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // MAVLink IO — forward every decoded message + status change to the renderer.
  const conn = new MavlinkConnection(
    (msg) => mainWindow?.webContents.send(IPC.EVT_MESSAGE, msg),
    (status) => mainWindow?.webContents.send(IPC.EVT_STATUS, status)
  )

  ipcMain.handle(IPC.CONNECT, (_e, opts: ConnectOptions) => conn.connect(opts))
  ipcMain.handle(IPC.DISCONNECT, () => conn.disconnect())
  ipcMain.handle(IPC.GET_STATUS, () => conn.getStatus())
  ipcMain.handle(IPC.SEND_COMMAND_LONG, (_e, a: CommandLongArgs) => conn.sendCommandLong(a))
  ipcMain.handle(IPC.SEND_MANUAL_CONTROL, (_e, a: ManualControlArgs) => conn.sendManualControl(a))
  ipcMain.handle(IPC.SEND_PARAM_SET, (_e, a: ParamSetArgs) => conn.sendParamSet(a))
  ipcMain.handle(IPC.REQUEST_PARAM_LIST, () => conn.requestParamList())
  ipcMain.handle(IPC.REQUEST_PARAM_READ, (_e, id: string) => conn.requestParamRead(id))
  ipcMain.handle(IPC.REQUEST_PARAM_READ_INDEX, (_e, index: number) => conn.requestParamReadIndex(index))
  ipcMain.handle(IPC.LIST_SERIAL_PORTS, () => listSerialPorts())

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    mainWindow.loadURL(devUrl)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
