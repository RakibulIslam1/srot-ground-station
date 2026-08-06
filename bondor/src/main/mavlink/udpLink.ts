// UDP transport: bind a local port and talk to the vehicle (direct or via a
// Pi/BlueOS router). Auto-learns the peer from incoming packets so replies always
// reach the real sender.

import dgram from 'node:dgram'
import type { ConnectOptions } from '../../shared/protocol'
import type { LinkCallbacks, MavlinkLink } from './link'

// How long to wait for the first datagram before saying something is wrong. The
// board heartbeats at >=1 Hz and bursts NAMED_VALUE_FLOAT every 500 ms, so this is
// ~4 missed heartbeats -- clear of the ~8-9% frame loss seen over the BlueOS bridge,
// and well inside the patience of someone watching a status chip.
const FIRST_DATA_TIMEOUT_MS = 4000

/**
 * Is another process already bound to this UDP port?
 *
 * MUST be called BEFORE we bind our own socket, or it just finds us.
 *
 * MEASURED on the bench, and the numbers are why this exists. Two processes CAN
 * both bind 14550 when both set SO_REUSEADDR -- which Bondor does (below) and
 * pymavlink does too, so duburi_ws does. Both binds succeed, and **the newcomer
 * takes the stream**: with duburi_ws already running, a second binder received 544
 * datagrams in 6 s while the incumbent was left with a trickle.
 *
 * So the danger is the opposite of the intuitive one. Bondor does NOT go blind when
 * it opens on top of a running mission -- it works perfectly, and silently starves
 * the companion of telemetry and command ACKs mid-run, with nothing in either UI to
 * say why. That is why the conflict is reported as a persistent warning that
 * incoming data does not clear: arriving data is not evidence the problem is gone,
 * it is evidence we took someone else's.
 */
export function udpPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = dgram.createSocket({ type: 'udp4', reuseAddr: false })
    const done = (inUse: boolean): void => {
      try {
        probe.close()
      } catch {
        /* already closed */
      }
      resolve(inUse)
    }
    probe.once('error', () => done(true))
    probe.once('listening', () => done(false))
    try {
      probe.bind(port)
    } catch {
      done(true)
    }
  })
}

export class UdpLink implements MavlinkLink {
  private socket: dgram.Socket | null = null
  private remote: { host: string; port: number } | null = null
  private fixedRemote: boolean
  private sawData = false
  private closed = false
  private conflict = ''
  private firstDataTimer: NodeJS.Timeout | null = null
  private readonly localPort: number
  private readonly cb: LinkCallbacks

  constructor(opts: ConnectOptions, cb: LinkCallbacks) {
    this.cb = cb
    this.localPort = opts.localPort ?? 14550
    this.fixedRemote = Boolean(opts.host && opts.port)
    if (this.fixedRemote) this.remote = { host: opts.host!, port: opts.port! }

    // Probe first, bind second. The probe is async, so the socket does not exist for
    // a few ms; `write()` and `close()` both tolerate that.
    void udpPortInUse(this.localPort).then((inUse) => {
      if (this.closed) return
      if (inUse) {
        this.conflict =
          `port ${this.localPort} was ALREADY IN USE when Bondor connected. Both binds ` +
          'succeed under SO_REUSEADDR and the newcomer takes most of the stream — so ' +
          'Bondor is very likely STARVING the other process (duburi_ws? QGroundControl?) ' +
          'of telemetry and command ACKs right now. Close one of them.'
      }
      this.open()
    })
  }

  private status(extra: Partial<{ waiting: string }> = {}): void {
    const peer = this.remote ? ` ↔ ${this.remote.host}:${this.remote.port}` : ' (listening)'
    this.cb.onStatus({
      connected: true,
      detail: `UDP :${this.localPort}${peer}`,
      // A conflict outlives the arrival of data, deliberately -- see udpPortInUse.
      ...(this.conflict ? { conflict: this.conflict } : {}),
      ...extra
    })
  }

  private open(): void {
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true })
    this.socket = sock

    sock.on('message', (buf, rinfo) => {
      if (!this.fixedRemote) this.remote = { host: rinfo.address, port: rinfo.port }
      if (!this.sawData) {
        this.sawData = true
        if (this.firstDataTimer) {
          clearTimeout(this.firstDataTimer)
          this.firstDataTimer = null
        }
        this.status() // clears `waiting`; keeps `conflict` if there is one
      }
      this.cb.onData(buf)
    })
    sock.on('error', (err) => this.cb.onStatus({ connected: false, error: err.message }))
    sock.on('listening', () => {
      // Report connected (the 1 Hz GCS heartbeat depends on it -- see LinkStatus) but
      // say plainly that nothing has arrived yet.
      this.status({ waiting: 'listening — no data from the vehicle yet' })
    })

    this.firstDataTimer = setTimeout(() => {
      if (this.sawData || this.closed) return
      // Nothing arrived. Note this is NOT the collision case -- a colliding Bondor
      // receives fine. This is a dead bridge, a wrong port, or an unpowered vehicle.
      this.status({
        waiting:
          `nothing received in ${FIRST_DATA_TIMEOUT_MS / 1000}s. Check the vehicle is ` +
          'powered and that the bridge targets THIS host and port (BlueOS → Bridget).'
      })
    }, FIRST_DATA_TIMEOUT_MS)

    try {
      sock.bind(this.localPort)
    } catch (e: any) {
      // Synchronous bind throws are rare; async ones arrive on 'error' above.
      this.cb.onStatus({ connected: false, error: String(e?.message ?? e) })
    }
  }

  write(buf: Buffer): void {
    if (this.socket && this.remote) this.socket.send(buf, this.remote.port, this.remote.host)
  }

  close(): void {
    this.closed = true
    if (this.firstDataTimer) {
      clearTimeout(this.firstDataTimer)
      this.firstDataTimer = null
    }
    try {
      this.socket?.close()
    } catch {
      /* already closed */
    }
    this.socket = null
  }
}
