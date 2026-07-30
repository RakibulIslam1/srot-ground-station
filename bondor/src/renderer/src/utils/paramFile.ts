// =============================================================================
//  SROT parameter file — serialise / parse.
//
//  Format is QGroundControl's `.params`: `#` comment lines, then one parameter per
//  line as TAB-separated `sysid  compid  name  value  type`. Chosen over JSON so the
//  file is diffable in git, editable by hand, and loadable by QGC/MP if you ever need
//  a second opinion on a tune.
//
//  WHY THIS EXISTS: parameters live in ESP32 NVS, which survives a firmware upload —
//  but bumping PARAM_DEFAULTS_VER (or a full-chip erase) rewrites every one of them
//  from its compiled default. That has already thrown away pool tuning several times.
//  This is the backup.
// =============================================================================

/** MAV_PARAM_TYPE_REAL32 — the firmware advertises every param as REAL32. */
const PARAM_TYPE_REAL32 = 9

export interface ParamFileMeta {
  /** Parameters that parsed cleanly. */
  values: Record<string, number>
  /** Lines that looked like data but could not be parsed (reported, not silently dropped). */
  badLines: string[]
  /** PARAM_DEFAULTS_VER recorded in the header, if the file has one. */
  defaultsVer?: number
  /** ISO timestamp recorded in the header, if present. */
  savedAt?: string
}

export function serializeParams(
  values: Record<string, number>,
  opts: { sysid?: number; compid?: number; defaultsVer?: number; vehicle?: string } = {}
): string {
  const sysid = opts.sysid ?? 1
  const compid = opts.compid ?? 1
  const names = Object.keys(values).sort()

  const lines: string[] = [
    `# SROT parameter backup — ${opts.vehicle ?? 'SROT control board'}`,
    `# Saved: ${new Date().toISOString()}`,
    `# Parameters: ${names.length}`,
    ...(opts.defaultsVer !== undefined ? [`# PARAM_DEFAULTS_VER: ${opts.defaultsVer}`] : []),
    '#',
    '# Restore with Bondor: Parameters -> Import. CAL_* rows carry the sensor',
    '# calibration (accel/mag/level trim and the detected motor directions), which',
    '# lives in a separate NVS namespace and is otherwise lost on an NVS wipe.',
    '#',
    '# Vehicle-Id\tComponent-Id\tName\tValue\tType'
  ]

  for (const n of names) {
    const v = values[n]
    if (!Number.isFinite(v)) continue // never write NaN/Inf into a restore file
    // 8 significant digits: enough to round-trip a float32 exactly, short enough to read.
    lines.push(`${sysid}\t${compid}\t${n}\t${formatValue(v)}\t${PARAM_TYPE_REAL32}`)
  }
  return lines.join('\n') + '\n'
}

function formatValue(v: number): string {
  if (Number.isInteger(v)) return v.toFixed(1) // 1 -> "1.0", matches QGC output
  return String(Number(v.toPrecision(8)))
}

export function parseParams(text: string): ParamFileMeta {
  const out: ParamFileMeta = { values: {}, badLines: [] }

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue

    if (line.startsWith('#')) {
      const dv = /PARAM_DEFAULTS_VER:\s*(\d+)/i.exec(line)
      if (dv) out.defaultsVer = Number(dv[1])
      const sa = /Saved:\s*(\S+)/i.exec(line)
      if (sa) out.savedAt = sa[1]
      continue
    }

    // Split on any run of whitespace so a file that lost its tabs (pasted through a
    // chat window, say) still loads — this is a recovery tool, be forgiving.
    const parts = line.split(/\s+/)

    // QGC writes 5 columns; a bare `NAME value` pair is also accepted.
    let name: string | undefined
    let valueStr: string | undefined
    if (parts.length >= 5) {
      name = parts[2]
      valueStr = parts[3]
    } else if (parts.length === 2) {
      name = parts[0]
      valueStr = parts[1]
    }

    const value = valueStr !== undefined ? Number(valueStr) : NaN
    // A name must look like a param id, and the value must be a real finite number —
    // otherwise this is not a data line and pretending it is would corrupt the restore.
    if (!name || !/^[A-Z][A-Z0-9_]{0,15}$/.test(name) || !Number.isFinite(value)) {
      out.badLines.push(line)
      continue
    }
    out.values[name] = value
  }
  return out
}

export interface ParamDiffEntry {
  name: string
  from: number | undefined // undefined = the vehicle does not have this parameter
  to: number
}

export interface ParamDiff {
  changed: ParamDiffEntry[]
  /** In the file but not on this vehicle — skipped, so an older/newer file still loads. */
  unknown: string[]
  /** On the vehicle but absent from the file — left alone. */
  missing: string[]
  same: number
}

/**
 * Parameters that describe the FIRMWARE rather than the configuration, or that are
 * momentary triggers. Restoring these is meaningless at best: SYS_PARAM_VER is forced
 * on every boot, and writing MAG_ALIGN/ATUNE from a file would kick off a re-alignment
 * or an autotune as a side effect of a restore.
 */
const NOT_RESTORABLE = new Set(['SYS_PARAM_VER', 'MAG_ALIGN', 'ATUNE'])

/**
 * Compare a parsed file against the vehicle's current values.
 *
 * Float compare uses a relative epsilon: values make the round trip through a
 * float32 and an 8-digit decimal, so an exact `!==` would report dozens of
 * phantom changes and bury the real ones.
 */
export function diffParams(
  fileValues: Record<string, number>,
  vehicleValues: Record<string, number>
): ParamDiff {
  const changed: ParamDiffEntry[] = []
  const unknown: string[] = []
  let same = 0

  for (const [name, to] of Object.entries(fileValues)) {
    if (NOT_RESTORABLE.has(name)) {
      same++ // counted as "no action", never written
      continue
    }
    if (!(name in vehicleValues)) {
      unknown.push(name)
      continue
    }
    const from = vehicleValues[name]
    if (nearlyEqual(from, to)) same++
    else changed.push({ name, from, to })
  }

  const fileNames = new Set(Object.keys(fileValues))
  const missing = Object.keys(vehicleValues).filter(
    (n) => !fileNames.has(n) && !NOT_RESTORABLE.has(n)
  )

  changed.sort((a, b) => a.name.localeCompare(b.name))
  return { changed, unknown: unknown.sort(), missing: missing.sort(), same }
}

export function nearlyEqual(a: number, b: number): boolean {
  if (a === b) return true
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false
  return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b))
}

/** Params that only take effect after a reboot — the import dialog calls these out. */
export function needsReboot(name: string): boolean {
  return /^PIN_/.test(name) || name === 'ESPNOW_EN'
}
