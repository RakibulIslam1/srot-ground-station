// =============================================================================
//  Bondor main-process MAVLink connection.
//
//  Transport-agnostic: owns the MAVLink 2 codec (node-mavlink), the GCS heartbeat,
//  and the command senders, and pipes bytes through a pluggable MavlinkLink
//  (UDP or serial/USB). Decoded messages are handed up as generic { name, id,
//  fields } objects so the renderer needs no MAVLink codec.
// =============================================================================

import { Writable } from 'node:stream'
import {
  MavLinkPacketSplitter,
  MavLinkPacketParser,
  MavLinkProtocolV2,
  send
} from 'node-mavlink'
import { minimal, common, ardupilotmega } from 'mavlink-mappings'
import {
  GCS_SYSTEM_ID,
  GCS_COMPONENT_ID,
  TARGET_SYSTEM_ID,
  TARGET_COMPONENT_ID,
  type ConnectOptions,
  type ConnectionStatus,
  type CommandLongArgs,
  type ManualControlArgs,
  type ParamSetArgs,
  type MavMessage
} from '../../shared/protocol'
import type { MavlinkLink } from './link'
import { UdpLink } from './udpLink'
import { SerialLink } from './serialLink'

const REGISTRY: Record<number, any> = {
  ...minimal.REGISTRY,
  ...common.REGISTRY,
  ...ardupilotmega.REGISTRY
}

// CRC-extra table for the packet splitter, derived from the SAME registry we decode
// with. This is not optional bookkeeping — MavLinkPacketSplitter validates every frame's
// CRC against a magic-number table and SILENTLY DISCARDS any message whose id is missing
// from it (no error, no callback). node-mavlink bundles its own newer copy of
// mavlink-mappings, and upstream MAVLink removed the WIP messages 290/291 from `common`,
// so ESC_STATUS (291) had no magic number there and every per-thruster RPM packet was
// dropped before it reached the app — Bondor showed 0 rpm while the vehicle was
// reporting it correctly. Deriving the table from REGISTRY means the validator and the
// decoder can never disagree again. Do not remove.
const MAGIC_NUMBERS: Record<number, number> = Object.fromEntries(
  Object.values(REGISTRY).map((c: any) => [c.MSG_ID, c.MAGIC_NUMBER])
)

type MessageCb = (m: MavMessage) => void
type StatusCb = (s: ConnectionStatus) => void

export class MavlinkConnection {
  private link: MavlinkLink | null = null
  private protocol = new MavLinkProtocolV2(GCS_SYSTEM_ID, GCS_COMPONENT_ID)
  private splitter: MavLinkPacketSplitter | null = null
  private parser: MavLinkPacketParser | null = null
  private hbTimer: NodeJS.Timeout | null = null
  private onMessage: MessageCb
  private onStatus: StatusCb
  private status: ConnectionStatus = { connected: false }

  // A Writable that forwards serialised MAVLink frames to the active link.
  private txStream = new Writable({
    write: (chunk: Buffer, _enc, cb) => {
      this.link?.write(chunk)
      cb()
    }
  })

  constructor(onMessage: MessageCb, onStatus: StatusCb) {
    this.onMessage = onMessage
    this.onStatus = onStatus
  }

  getStatus(): ConnectionStatus {
    return this.status
  }

  private setStatus(s: ConnectionStatus): void {
    this.status = s
    this.onStatus(s)
  }

  connect(opts: ConnectOptions): void {
    this.disconnect()

    // Fresh inbound pipeline per connection.
    this.splitter = new MavLinkPacketSplitter({}, { magicNumbers: MAGIC_NUMBERS })
    this.parser = new MavLinkPacketParser()
    this.splitter.pipe(this.parser)
    this.parser.on('data', (packet: any) => this.handlePacket(packet))

    const cb = {
      onData: (buf: Buffer) => this.splitter?.write(buf),
      onStatus: (s: { connected: boolean; detail?: string; error?: string }) => {
        this.setStatus({ ...s, kind: opts.kind })
        if (s.connected) this.startHeartbeat()
        else this.stopHeartbeat()
      }
    }

    switch (opts.kind) {
      case 'udp':
        this.link = new UdpLink(opts, cb)
        break
      case 'serial':
        this.link = new SerialLink(opts, cb)
        break
      default:
        this.setStatus({
          connected: false,
          kind: opts.kind,
          error: 'MAVLink2Rest transport not implemented yet — use Direct UDP or USB.'
        })
    }
  }

  disconnect(): void {
    this.stopHeartbeat()
    if (this.link) {
      this.link.close()
      this.link = null
    }
    this.splitter = null
    this.parser = null
    if (this.status.connected) this.setStatus({ connected: false })
  }

  private handlePacket(packet: any): void {
    const clazz = REGISTRY[packet.header.msgid]
    if (!clazz) return
    let data: any
    try {
      data = packet.protocol.data(packet.payload, clazz)
    } catch {
      return
    }
    const fields: Record<string, number | string | number[]> = {}
    for (const f of clazz.FIELDS) {
      const v = data[f.name]
      fields[f.name] = typeof v === 'bigint' ? Number(v) : v
    }
    this.onMessage({ id: clazz.MSG_ID, name: clazz.MSG_NAME, fields, ts: Date.now() })
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    const beat = (): void => {
      const hb = new minimal.Heartbeat()
      hb.type = minimal.MavType.GCS
      hb.autopilot = minimal.MavAutopilot.INVALID
      hb.baseMode = 0 as minimal.MavModeFlag
      hb.customMode = 0
      hb.systemStatus = minimal.MavState.ACTIVE
      hb.mavlinkVersion = 3
      this.tx(hb)
    }
    beat()
    this.hbTimer = setInterval(beat, 1000)
  }

  private stopHeartbeat(): void {
    if (this.hbTimer) {
      clearInterval(this.hbTimer)
      this.hbTimer = null
    }
  }

  private tx(msg: any): void {
    if (!this.link) return
    send(this.txStream, msg, this.protocol).catch(() => {
      /* drop on transient link error */
    })
  }

  sendCommandLong(args: CommandLongArgs): void {
    const p = args.params ?? []
    const c = new common.CommandLong()
    c.targetSystem = args.targetSystem ?? TARGET_SYSTEM_ID
    c.targetComponent = args.targetComponent ?? TARGET_COMPONENT_ID
    c.command = args.command
    c.confirmation = 0
    c.param1 = p[0] ?? 0
    c.param2 = p[1] ?? 0
    c.param3 = p[2] ?? 0
    c.param4 = p[3] ?? 0
    c.param5 = p[4] ?? 0
    c.param6 = p[5] ?? 0
    c.param7 = p[6] ?? 0
    this.tx(c)
  }

  sendManualControl(a: ManualControlArgs): void {
    const mc = new common.ManualControl()
    mc.target = TARGET_SYSTEM_ID
    mc.x = Math.round(a.x)
    mc.y = Math.round(a.y)
    mc.z = Math.round(a.z)
    mc.r = Math.round(a.r)
    mc.buttons = a.buttons & 0xffff
    this.tx(mc)
  }

  sendParamSet(a: ParamSetArgs): void {
    const ps = new common.ParamSet()
    ps.targetSystem = TARGET_SYSTEM_ID
    ps.targetComponent = TARGET_COMPONENT_ID
    ps.paramId = a.id
    ps.paramValue = a.value
    ps.paramType = a.type ?? common.MavParamType.REAL32
    this.tx(ps)
  }

  requestParamList(): void {
    const rl = new common.ParamRequestList()
    rl.targetSystem = TARGET_SYSTEM_ID
    rl.targetComponent = TARGET_COMPONENT_ID
    this.tx(rl)
  }

  requestParamRead(id: string): void {
    const rr = new common.ParamRequestRead()
    rr.targetSystem = TARGET_SYSTEM_ID
    rr.targetComponent = TARGET_COMPONENT_ID
    rr.paramId = id
    rr.paramIndex = -1
    this.tx(rr)
  }

  requestParamReadIndex(index: number): void {
    const rr = new common.ParamRequestRead()
    rr.targetSystem = TARGET_SYSTEM_ID
    rr.targetComponent = TARGET_COMPONENT_ID
    rr.paramId = ''
    rr.paramIndex = index
    this.tx(rr)
  }
}
