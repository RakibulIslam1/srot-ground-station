// =============================================================================
//  useGamepad — reads the browser Gamepad API and streams MANUAL_CONTROL to the
//  vehicle at ~25 Hz while enabled. Sub axis mapping:
//    forward (x) = −leftY · lateral (y) = leftX · yaw (r) = rightX
//    heave  (z) = rightY → 0..1000 (500 neutral) · buttons → 16-bit mask
//
//  SINGLE SHARED POLLER. This used to be a plain hook holding its own interval and
//  its own `enabled` flag, so a second view mounting it produced a SECOND 25 Hz
//  MANUAL_CONTROL stream fighting the first. The poller now lives at module scope,
//  is started once, and publishes live state that any number of views can read.
// =============================================================================

import { useEffect, useState } from 'react'

const DEADZONE = 0.08
const SEND_HZ = 25

// Rescale past the deadzone instead of hard-cutting it. A bare `|v| < DZ ? 0 : v`
// makes the output jump straight from 0 to ±DEADZONE the moment the stick leaves
// centre, which feels like a lurch. This keeps it continuous: 0 at the deadzone
// edge, ±1 at full deflection.
function dz(v: number): number {
  const a = Math.abs(v)
  if (a < DEADZONE) return 0
  return Math.sign(v) * ((a - DEADZONE) / (1 - DEADZONE))
}

export interface PadLive {
  connected: boolean
  name: string
  buttons: boolean[] // per-button pressed state, as reported by the pad
  values: number[] // per-button analog value (triggers)
  axes: number[] // raw axis values, pre-deadzone
  cmd: { x: number; y: number; z: number; r: number; buttons: number }
}

const EMPTY: PadLive = {
  connected: false,
  name: '',
  buttons: [],
  values: [],
  axes: [],
  cmd: { x: 0, y: 0, z: 500, r: 0, buttons: 0 }
}

let live: PadLive = EMPTY
let enabled = false
let timer: ReturnType<typeof setInterval> | null = null
const subs = new Set<() => void>()

function notify(): void {
  subs.forEach((f) => f())
}

function tick(): void {
  const pad = navigator.getGamepads().find(Boolean)
  if (!pad) {
    if (live.connected) {
      live = EMPTY
      notify()
    }
    return
  }
  const ax = pad.axes
  const lx = dz(ax[0] ?? 0)
  const ly = dz(ax[1] ?? 0)
  const rx = dz(ax[2] ?? 0)
  const ry = dz(ax[3] ?? 0)

  let mask = 0
  const pressed: boolean[] = []
  const values: number[] = []
  pad.buttons.forEach((b, i) => {
    pressed.push(b.pressed)
    values.push(b.value)
    if (i < 16 && b.pressed) mask |= 1 << i // firmware only decodes the low 16
  })

  const cmd = {
    x: Math.round(-ly * 1000),
    y: Math.round(lx * 1000),
    r: Math.round(rx * 1000),
    z: Math.round((-ry * 0.5 + 0.5) * 1000),
    buttons: mask
  }

  live = { connected: true, name: pad.id, buttons: pressed, values, axes: [...ax], cmd }
  notify()
  if (enabled) void window.bondor.sendManualControl(cmd)
}

function start(): void {
  if (timer) return
  timer = setInterval(tick, 1000 / SEND_HZ)
}

/** Live pad state + the shared enable flag. Safe to call from any number of views. */
export function usePad(hz = 15): PadLive & { enabled: boolean; setEnabled: (v: boolean) => void } {
  const [, force] = useState(0)
  useEffect(() => {
    start()
    // Re-render at `hz`, not at the 25 Hz poll rate — same reasoning as the
    // throttled telemetry readouts: a hot source must not drive React directly.
    const id = setInterval(() => force((n) => n + 1), 1000 / hz)
    const sub = (): void => {}
    subs.add(sub)
    return () => {
      clearInterval(id)
      subs.delete(sub)
    }
  }, [hz])

  return {
    ...live,
    enabled,
    setEnabled: (v: boolean) => {
      enabled = v
      notify()
    }
  }
}

export interface GamepadState {
  connected: boolean
  name: string
  enabled: boolean
  setEnabled: (v: boolean) => void
  last: { x: number; y: number; z: number; r: number; buttons: number }
}

/** Back-compat shape used by the Dive view. Backed by the same shared poller. */
export function useGamepad(): GamepadState {
  const p = usePad()
  return {
    connected: p.connected,
    name: p.name,
    enabled: p.enabled,
    setEnabled: p.setEnabled,
    last: p.cmd
  }
}
