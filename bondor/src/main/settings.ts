// Persisted operator settings — currently just the last connection used.
//
// Deliberately a plain JSON file rather than a dependency: this is one small blob,
// and `electron-store` would be a native-ish dep to rebuild alongside serialport for
// no benefit at this size.
//
// The only hard rule here is that a bad settings file must never stop Bondor
// launching. Everything returns a default on any error — a ground station that
// refuses to start because a preferences file got truncated is worse than one that
// forgets your port.

import { app } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ConnectOptions } from '../shared/protocol'

export interface BondorSettings {
  lastConnection?: ConnectOptions
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'bondor-settings.json')
}

export function readSettings(): BondorSettings {
  try {
    const parsed = JSON.parse(readFileSync(settingsPath(), 'utf8'))
    return parsed && typeof parsed === 'object' ? (parsed as BondorSettings) : {}
  } catch {
    return {}
  }
}

export function writeSettings(next: BondorSettings): void {
  try {
    writeFileSync(settingsPath(), JSON.stringify(next, null, 2), 'utf8')
  } catch {
    /* preferences are best-effort; never surface as a connect failure */
  }
}
