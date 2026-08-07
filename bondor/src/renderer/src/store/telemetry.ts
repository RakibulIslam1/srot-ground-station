// =============================================================================
//  Bondor telemetry store — subscribes to decoded MAVLink from the main process
//  and exposes a normalised vehicle state + command actions to the UI.
//
//  Performance: high-rate inspector data (per-message rate/fields) is kept in a
//  NON-reactive module registry (no React notify per message). Hot visuals read
//  a throttled snapshot (useThrottledTelemetry) so render rate is decoupled from
//  message rate — this is what keeps the UI from storming under fast streams.
// =============================================================================

import { useEffect, useState } from 'react'
import { create } from 'zustand'
import {
  FlightMode,
  MAV_CMD,
  MavResult,
  MoveType,
  type ConnectionStatus,
  type ConnectOptions,
  type MavMessage
} from '../../../shared/protocol'

const MAV_MODE_FLAG_SAFETY_ARMED = 0x80

export interface StatusLine {
  ts: number
  severity: number
  text: string
}

export interface ParamWriteResult {
  written: string[]
  /** Never acknowledged after every retry — the caller MUST surface these. */
  failed: string[]
}

export interface AckLine {
  ts: number
  command: number
  result: number
  progress: number
}

/**
 * Outcome of a "Save to flash".
 *
 * `saved`    — the vehicle confirmed the NVS write completed.
 * `failed`   — the vehicle reported the write did NOT happen (full/worn NVS).
 * `rejected` — the vehicle refused the request outright.
 * `assumed`  — request accepted, but this firmware (< behaviour rev 7) never confirms
 *              writes, so success cannot be distinguished from silence.
 * `no-reply` — nothing came back at all.
 *
 * Note `assumed` is a deliberately separate state from `saved`: reporting an unconfirmed
 * write as confirmed is the failure mode this whole path exists to avoid.
 */
export type SaveOutcome = {
  state: 'saved' | 'failed' | 'rejected' | 'assumed' | 'no-reply'
  detail?: string
}

// The write is deferred to the board's Core-0 update(), and over the LoRa bridge the
// reply shares an ~8/s uplink slot, so this is generous on purpose.
const SAVE_TIMEOUT_MS = 4000

// Non-reactive inspector registry (updated every message, read on a timer).
export const inspector: {
  rates: Record<string, number>
  hz: Record<string, number>
  fields: Record<string, MavMessage['fields']>
} = { rates: {}, hz: {}, fields: {} }

interface TelemetryState {
  status: ConnectionStatus
  lastHeartbeatTs: number
  armed: boolean
  mode: number
  roll: number
  pitch: number
  yaw: number
  rollspeed: number
  pitchspeed: number
  yawspeed: number
  depth: number
  battVolt: number // PM1
  battVolt2: number // PM2
  battCurr: number
  rpm: number[]
  named: Record<string, number>
  // SROT_FW_BEHAVIOUR_REV, from AUTOPILOT_VERSION.middlewareSwVersion. -1 = not read yet.
  //
  // This is the number that decides whether the vehicle brakes. duburi_ws removed its
  // host-side MOVE_STOP brake because rev 2 brakes on-board, and it refuses to arm below
  // rev 2 -- so a hull flashed with older firmware coasts on every stop and abort, with
  // nothing in any log to say why. The operator needs to see it BEFORE the vehicle goes
  // in the water, and Bondor is where they look. 0 means firmware older than 2026-08-01
  // (that build never populated the field), NOT "unknown" -- treat it as rev 1.
  fwBehaviourRev: number
  statusText: StatusLine[]
  acks: AckLine[]
  paramValues: Record<string, number>
  paramCount: number

  ingest: (m: MavMessage) => void
  setStatus: (s: ConnectionStatus) => void
  connect: (opts: ConnectOptions) => void
  disconnect: () => void
  arm: (armed: boolean) => void
  setMode: (mode: FlightMode) => void
  sendMove: (type: MoveType, primary: number, speed: number, aux: number, timeout: number) => void
  reboot: () => void
  requestParams: () => void
  setParam: (id: string, value: number) => void
  saveParams: () => Promise<SaveOutcome>
  writeParams: (
    entries: Array<{ name: string; value: number }>,
    onProgress?: (done: number, total: number) => void
  ) => Promise<ParamWriteResult>
  sendCommand: (command: number, params?: number[]) => void
  sendServo: (channel1Based: number, us: number) => void
}

// AUTOPILOT_VERSION msgid, the payload of our MAV_CMD.REQUEST_MESSAGE probe.
const MSG_ID_AUTOPILOT_VERSION = 148

// --- module-level coalescing / guards (not reactive) ------------------------
let pendingParams: Record<string, number> = {}
let pendingParamCount = 0
let paramFlushTimer: ReturnType<typeof setTimeout> | null = null
let autoParamsRequested = false
// Same one-shot-per-connection pattern as autoParamsRequested: the board only sends
// AUTOPILOT_VERSION when asked, so ask once and re-arm on disconnect.
let autoVersionRequested = false
// Param download gap-fill (for lossy links like LoRa): track which indices arrived so
// we can re-request the missing ones when the stream stalls.
const seenParamIdx = new Set<number>()
let lastParamTs = 0
// Latest PARAM_VALUE echo per name — the acknowledgement channel for writeParams().
const paramAckLatest: Record<string, number> = {}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

// The value makes a round trip through a float32, so an exact compare would reject
// echoes that are in fact correct and retry forever.
function nearlyEqualNum(a: number, b: number): boolean {
  if (a === b) return true
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false
  return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b))
}

export const useTelemetry = create<TelemetryState>((set, get) => ({
  status: { connected: false },
  lastHeartbeatTs: 0,
  armed: false,
  mode: FlightMode.MANUAL,
  roll: 0,
  pitch: 0,
  yaw: 0,
  rollspeed: 0,
  pitchspeed: 0,
  yawspeed: 0,
  depth: 0,
  battVolt: 0,
  battVolt2: 0,
  battCurr: 0,
  rpm: new Array(8).fill(0),
  named: {},
  fwBehaviourRev: -1,
  statusText: [],
  acks: [],
  paramValues: {},
  paramCount: 0,

  ingest: (m) => {
    const f = m.fields as Record<string, any>
    switch (m.name) {
      case 'HEARTBEAT': {
        set({
          lastHeartbeatTs: m.ts,
          armed: (Number(f.baseMode) & MAV_MODE_FLAG_SAFETY_ARMED) !== 0,
          mode: Number(f.customMode)
        })
        // Auto-load parameters once per fresh connection.
        if (!autoParamsRequested && get().paramCount === 0) {
          autoParamsRequested = true
          get().requestParams()
        }
        // Ask once per connection which firmware behaviour this hull is running. The
        // board only sends AUTOPILOT_VERSION on request, and a rev the operator never
        // sees is a rev they cannot act on.
        if (!autoVersionRequested) {
          autoVersionRequested = true
          get().sendCommand(MAV_CMD.REQUEST_MESSAGE, [MSG_ID_AUTOPILOT_VERSION])
        }
        break
      }
      case 'AUTOPILOT_VERSION': {
        // middlewareSwVersion carries SROT_FW_BEHAVIOUR_REV -- the board has no
        // middleware, so the field was free. See the field comment on the store.
        set({ fwBehaviourRev: Number(f.middlewareSwVersion) })
        break
      }
      case 'ATTITUDE': {
        set({
          roll: Number(f.roll),
          pitch: Number(f.pitch),
          yaw: Number(f.yaw),
          rollspeed: Number(f.rollspeed),
          pitchspeed: Number(f.pitchspeed),
          yawspeed: Number(f.yawspeed)
        })
        break
      }
      case 'VFR_HUD': {
        set({ depth: -Number(f.alt) }) // depth reported via alt (− below surface)
        break
      }
      case 'SYS_STATUS': {
        set({ battVolt: Number(f.voltageBattery) / 1000, battCurr: Number(f.currentBattery) / 100 })
        break
      }
      case 'BATTERY_STATUS': {
        const id = Number(f.id) || 0
        const v = Array.isArray(f.voltages) ? Number(f.voltages[0]) : 0
        if (v > 0 && v < 65535) set(id === 1 ? { battVolt2: v / 1000 } : { battVolt: v / 1000 })
        break
      }
      case 'ESC_STATUS': {
        const start = Number(f.index) || 0
        const rpm = [...get().rpm]
        const arr = Array.isArray(f.rpm) ? f.rpm : []
        for (let i = 0; i < arr.length && start + i < rpm.length; i++) rpm[start + i] = Number(arr[i])
        set({ rpm })
        break
      }
      case 'NAMED_VALUE_FLOAT': {
        const name = String(f.name).replace(/\0/g, '').trim()
        if (name) set({ named: { ...get().named, [name]: Number(f.value) } })
        break
      }
      case 'STATUSTEXT': {
        const text = String(f.text).replace(/\0/g, '').trim()
        set({ statusText: [...get().statusText.slice(-199), { ts: m.ts, severity: Number(f.severity), text }] })
        break
      }
      case 'COMMAND_ACK': {
        set({
          acks: [
            ...get().acks.slice(-49),
            { ts: m.ts, command: Number(f.command), result: Number(f.result), progress: Number(f.progress ?? 0) }
          ]
        })
        break
      }
      case 'PARAM_VALUE': {
        const id = String(f.paramId).replace(/\0/g, '').trim()
        const idx = Number(f.paramIndex)
        if (Number.isFinite(idx) && idx >= 0 && idx < 65535) seenParamIdx.add(idx)
        lastParamTs = m.ts
        if (id) {
          pendingParams[id] = Number(f.paramValue)
          // The vehicle echoes PARAM_VALUE after every accepted PARAM_SET, which is the
          // only per-parameter acknowledgement the protocol gives us. An in-flight bulk
          // write watches this to know what landed and what needs resending.
          paramAckLatest[id] = Number(f.paramValue)
          pendingParamCount = Number(f.paramCount) || pendingParamCount
          if (!paramFlushTimer) {
            paramFlushTimer = setTimeout(() => {
              paramFlushTimer = null
              set({
                paramValues: { ...get().paramValues, ...pendingParams },
                paramCount: pendingParamCount || get().paramCount
              })
              pendingParams = {}
            }, 80)
          }
        }
        break
      }
    }
    // Inspector registry — non-reactive (read on a timer by InspectorView).
    const prevTs = inspector.rates[m.name]
    if (prevTs) {
      const dt = (m.ts - prevTs) / 1000
      if (dt > 0) {
        const inst = 1 / dt
        inspector.hz[m.name] = inspector.hz[m.name] ? inspector.hz[m.name] * 0.7 + inst * 0.3 : inst
      }
    }
    inspector.rates[m.name] = m.ts
    inspector.fields[m.name] = m.fields
  },

  setStatus: (s) => {
    if (!s.connected) {
      autoParamsRequested = false // re-arm auto-load for the next connect
      // Re-arm the version probe AND clear the cached rev. A stale "rev 2" carried
      // across a reconnect would be a lie the moment a different board is plugged in,
      // and this readout exists precisely to be trusted before a dive.
      autoVersionRequested = false
      set({ fwBehaviourRev: -1 })
    }
    set({ status: s })
  },
  connect: (opts) => void window.bondor.connect(opts),
  disconnect: () => void window.bondor.disconnect(),

  arm: (armed) =>
    void window.bondor.sendCommandLong({ command: MAV_CMD.COMPONENT_ARM_DISARM, params: [armed ? 1 : 0] }),

  setMode: (mode) =>
    void window.bondor.sendCommandLong({ command: MAV_CMD.DO_SET_MODE, params: [1, mode] }),

  sendMove: (type, primary, speed, aux, timeout) =>
    void window.bondor.sendCommandLong({ command: MAV_CMD.SROT_MOVE, params: [type, primary, speed, aux, timeout] }),

  reboot: () =>
    void window.bondor.sendCommandLong({ command: MAV_CMD.PREFLIGHT_REBOOT_SHUTDOWN, params: [1] }),

  requestParams: () => {
    seenParamIdx.clear()
    lastParamTs = Date.now()
    set({ paramValues: {}, paramCount: 0 })
    void window.bondor.requestParamList()
  },

  setParam: (id, value) => void window.bondor.sendParamSet({ id, value }),

  // Save to flash, and WAIT for the vehicle to say what happened.
  //
  // This deliberately does not treat the COMMAND_ACK as the answer. The firmware ACKs
  // PREFLIGHT_STORAGE as ACCEPTED the moment it parses it, then defers the real NVS write
  // to its Core-0 update() -- so the ACK means "request received", not "written". Reporting
  // it as saved is how a failed write on a full NVS could look successful and lose a tune.
  //
  // The write's true outcome arrives as a STATUSTEXT ("Params saved to flash" /
  // "SAVE FAILED - params NOT written"). We wait for the ACK to prove the request landed,
  // then for the STATUSTEXT to learn the result.
  saveParams: async () => {
    const ackFrom = get().acks.length
    const textFrom = get().statusText.length
    void window.bondor.sendCommandLong({ command: MAV_CMD.PREFLIGHT_STORAGE, params: [1] })

    const deadline = Date.now() + SAVE_TIMEOUT_MS
    let accepted = false
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 60))

      if (!accepted) {
        const ack = get()
          .acks.slice(ackFrom)
          .find((a) => a.command === MAV_CMD.PREFLIGHT_STORAGE)
        if (ack) {
          if (ack.result !== MavResult.ACCEPTED) {
            return { state: 'rejected', detail: `vehicle returned MAV_RESULT ${ack.result}` }
          }
          accepted = true
        }
      }

      for (const line of get().statusText.slice(textFrom)) {
        if (/SAVE FAILED/i.test(line.text)) return { state: 'failed', detail: line.text }
        if (/params saved to flash/i.test(line.text)) return { state: 'saved' }
      }
    }

    // Firmware older than behaviour rev 7 only ever spoke up on FAILURE, so an accepted
    // request with no complaint is the best evidence of success it can give.
    return accepted
      ? { state: 'assumed', detail: 'accepted, but this firmware does not confirm writes — reload to check' }
      : { state: 'no-reply', detail: 'no acknowledgement from the vehicle' }
  },

  // Bulk parameter write with per-parameter acknowledgement and retry — the restore
  // half of Export/Import.
  //
  // Not a plain `entries.forEach(setParam)`: 200+ PARAM_SETs sent back-to-back overrun
  // the link (badly over LoRa), and PARAM_SET has no ACK of its own, so a dropped one
  // is invisible. A half-applied restore that reports success is the worst possible
  // outcome here, so every write is confirmed against the vehicle's PARAM_VALUE echo
  // and anything unconfirmed is resent.
  writeParams: async (entries, onProgress) => {
    const kind = get().status.kind
    // The LoRa bridge appears as `kind === 'serial'` — it IS a USB serial port — so link
    // kind alone cannot tell a direct board from a radio hop, and the old code paced the
    // radio as if it were USB. The air link carries ONE uplink packet per received downlink
    // slot (~8/s), so ~20 writes/s overran the bridge's queue and writes were silently
    // dropped. That is what "sometimes it saves and sometimes it doesn't" was.
    //
    // Detect the bridge by the named values only it emits (the ground station streams
    // LORA_RSSI/LORA_RX; a directly-connected board never sends either), so this needs no
    // protocol change. Then pace under the 8/s ceiling and let the existing PARAM_VALUE
    // confirm-and-retry do its job instead of being swamped.
    //
    // Three things matter about HOW this is evaluated, and all three were got wrong first
    // time round:
    //  1. It is re-read before every batch, not sampled once. The bridge's named values only
    //     start flowing after it decodes its first downlink frame, so importing before the
    //     vehicle is up — the ordinary pre-dive workflow — sampled an empty `named` and chose
    //     the fast profile for the whole import. That is precisely the overrun being fixed.
    //  2. "No telemetry at all yet" is treated as LoRa ONLY ON A SERIAL LINK. Point 1 above
    //     is the reason: the bridge IS a USB serial port, so a UDP link cannot be a LoRa hop
    //     however quiet it is. The clause used to be unconditional, which meant every fresh
    //     UDP connect -- the ordinary pre-dive workflow over BlueOS -- paced a ~230-param
    //     import at 4 per 1200 ms for no reason at all. Guessing wrong toward slow costs a
    //     minute; guessing wrong toward fast loses parameters, so the caution is kept exactly
    //     where it can still be a radio.
    //  3. A stale LORA_* from an earlier session in the same app run only ever over-paces a
    //     direct link, which is safe.
    const linkProfile = (): { perBatch: number; gap: number; settle: number } => {
      const n = get().named
      const lora =
        n.LORA_RSSI !== undefined ||
        n.LORA_RX !== undefined ||
        (kind === 'serial' && Object.keys(n).length === 0)
      if (lora) return { perBatch: 4, gap: 1200, settle: 2500 }
      return { perBatch: 8, gap: kind === 'serial' ? 400 : 700, settle: kind === 'serial' ? 900 : 1800 }
    }
    const MAX_PASSES = 4

    const target = new Map(entries.map((e) => [e.name, e.value]))
    const written = new Set<string>()
    let settleMs = linkProfile().settle

    for (let pass = 0; pass < MAX_PASSES && written.size < target.size; pass++) {
      const todo = [...target.entries()].filter(([n]) => !written.has(n))

      for (let i = 0; i < todo.length; ) {
        const p = linkProfile()
        settleMs = p.settle
        for (const [name, value] of todo.slice(i, i + p.perBatch)) {
          delete paramAckLatest[name] // only accept an echo that arrives AFTER this send
          void window.bondor.sendParamSet({ id: name, value })
        }
        i += p.perBatch
        await sleep(p.gap)
        // Harvest echoes that have already come back so progress tracks reality.
        for (const [name, value] of todo) {
          const ack = paramAckLatest[name]
          if (ack !== undefined && nearlyEqualNum(ack, value)) written.add(name)
        }
        onProgress?.(written.size, target.size)
      }

      // Let the last batch's echoes land before deciding what to retry.
      await sleep(settleMs)
      for (const [name, value] of todo) {
        const ack = paramAckLatest[name]
        if (ack !== undefined && nearlyEqualNum(ack, value)) written.add(name)
      }
      onProgress?.(written.size, target.size)
    }

    // Fold everything confirmed into the store so the UI reflects the vehicle without
    // waiting for a full re-download.
    const confirmed: Record<string, number> = {}
    for (const n of written) confirmed[n] = target.get(n) as number
    set({ paramValues: { ...get().paramValues, ...confirmed } })

    return {
      written: [...written],
      failed: [...target.keys()].filter((n) => !written.has(n))
    }
  },

  sendCommand: (command, params) => void window.bondor.sendCommandLong({ command, params }),

  sendServo: (channel1Based, us) =>
    void window.bondor.sendCommandLong({ command: MAV_CMD.DO_SET_SERVO, params: [channel1Based, us] })
}))

// Throttled whole-state snapshot for hot visuals (re-renders at `hz`, not per message).
export function useThrottledTelemetry(hz = 15): TelemetryState {
  const [snap, setSnap] = useState<TelemetryState>(() => useTelemetry.getState())
  useEffect(() => {
    const t = setInterval(() => setSnap(useTelemetry.getState()), 1000 / hz)
    return () => clearInterval(t)
  }, [hz])
  return snap
}

// Wire the main-process event streams into the store exactly once.
let wired = false
export function wireTelemetry(): void {
  if (wired) return
  wired = true
  window.bondor.onMessage((m) => useTelemetry.getState().ingest(m))
  window.bondor.onStatus((s) => useTelemetry.getState().setStatus(s))

  // Param download gap-filler: if the list request left gaps (dropped frames over a
  // lossy LoRa link) and the stream has stalled, re-request the missing indices. Self-
  // heals until every parameter has arrived.
  setInterval(() => {
    const s = useTelemetry.getState()
    if (!s.status.connected) return
    const count = s.paramCount
    if (count <= 0 || seenParamIdx.size >= count) return // idle or complete
    if (Date.now() - lastParamTs < 1200) return // still actively arriving — wait
    let sent = 0
    for (let i = 0; i < count && sent < 8; i++) {
      if (!seenParamIdx.has(i)) {
        void window.bondor.requestParamReadIndex(i)
        sent++
      }
    }
  }, 900)
}
