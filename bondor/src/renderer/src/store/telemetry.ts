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
  saveParams: () => void
  writeParams: (
    entries: Array<{ name: string; value: number }>,
    onProgress?: (done: number, total: number) => void
  ) => Promise<ParamWriteResult>
  sendCommand: (command: number, params?: number[]) => void
  sendServo: (channel1Based: number, us: number) => void
}

// --- module-level coalescing / guards (not reactive) ------------------------
let pendingParams: Record<string, number> = {}
let pendingParamCount = 0
let paramFlushTimer: ReturnType<typeof setTimeout> | null = null
let autoParamsRequested = false
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
    if (!s.connected) autoParamsRequested = false // re-arm auto-load for the next connect
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

  saveParams: () =>
    void window.bondor.sendCommandLong({ command: MAV_CMD.PREFLIGHT_STORAGE, params: [1] }),

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
    // LoRa comes through as a serial link to the bridge, but the air link underneath is
    // slow and half-duplex. Serial-to-board tolerates ~20/s; be conservative otherwise.
    const perBatch = 8
    const batchGapMs = kind === 'serial' ? 400 : 700
    const settleMs = kind === 'serial' ? 900 : 1800
    const MAX_PASSES = 4

    const target = new Map(entries.map((e) => [e.name, e.value]))
    const written = new Set<string>()

    for (let pass = 0; pass < MAX_PASSES && written.size < target.size; pass++) {
      const todo = [...target.entries()].filter(([n]) => !written.has(n))

      for (let i = 0; i < todo.length; i += perBatch) {
        for (const [name, value] of todo.slice(i, i + perBatch)) {
          delete paramAckLatest[name] // only accept an echo that arrives AFTER this send
          void window.bondor.sendParamSet({ id: name, value })
        }
        await sleep(batchGapMs)
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
