# AGENTS.md — srot-ground-station (Bondor GCS + LoRa bridge)

Instructions for AI agents and developers working in this repo. A matching file exists in each
sibling repo; the **Shared invariants** section below is deliberately identical in all of them.

---

## What this repo is

Two independent products in one repo:

| Piece | Path | Toolchain |
|---|---|---|
| **Bondor** — the desktop GCS | `bondor/` | Electron + React 18 + MUI, npm/electron-vite |
| **`groundstation-esp32`** — LoRa↔MAVLink bridge firmware | `src/groundstation/` | PlatformIO, ESP32-C3 |

Bondor connects to the vehicle either **directly over USB serial** or **over UDP** (behind an
external MAVLink router); the ESP32-C3 bridges a 433 MHz LoRa link and re-synthesises MAVLink
from a compact 39-byte telemetry frame.

## Where it sits

```
Jetson (duburi_ws) ──USB──┐
                          ├── SROT board (srot-control-board)
Bondor ──USB or LoRa──────┘
```

**Bondor is a parallel, independent link — it is NOT in the control path.** The vehicle flies
without it. Its job is parameters, calibration, tuning, motor test, telemetry and manual
piloting.

### The contention rule

**USB serial is single-owner.** There is no router or mux anywhere in this repo. If the Jetson
holds the vehicle's port, Bondor cannot open it, and vice versa. To run both simultaneously
you need either an external MAVLink router (Bondor then connects as UDP) or the LoRa link.

⚠️ **The LoRa bridge synthesises its own GCS heartbeat** (255/190) as slot filler. That means a
LoRa link alone will keep the vehicle's GCS failsafe satisfied **even if the Jetson has died** —
the failsafe is not source-specific. Keep this in mind before treating "no failsafe fired" as
evidence the companion is alive.

---

## Shared invariants (identical in every repo's AGENTS.md)

These are **co-owned across repos**. Changing one unilaterally breaks a partner silently — no
exception is raised, the vehicle just behaves wrong.

1. **The wire constants are frozen unless changed on both sides in the same PR.**
   `MAV_CMD_SROT_MOVE = 31000`; the `SROT_MOVE` p1 type codes and their ordering; the
   `FlightMode` integers; `PCA_RELAY_BASE_CH = 8`; `MAVLINK_BAUD = 115200`;
   `GCS_FAILSAFE_MS = 5000`.
   This repo mirrors them in **`bondor/src/shared/protocol.ts`**; `duburi_ws` mirrors them in
   `fc/srot_protocol.py` and has a drift test that reads the firmware headers directly.
   `shared/lora_telem_proto.h` is a **hand-maintained copy** of the control board's file —
   the banner in it says so, and a one-sided change does not error, it **silently fails CRC**
   and looks exactly like being out of radio range.

2. **`movement::Type` is append-only.** The wire mapping is `mv_type = wire + 1`, so inserting
   a value silently renumbers every verb after it.

3. **Every command reaches exactly one terminal ACK.** `ACCEPTED` / `CANCELLED` / `FAILED` /
   `DENIED`, plus `TEMPORARILY_REJECTED` on a mutex miss. `IN_PROGRESS` is not terminal.

4. **Depth sign: `VFR_HUD.alt` is negative below the surface.** Bondor already does the right
   thing (`depth = -alt`); keep it that way.

5. **A heartbeat ≥ 1 Hz is mandatory** or the board surfaces after `GCS_FAILSAFE_MS`.

6. **Never break the contract to fix a bug.** If the right fix changes the wire, say so and
   coordinate — do not add a compensating hack on one side.

---

## Rules specific to this repo

**The MAVLink CRC-extra trap — read this before debugging any "missing" message.**
`MavLinkPacketSplitter` validates each frame against a magic-number table and **silently
discards** any message id absent from it. Upstream removed `ESC_STATUS` (291) from `common`,
which is how every per-thruster RPM packet was dropped while the vehicle was reporting them
correctly. The fix in `connection.ts` derives `MAGIC_NUMBERS` from the same `REGISTRY` used to
decode — do not undo it, and suspect it first whenever a message "never arrives".

**LoRa is a 4 Hz TDM slot, not a pipe.** One uplink packet per received downlink; the queue is
24 deep and **discards silently** when full; ARM and mode changes are sent 3× for loss
tolerance and therefore consume 3 slots each; joystick input is last-wins and dropped after
300 ms. Do not add anything chatty to the uplink without accounting for what it displaces.

**Parameter writes are acknowledged, not fire-and-forget.** `PARAM_SET` has no ACK, so the
batched writer confirms against the `PARAM_VALUE` echo with a *relative* epsilon (values
round-trip through float32) and retries. A half-applied restore that reports success is the
worst outcome; keep that property.

**Export before anything destructive.** A firmware `PARAM_DEFAULTS_VER` bump or a chip erase
discards all tuning. The documented flow is Export → flash → Import → power-cycle → spot-check.

**Momentary params are not restorable:** `ATUNE`, `MAG_ALIGN`, `SYS_PARAM_VER`. Writing them
*triggers* something. Keep them excluded from import.

**Docs vs code:** the READMEs claim LoRa is receive-only; **the firmware shipped bidirectional
TDM uplink** and `LoraView` renders the uplink trace. Code is ground truth — fix the prose.

---

## Vision support (planned — no code yet)

`srot-control-board/VISION_API.md` specifies vision-guided control on the board, where the
Jetson streams `LANDING_TARGET` (149) bearings and the board closes the loop at 500 Hz.

When that lands, Bondor should:

- **Add a vision status panel** reading the `VIS_OK` / `VIS_AGE` / `VIS_ERR` / `VIS_SIZE`
  `NAMED_VALUE_FLOAT`s, so an operator can see whether the board currently has a usable target
  and how stale it is. This is the single most useful diagnostic during a vision task.
- **Expose the `VIS_*` parameters** for live tuning, like the existing PID groups.
- **NOT relay `LANDING_TARGET` over LoRa.** At ~74 B and 20–30 Hz it is ~1.9 kB/s against a
  ~4 Hz slot budget — it would displace commands and achieve nothing, since the vision loop
  only makes sense on the direct link anyway.

No change is required until the firmware side exists.
