// =============================================================================
//  Bondor — Electron main process. Creates the window and bridges the renderer's
//  IPC calls to the MAVLink IO layer; forwards decoded telemetry back as events.
// =============================================================================

import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { MavlinkConnection } from './mavlink/connection'
import { listSerialPorts } from './mavlink/serialLink'
import { readSettings, writeSettings, type BondorSettings } from './settings'
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
  //
  // `mainWindow?.` guards NULL but not DESTROYED, and those are different states. After a
  // window reload or close the reference is still a live object whose underlying native
  // window is gone, so webContents.send() throws "TypeError: Object has been destroyed".
  // That escapes from a stream callback deep in the MAVLink parser, where nothing catches
  // it, and takes down the ENTIRE MAIN PROCESS — connection, recording and all.
  //
  // The vehicle keeps streaming at 20+ Hz throughout, so the window is guaranteed to be
  // destroyed mid-flight of a message. Reloading Bondor while connected hit this every time.
  const sendToRenderer = (channel: string, payload: unknown): void => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (mainWindow.webContents.isDestroyed()) return
    try {
      mainWindow.webContents.send(channel, payload)
    } catch {
      // Destroyed between the check and the send. Dropping a frame to a window that no
      // longer exists is correct; crashing the process over it is not.
    }
  }
  const conn = new MavlinkConnection(
    (msg) => sendToRenderer(IPC.EVT_MESSAGE, msg),
    (status) => sendToRenderer(IPC.EVT_STATUS, status)
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
  ipcMain.handle(IPC.GET_SETTINGS, () => readSettings())
  ipcMain.handle(IPC.SET_SETTINGS, (_e, s: BondorSettings) => writeSettings(s))

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
