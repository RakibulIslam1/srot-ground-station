# Bondor — SROT Ground Control

Bondor is the SROT-native ground control & configuration app — a QGC-class tool built to unlock the
whole SROT firmware (teleop, AUTO/`SROT_MOVE` moves, calibration, motor test/reverse, tuning,
autotune, LoRa black-box telemetry). Clean Material Design 3 UI (light-purple, dark/light).

It is an **Electron desktop app** (native UDP + serial, no bridge) with a React + MUI UI. The same
UI is written to be web-buildable later behind a transport shim.

## Stack
- **Electron** (main process = MAVLink IO over UDP via `node-mavlink`; serial/LoRa added in Phase 6)
- **React + TypeScript + MUI (Material 3)** renderer, `zustand` telemetry store
- **electron-vite** build/dev tooling

## Layout
```
src/
  shared/protocol.ts     types + constants shared by both processes (SROT contract)
  main/
    index.ts             Electron entry, window, IPC ↔ IO wiring
    mavlink/connection.ts UDP socket + MAVLink 2 codec + GCS heartbeat
  preload/index.ts       contextBridge → window.bondor (typed, sandboxed)
  renderer/src/
    theme/theme.ts       M3 light-purple, light+dark color schemes
    store/telemetry.ts   ingest decoded MAVLink → vehicle state + command actions
    joystick/useGamepad  Gamepad API → MANUAL_CONTROL @25 Hz
    components/…          ConnectionBar, AttitudeIndicator, StatusConsole, …
    views/…              Fly (live), Modes (SROT Move console), + phased stubs
```

## Develop
```bash
cd bondor
npm install
npm run dev        # launches the Electron app with HMR
npm run typecheck  # tsc for both node + web sides
npm run build      # production bundle
```

## Connect
- **USB (serial)** (default): pick the ESP32's COM port (115200). Opens with DTR/RTS de-asserted so
  it won't reset the board. Also the port used by the LoRa ground-station bridge.
- **Direct UDP**: bind a local port (14550) and either auto-learn the vehicle from incoming packets
  or set an explicit host:port (e.g. the Pi/BlueOS router).
- **BlueOS MAVLink2Rest**: transport slot reserved; wired in a follow-up.

### Quick test without hardware
Run any MAVLink source that emits to `udp:127.0.0.1:14550`, e.g. pymavlink:
```python
from pymavlink import mavutil
m = mavutil.mavlink_connection('udpout:127.0.0.1:14550', source_system=1)
import time
while True:
    m.mav.heartbeat_send(12, 3, 0, 23, 4)          # type=SUB, mode=AUTO(23), state=ACTIVE
    m.mav.attitude_send(0, 0.1, 0.05, 1.2, 0,0,0)  # roll/pitch/yaw
    time.sleep(0.1)
```
Bondor's Fly view should show Link OK, the attitude indicator moving, and mode = Auto.

## Backing up parameters (do this before every reflash)

A firmware upload preserves the ESP32's NVS, so tuning normally survives. Two things destroy
it: a build that **bumps `PARAM_DEFAULTS_VER`** (which rewrites every parameter from its
compiled default and reports `Params reset to build defaults`), and a full-chip erase.

**Parameters → Export** writes a QGC-compatible `.params` file containing every value,
including the **`CAL_*`** rows that mirror the sensor calibration — accel/mag/level trim and
the eight MOTOR_DETECT directions. That calibration lives in a separate NVS namespace and is
not otherwise recoverable; redoing the mag cal means physically spinning the vehicle.

Export is disabled until the whole parameter list has downloaded — a partial file would look
complete and silently restore defaults for everything missing.

**Parameters → Import** parses the file and shows a **diff first**: what changes, what already
matches, what the file has that this vehicle doesn't (skipped), and what the vehicle has that
the file doesn't (left untouched, never reset). It flags changes that need a reboot
(`PIN_*`, `ESPNOW_EN`). Nothing is written until you confirm.

The write is throttled and **acknowledged**: `PARAM_SET` has no ACK of its own, so each write
is confirmed against the vehicle's `PARAM_VALUE` echo and anything unconfirmed is retried.
Parameters that never confirm are named in the result — a half-applied restore reporting
success would be the worst outcome here. `SYS_PARAM_VER` and the momentary `ATUNE` / `MAG_ALIGN`
triggers are skipped on import (restoring them is meaningless, or would start an autotune).

Recommended reflash routine: **Export → flash → Import → power-cycle → spot-check the tune.**

## Roadmap (phases)
1. ✅ Connection + Fly HUD + arm/mode + joystick teleop + SROT Move console.
2. ✅ Parameters editor (SROT metadata) + MAVLink inspector.
3. ✅ Vehicle setup: calibration, motors (test/reverse/detect), config groups.
4. ✅ Tuning (PIDs + live chart) + AUTOTUNE + MOTOR_TUNE consoles.
5. ✅ Analyze / black-box plots + record → CSV.
6. ✅ LoRa telemetry — control-board TX + the `groundstation-esp32` LoRa→MAVLink bridge.
7. ⏳ Mission editor + LoRa round-trip (**queued**).

### LoRa telemetry (Phase 6)
The control board transmits a compact black-box frame (`shared/lora_telem_proto.h`) at ~4 Hz. Flash a
second ESP32 as the ground receiver — `pio run -e groundstation-esp32 -t upload` — which re-emits the
frame as MAVLink over USB. In Bondor just **Connect → USB** to the ground-station's port; every page
populates as if directly linked (receive-only). The **LoRa** tab shows RSSI + frame count.

The full Jetson/GCS ↔ AUV contract Bondor speaks is documented in the firmware repo:
[srot-control-board / JETSON_COMMS.md](https://github.com/RakibulIslam1/srot-control-board/blob/main/JETSON_COMMS.md).

> `src/shared/protocol.ts` hand-mirrors the firmware's MAVLink message and command ids. It is a
> **third copy** of that contract (after the firmware's `lib/mavlink/` and this repo's duplicate) —
> when the firmware adds or renumbers a message, update it here too or Bondor will silently drop the
> new one.
