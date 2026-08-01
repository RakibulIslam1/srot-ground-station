# Handoff to the Bondor agent — 2026-08-01

**From:** the `duburi_ws` (Mongla) companion side.
**Against:** `srot-ground-station` @ `83b96fe` · board `e2b43fe` · **`SROT_FW_BEHAVIOUR_REV 2`**.

**Nothing here asks you to change code.** Bondor is not in the control path and that is
deliberate. This is what changed around you, and the two places it touches your UI.

---

## 1. Bondor is now on the critical path for one thing: the reflash

The board's `MOVE_STOP` used to coast, so the companion carried a host-side reverse-leg brake.
Firmware rev 2 brakes on-board, and **we deleted our brake.** The failure is bidirectional:

| | firmware rev 1 | firmware rev 2 |
|---|---|---|
| **old companion** | correct | hull braked **twice** |
| **current companion** | `stop` **coasts** — 20 kg, no deceleration, nothing in any log | correct |

So a board below rev 2 must be reflashed — and **that reflash goes through Bondor**, because
the partition table changed (NVS 20 KB → 128 KB). It needs `pio run -t erase` *then* upload,
which **wipes the tune and the `CAL_*` block**.

**The order matters, and Bondor owns step 1:**

1. **Bondor → Parameters → Export** ← the only copy of `CAL_*` that will survive
2. `pio run -t erase && pio run -t upload`
3. **Bondor → Parameters → Import**
4. Re-write `JS_GAIN_DEFAULT = 1.0` and confirm the streamed `GAIN` reads `1.0`

**On (4):** `GAIN` reads `0.500` on the board today. The write never persisted through the
full-NVS era (fw R14), so `MANUAL_CONTROL` — i.e. **everything a pilot does in Bondor** — has
been running at half authority. It is worth confirming on your side after any reflash.

Your `83b96fe` already shows the behaviour revision on the pre-dive screen. That is exactly the
right place for it: **rev < 2 means `stop` does not stop.**

---

## 2. What the companion now does that you may see on the link

- **We pin stream rates** (`SET_MESSAGE_INTERVAL`, 511). `ATTITUDE` goes ~11 → ~50 Hz while the
  companion is connected. The board clamps to a 20 ms floor and refuses a HEARTBEAT disable, so
  it cannot starve your `PARAM_VALUE` traffic — but the link is busier than it was.
- **We read `AUTOPILOT_VERSION`** (msgid 148) at preflight and again at arm.
- **We have adopted component id 191** (`MAV_COMP_ID_ONBOARD_COMPUTER`) instead of sharing
  `255/190` with every GCS — **shipped**, `duburi_ws` `41318e7`. **This is the change that
  affects you**, and it is in your favour: your LoRa bridge synthesises its filler heartbeat as
  `255/190`, identical to what the companion used to send, so the board cannot tell you apart.
  That means **a dead Jetson with Bondor connected holds the GCS failsafe open** and the
  vehicle station-keeps when it should surface. With the companion on 191 the firmware can now
  key `FS_GCS_SYSID`/`FS_GCS_COMPID` on it specifically — that work is requested in
  `srot-control-board/TASKS_FROM_DUBURI_WS.md` §2.

  **No Bondor code change is needed**, and nothing breaks in the meantime: the board counts any
  heartbeat whose id is not its own (`mav_commands.cpp:687`), so 191 feeds the failsafe exactly
  as 190 did. **But if anything of yours asserts the companion is `190`, it has stopped being
  true** — and once `FS_GCS_*` lands, your bridge's `255/190` will no longer satisfy a failsafe
  that is watching the Jetson. That is the point of the change, not a regression.

---

## 3. Standing rules, unchanged

- **Do not relay `LANDING_TARGET` over LoRa** when the vision uplink lands. At ~4 Hz TDM with a
  24-deep queue it would displace commands. Vision is a USB-link concern; Bondor's job there is
  *status* (`VIS_*` named floats + the lock state), not transport.
- **`shared/lora_telem_proto.h` must stay byte-identical to the board's copy.** The frame grew
  39 → 41 bytes for `aux_mv`; the receiver requires an exact size match, so a mismatched pair
  does not corrupt — **the link just goes silent**, which looks exactly like being out of range.
  Reflash both boards together.
- **You are not in the control path and should not become it.** Parameters, calibration, tuning,
  motor test, manual piloting — those are yours. Mission control is the companion's.

---

## 4. What we would find useful, if you want work

Not requests, just the two things that would help most from here:

1. **Make the pre-dive behaviour-rev indicator impossible to miss** when it is `< 2` or absent —
   it is the one number that decides whether the hull decelerates, and `0` means "older than
   2026-08-01", not "unknown".
2. **A parameter-export reminder before a flash** — the `CAL_*` loss is silent and
   unrecoverable, and it is the kind of thing that gets skipped at 2am before a competition.
