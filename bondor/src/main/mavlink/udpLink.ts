// UDP transport: bind a local port and talk to the vehicle (direct or via a
// Pi/BlueOS router). Auto-learns the peer from incoming packets so replies always
// reach the real sender.

import dgram from 'node:dgram'
import type { ConnectOptions } from '../../shared/protocol'
import type { LinkCallbacks, MavlinkLink } from './link'

export class UdpLink implements MavlinkLink {
  private socket: dgram.Socket
  private remote: { host: string; port: number } | null = null
  private fixedRemote: boolean

  constructor(opts: ConnectOptions, cb: LinkCallbacks) {
    const localPort = opts.localPort ?? 14550
    this.fixedRemote = Boolean(opts.host && opts.port)
    if (this.fixedRemote) this.remote = { host: opts.host!, port: opts.port! }

    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true })
    this.socket = sock

    sock.on('message', (buf, rinfo) => {
      if (!this.fixedRemote) this.remote = { host: rinfo.address, port: rinfo.port }
      cb.onData(buf)
    })
    sock.on('error', (err) => cb.onStatus({ connected: false, error: err.message }))
    sock.on('listening', () => {
      const a = sock.address()
      cb.onStatus({
        connected: true,
        detail: `UDP :${a.port}${this.remote ? ` ↔ ${this.remote.host}:${this.remote.port}` : ' (listening)'}`
      })
    })

    try {
      sock.bind(localPort)
    } catch (e: any) {
      cb.onStatus({ connected: false, error: String(e?.message ?? e) })
    }
  }

  write(buf: Buffer): void {
    if (this.remote) this.socket.send(buf, this.remote.port, this.remote.host)
  }

  close(): void {
    try {
      this.socket.close()
    } catch {
      /* already closed */
    }
  }
}
