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

## Payload channel FUNCTION (added 2026-08-06)

`SERVOn_ROLE` is the AUTHORITY (what the board drives); `SERVOn_FUNCTION` is the IDENTITY
(what duburi_ws calls the channel). Orthogonal — setting a Function never makes a channel
fireable, only `ROLE = 2` does.

The firmware deliberately does not read `servo_func`; it is NVS storage so the payload map
lives on the board and travels with the hull, instead of in a host-side table that goes
stale the moment someone re-wires a channel. Canonical numbers are `SROT_SERVO_FUNC_*` in
the firmware's `include/config.h`; our mirror is `SERVO_FUNCTIONS` in
`bondor/src/shared/protocol.ts`, and the `name` field is what makes it checkable.

**APPEND-ONLY.** Three repos mirror these by hand; inserting a value silently renames every
payload after it. duburi_ws's `test_srot_protocol_drift` referees all three copies including
ours — we have no firmware-aware gate of our own, so that test is the only thing that will
catch a Bondor-side drift.

## UDP: the port is exclusive in practice

MEASURED: two processes both binding 14550 with `SO_REUSEADDR` — which we do and pymavlink
does — both succeed, and **the newcomer takes the stream** (544 datagrams vs a trickle over
6 s). So connecting Bondor on top of a running duburi_ws does not fail; it silently starves
the companion of telemetry and command ACKs. `UdpLink` probes the port BEFORE binding and
raises a persistent `conflict` that incoming data does not clear — data arriving is not
evidence the problem is gone, it is evidence we took someone else's. Do not "fix" that by
clearing `conflict` on first message.

## Absence is data (fw rev 3+, and rev 5 makes it routine)

The board SUPPRESSES `WTEMP` and `SCALED_PRESSURE2` when the barometer is unhealthy or
stale, rather than publishing a value it cannot stand behind. Rendering a missing named
value as `0` re-creates on our screen exactly the bug that suppression was written to fix.

`DiveView` did this: `(named['WTEMP'] ?? 0).toFixed(1)` showed a confident **0.0 °C** for a
value the firmware had deliberately withheld. Rev 5's baro JITTER gate (peak-to-peak > 15
mbar over 8 samples marks the baro unhealthy) makes that suppression fire routinely rather
than theoretically. Every named-value tile must render `—` when the key is `undefined`;
`LoraView` already had the right pattern.

`BARO_P2P` (rev 5) is published UNGATED so it can explain WHY depth/water withdrew. It is
on the Dive screen with a warn threshold at 15 mbar.

## After flashing the board, the BlueOS bridge is dead but still LOOKS alive

A Bridget bridge holds an open fd on `/dev/ttyUSB0`. Flashing re-enumerates the USB device,
so the fd dies -- but the bridge is still listed, the serial port is still listed, and the
API answers exactly as it does when healthy. Nothing is visibly wrong and no data flows;
Bondor sits on "listening — no data from the vehicle yet".

Fix is to delete and re-POST the identical bridge. duburi_ws's `connect` /
`duburi_manager start` now print the exact two curl commands when this happens
(`connection_config.diagnose_bridge`).

## The companion failsafe does NOT count Bondor's heartbeat

`FS_GCS_SYSID`/`FS_GCS_COMPID` scope the board's companion-lost failsafe to ONE named
source — default **255/191**, which is duburi_ws. Bondor is **255/190**, so our 1 Hz GCS
heartbeat never feeds that timer however healthy the link looks. `matchesCompanion()`
treats 0 as a wildcard; anything else must match exactly.

The board latches "companion seen" only once that named source has appeared, so a
Bondor-only session on a freshly-booted board never trips it — **which is why this does
not reproduce on a bench where duburi_ws is never run.** Once duburi_ws has connected in
that power cycle, arming with only Bondor connected trips `Failsafe: surfacing (companion
lost)` after ~5 s: the board leaves MANUAL for SURFACE and drives the four VERTICAL
thrusters (5-8), which reads as "arming spun the motors on its own".

`DiveView` warns above the Arm button whenever the board's failsafe identity does not
match Bondor's own and the failsafe is enabled. Do not "fix" this by making Bondor send
191 — distinguishing the companion from the ground station is the entire point of those
params, and a dead Jetson with Bondor connected must still surface.

### BENCH MODE — standalone Bondor, including motor direction

Motor-direction work needs `DO_MOTOR_TEST`, which the firmware **hard-gates on armed**
("Arm motors before testing motors"). So standalone Bondor genuinely requires arming, and
arming requires the companion failsafe to be satisfiable by us.

The toggle on the Dive tab sets `FS_GCS_COMPID = 0`, the firmware's documented wildcard:
the failsafe still runs, it just accepts any component on the configured sysid. Everything
else — params, tuning, calibration, payload roles, export — needs no arming at all and
works regardless.

Three properties make this safe, and none should be "tidied away":
1. It is a **PARAM_SET only, never PREFLIGHT_STORAGE**, so a power cycle restores the
   flight value by itself. The safe state is the default and forgetting is harmless.
2. The banner says plainly that **pressing Save on the Parameters tab makes it permanent** —
   which matters because the take-turns runbook tells operators to Save for payload roles.
3. A restore button is offered whenever the wildcard is active, so the state is never
   invisible.

---

## ⛔ Repo ownership — who may commit where

This is a hard rule, not a convention. It exists because two agents work these repos in
parallel and a direct push into the other's repo destroys the review step that catches
cross-repo sign, units and contract errors — which is the failure mode this whole system
keeps producing.

**We own, and commit directly to:**

| Repo | What |
|---|---|
| `srot-control-board` | the board firmware, "Hengla" |
| `srot-ground-station` | the LoRa bridge **and Bondor** |
| `srot-esc-flasher` | the 4-way ESC tool |

**We NEVER commit to `duburi_ws`.** Not to `main`, not to `srot`, not "just a doc fix".
Every change we need on the companion side goes in as a **pull request** against their
branch, and they decide. That includes the mirrored constants in `fc/srot_protocol.py`
even though we are the source of truth for the values — being the authority on a number
is not the same as having write access to their tree.

**And the reverse.** If `duburi_ws` needs something changed in the firmware, in Bondor or
in the ESC flasher, they open a **pull request here**. They should not push directly, and
we should not ask them to.

Why it is worth the friction: a PR makes a cross-repo change *reviewable by the side that
owns the consequences*. Several defects in this system's history — the `MOVE_STOP` brake
double-applying, `SERVOn_FUNCTION` landing on both sides at once, a mirrored constant
drifting — were only catchable by the other side reading the change before it shipped.
Direct pushes remove exactly that check.

Practically: `gh pr create --repo <theirs> --base <their branch> --head <your fork>:<branch>`,
and say plainly in the PR what you could **not** verify from your side.
