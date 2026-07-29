// Serial (USB) transport: a direct link to the SROT ESP32's UART0/USB MAVLink
// stream. Opens with DTR/RTS de-asserted so opening the port does NOT toggle the
// DevKit's auto-reset (EN/GPIO0) and reboot the board.

import { SerialPort } from 'serialport'
import type { ConnectOptions, SerialPortInfo } from '../../shared/protocol'
import type { LinkCallbacks, MavlinkLink } from './link'

export async function listSerialPorts(): Promise<SerialPortInfo[]> {
  const ports = await SerialPort.list()
  return ports.map((p) => ({
    path: p.path,
    manufacturer: p.manufacturer,
    friendlyName: (p as { friendlyName?: string }).friendlyName
  }))
}

export class SerialLink implements MavlinkLink {
  private port: SerialPort

  constructor(opts: ConnectOptions, cb: LinkCallbacks) {
    const path = opts.path ?? ''
    const baudRate = opts.baud ?? 115200

    this.port = new SerialPort(
      { path, baudRate, autoOpen: false, hupcl: false },
      (err) => {
        if (err) cb.onStatus({ connected: false, error: err.message })
      }
    )

    this.port.on('data', (buf: Buffer) => cb.onData(buf))
    this.port.on('error', (err) => cb.onStatus({ connected: false, error: err.message }))
    this.port.on('close', () => cb.onStatus({ connected: false }))

    this.port.open((err) => {
      if (err) {
        cb.onStatus({ connected: false, error: err.message })
        return
      }
      // Assert DTR (terminal present) so the ESP32-C3 native-USB CDC enables the
      // host→device data path — without it the ground station receives NOTHING from
      // Bondor (commands/joystick die). RTS stays low so the classic DTR+RTS reset
      // sequence isn't triggered. (A DevKit on direct USB may reboot once on connect —
      // harmless.)
      this.port.set({ dtr: true, rts: false }, () => {
        /* ignore — some drivers reject set(); the link still works */
      })
      cb.onStatus({ connected: true, detail: `USB ${path} @ ${baudRate}` })
    })
  }

  write(buf: Buffer): void {
    if (this.port.writable) this.port.write(buf)
  }

  close(): void {
    try {
      if (this.port.isOpen) this.port.close()
    } catch {
      /* already closed */
    }
  }
}
