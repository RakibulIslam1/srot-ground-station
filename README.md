# SROT — Ground Station

The operator side of the **SROT** AUV control-board suite. Two independent pieces that are usually
used together:

1. **Bondor** — the desktop ground-control app (Electron + React + MUI). A QGC-class tool built
   specifically for SROT: teleop, the `SROT_MOVE` console, parameters, calibration, motor test,
   PID tuning + autotune, black-box analysis, and a configurable joystick tab.
2. **`groundstation-esp32`** — an ESP32-C3 + SX127x that receives the board's **LoRa** black-box
   telemetry frame and re-emits it as MAVLink over USB, so Bondor connects to it as an ordinary
   serial link.

Part of the **SROT** control-board suite:

| Repo | What it is |
|---|---|
| [srot-control-board](https://github.com/RakibulIslam1/srot-control-board) | ESP32 flight controller + RP2350 thruster co-processor |
| **srot-ground-station** *(this repo)* | Bondor desktop GCS + ESP32-C3 LoRa bridge |
| [srot-esc-flasher](https://github.com/RakibulIslam1/srot-esc-flasher) | BLHeli 4-way interface — flash Bluejay onto the ESCs |

---

## Layout

```
srot-ground-station/
├── platformio.ini        one env: groundstation-esp32
├── src/groundstation/    the ESP32-C3 LoRa → MAVLink bridge firmware
├── shared/               lora_telem_proto.h  (DUPLICATED — see the banner in the file)
├── lib/mavlink/          vendored MAVLink v2 (common + ardupilotmega) — see its README
└── bondor/               the Electron desktop GCS (its own README, own npm project)
```

## Build — the LoRa bridge (ESP32-C3)

Needs [PlatformIO](https://platformio.org/).

```bash
pio run              # build
pio run -t upload    # flash
pio run -t monitor   # 115200
```

Wire the SX127x to the C3 exactly as on the control board; the radio settings
(433 MHz / 250 kHz BW / SF7 / CR 4:5) live in `shared/lora_telem_proto.h` and **must match**.

## Build — Bondor (desktop)

```bash
cd bondor
npm ci
npm run dev        # Electron with HMR
npm run typecheck
npm run build      # production bundle
```

Full details, the view-by-view layout and the connection options are in
[`bondor/README.md`](bondor/README.md).

## Connecting

| Link | How |
|---|---|
| **USB serial** (default) | Pick the board's COM port at 115200. Opens with DTR/RTS de-asserted so it will not reset the ESP32. |
| **LoRa** | Flash `groundstation-esp32`, then connect Bondor to *its* COM port. Receive-only; the LoRa tab shows RSSI + frame count. |
| **UDP** | Bind 14550 and auto-learn the vehicle, or set an explicit host:port (e.g. a Pi/BlueOS router). |

## Keeping in sync with the firmware

Three copies of the same contract exist, by design (no submodules):

| Copy | Lives in | Notes |
|---|---|---|
| `shared/lora_telem_proto.h` | here **and** `srot-control-board` | Struct layout **and** radio config must match byte-for-byte. Change one → copy it across and **reflash both boards**. A mismatch fails CRC silently and looks like being out of range. |
| `lib/mavlink/` | here **and** `srot-control-board` | Vendored MAVLink dialect headers. |
| `bondor/src/shared/protocol.ts` | here only | Hand-mirrors the firmware's message/command ids for the TypeScript side. |

`srot-control-board` is the source of truth for all three — it is the transmitter.

The wire contract itself (every message, rate, unit and failsafe) is documented in
[srot-control-board / JETSON_COMMS.md](https://github.com/RakibulIslam1/srot-control-board/blob/main/JETSON_COMMS.md).
