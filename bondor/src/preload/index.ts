// =============================================================================
//  Bondor preload — exposes a minimal, typed `window.bondor` API to the renderer
//  over contextBridge (contextIsolation on; no node access leaks to the UI).
// =============================================================================

import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  type ConnectOptions,
  type CommandLongArgs,
  type ManualControlArgs,
  type ParamSetArgs,
  type ConnectionStatus,
  type MavMessage,
  type SerialPortInfo
} from '../shared/protocol'

const api = {
  connect: (opts: ConnectOptions): Promise<void> => ipcRenderer.invoke(IPC.CONNECT, opts),
  disconnect: (): Promise<void> => ipcRenderer.invoke(IPC.DISCONNECT),
  getStatus: (): Promise<ConnectionStatus> => ipcRenderer.invoke(IPC.GET_STATUS),
  sendCommandLong: (a: CommandLongArgs): Promise<void> =>
    ipcRenderer.invoke(IPC.SEND_COMMAND_LONG, a),
  sendManualControl: (a: ManualControlArgs): Promise<void> =>
    ipcRenderer.invoke(IPC.SEND_MANUAL_CONTROL, a),
  sendParamSet: (a: ParamSetArgs): Promise<void> => ipcRenderer.invoke(IPC.SEND_PARAM_SET, a),
  requestParamList: (): Promise<void> => ipcRenderer.invoke(IPC.REQUEST_PARAM_LIST),
  requestParamRead: (id: string): Promise<void> => ipcRenderer.invoke(IPC.REQUEST_PARAM_READ, id),
  requestParamReadIndex: (index: number): Promise<void> =>
    ipcRenderer.invoke(IPC.REQUEST_PARAM_READ_INDEX, index),
  listSerialPorts: (): Promise<SerialPortInfo[]> => ipcRenderer.invoke(IPC.LIST_SERIAL_PORTS),

  onMessage: (cb: (m: MavMessage) => void): (() => void) => {
    const h = (_e: unknown, m: MavMessage) => cb(m)
    ipcRenderer.on(IPC.EVT_MESSAGE, h)
    return () => ipcRenderer.removeListener(IPC.EVT_MESSAGE, h)
  },
  onStatus: (cb: (s: ConnectionStatus) => void): (() => void) => {
    const h = (_e: unknown, s: ConnectionStatus) => cb(s)
    ipcRenderer.on(IPC.EVT_STATUS, h)
    return () => ipcRenderer.removeListener(IPC.EVT_STATUS, h)
  }
}

export type BondorApi = typeof api

contextBridge.exposeInMainWorld('bondor', api)
