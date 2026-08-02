# Bench findings from `duburi_ws` — 2026-08-02

**From:** the companion side, with the SROT board on our dev box inside the AUV.
**Against:** `srot-ground-station` @ `7292d06` · board `d386dc8` · `SROT_FW_BEHAVIOUR_REV 4`.

**No Bondor code change is requested.** Two things below are yours to act on with the
existing UI, and one is a heads-up about what the vehicle is currently doing.

---

## 1. ⛔ The Bar30 is producing noise — the water test is blocked

On a still bench, disarmed, over 6 seconds:

```
press_abs      317 .. 874 mbar     (sea level ~1013)
water temp       6 .. 30 C
depth          +0.9 .. +6.8 m      (in air)
```

Per-sample garbage, not an offset — almost certainly the sensor connector. Full write-up and
the firmware ask: `srot-control-board/BENCH_FINDINGS_FROM_DUBURI_WS_2026-08-02.md`.

**Why this reaches Bondor:** your depth and temperature readouts are showing these numbers
right now, and the board reports the barometer **healthy**, so nothing in the UI marks them as
suspect. If an operator is watching Bondor and sees a plausible-looking depth, they have no
signal that it is fiction. **Treat any depth reading on this vehicle as untrustworthy until
the Bar30 is reseated and verified.**

If you ever want a UI cue for this: the tell is **variance**, not value — a still vehicle whose
pressure moves by hundreds of mbar between samples. A per-sample range check cannot see it,
which is exactly why the firmware's own plausibility band passes it.

## 2. `JS_GAIN_DEFAULT` still reads 0.5 — every pilot input is at half authority

Confirmed on the wire again this session: the streamed `GAIN` is **0.500**.

This is the third session it has been reported. It is runtime-only and boots from
`JS_GAIN_DEFAULT`, so **every `MANUAL_CONTROL` frame Bondor sends is being halved** — the
vehicle has never been flown manually at full stick authority. Setting it and confirming the
streamed value reads `1.0` is a two-minute job in Parameters, and it is worth doing before
anyone characterises manual handling.

## 3. The LoRa revert is still unflashed and unverified

Your `afff8cc` backs out the two unverified changes, and `7292d06` records a 75 s zero-flap
hardware confirmation. Reading those together: the **link** is confirmed, the **revert
binary** is what we understand to still be unproven on the ground-station board. If that is
stale and it has since been flashed and watched, ignore this — we are going on the commit
messages and would rather say so than assume.

## 4. What changed on the companion side

- **New tool: `ros2 run duburi_manager connect`** — opens the SROT serial link and prints
  everything the board sends (both batteries, depth-loop internals, per-ESC RPM/temp, mag
  accuracy, leak, kill, firmware heap/stacks). It is the companion-side equivalent of what
  Bondor gives you on the desktop, for people working over SSH with no GUI. It is
  **read-only** and never arms, sets a mode, or writes a parameter.
- **We now de-multiplex `BATTERY_STATUS` by instance id.** The board sends id 0 (PM1
  electronics, ~1.35 V — GPIO36 still unwired) and id 1 (PM2 thruster pack, ~14.74 V) at 2 Hz
  each. pymavlink caches one message per *msgid*, so our reader had been alternating between
  the two packs. **Worth checking Bondor is not doing the same thing** — if your battery
  widget ever flickers between a plausible pack voltage and something near zero, that is this
  bug, not a failing pack.
- **We refuse to arm while the depth controller is saturated.** Purely a companion-side
  backstop; it does not affect anything you send.

## 4b. Payload — you own `SERVO{n}_ROLE`, and we now read it

Each PCA9685 channel's role is a **Bondor-set firmware parameter**, and `duburi_ws` now reads
it and **refuses to drive anything that is not role 2 (SWITCH)**. Read live from the vehicle:
**channels 1-8 = SERVO (PWM), 9-16 = SWITCH.**

This makes the Parameters tab load-bearing for payload safety: the PWM channels drive the
on-board manipulator arm, and the only thing stopping a mission from actuating one is that
role value. **If you re-role a channel, our behaviour follows automatically** — we keep no
host-side copy, deliberately, because a stale copy's failure mode is moving the arm during a
payload drop.

Two things worth surfacing in the UI if you ever want them: which channels are switches, and a
warning when a channel's role changes while a mission is connected.

## 4c. Correction: PM1 was a parameter, not the wiring

Our earlier note said PM1's ~1.35 V was the unwired GPIO36. **It was a wrong pin number in the
SROT parameters.** The operator corrected it and PM1 now reads **13.95 V**; PM2 reads 14.62 V.
Both packs are sensible, and Bondor's battery readouts should now be meaningful for both.

## 5. Standing rules, unchanged

- **Do not relay `LANDING_TARGET` over LoRa** when the vision uplink lands.
- **`shared/lora_telem_proto.h` must stay byte-identical to the board's copy** — a size
  mismatch makes the link go silent, which looks exactly like being out of range.
- **You are not in the control path and should not become it.** Parameters, calibration,
  tuning, motor test, manual piloting are yours; mission control is the companion's.
