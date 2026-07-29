// =============================================================================
//  SROT Ground Station (ESP32-C3 Super Mini + SX127x) — bidirectional LoRa bridge.
//
//  Downlink: receives the compact SROT telemetry frame (shared/lora_telem_proto.h)
//            and re-emits it as MAVLink over USB → Bondor connects as a serial link.
//            Bondor's heartbeats are derived ONLY from real frames (no fake filler),
//            so mode/armed never flicker.
//  Uplink:   TDM slave (ELRS-style). The control board is the master and beacons a
//            telemetry frame on a fixed cadence; this station transmits EXACTLY ONE
//            uplink packet immediately after receiving each downlink — so the two
//            radios never transmit at the same time (no half-duplex collisions).
//            Each slot carries (priority): a queued command → fresh joystick → a GCS
//            keep-alive heartbeat (so the vehicle's GCS link never drops). Uplink is
//            sent only while Bondor's USB is active, so failsafe still works unplugged.
//
//  Build:  pio run -e groundstation-esp32 -t upload
//  NOTE:   the control board MUST be reflashed too — both radios share the LoRa
//          config in shared/lora_telem_proto.h and must match.
// =============================================================================

#include <Arduino.h>
#include <SPI.h>
#include <LoRa.h>
#include <ardupilotmega/mavlink.h>
#include "lora_telem_proto.h"

// LoRa wiring — ESP32-C3 Super Mini.
static const int PIN_SCK = 4, PIN_MISO = 5, PIN_MOSI = 6;
static const int PIN_SS = 7, PIN_RST = 3, PIN_DIO0 = 10;
static const int PIN_LED = 8;   // active-LOW on the C3 Super Mini

// This bridge presents as the SROT vehicle (Bondor shows it as the vehicle).
static const uint8_t SYS_ID = 1, COMP_ID = 1;
// The GCS heartbeat we synthesise toward the control board (a companion/GCS id).
static const uint8_t GCS_SYS_ID = 255, GCS_COMP_ID = 190;

static uint32_t s_rx_count = 0;
static uint32_t s_led_off_at = 0;
static uint32_t s_last_usb_ms = 0;  // last MAVLink frame from Bondor over USB
static uint32_t s_usb_msgs = 0;     // diag: MAVLink msgs parsed from Bondor's USB
static uint32_t s_ul_tx = 0;        // diag: uplink packets transmitted over LoRa
static uint32_t s_last_frame_ms = 0; // last telem frame bridged to Bondor
static uint32_t s_dl_hb_last = 0;    // cached-value heartbeat keep-alive pacing (to Bondor)
// Cached last real vehicle state (never send fabricated 0/false to Bondor).
static uint8_t s_last_mode = 0;
static bool    s_last_armed = false;
// Pending uplink queue (drained one-per-TDM-slot). A queue (not last-wins) so bursts —
// e.g. Bondor re-requesting many missing params over LoRa — all get forwarded.
static const int UL_Q = 24;
static mavlink_message_t s_ulq[UL_Q];
static int      s_ulq_head = 0, s_ulq_tail = 0;
static mavlink_message_t s_mc;          // latest MANUAL_CONTROL
static uint32_t s_mcTs = 0;
static bool     s_mcValid = false;

static bool ulqEmpty() { return s_ulq_head == s_ulq_tail; }
static bool ulqFull()  { return (s_ulq_head + 1) % UL_Q == s_ulq_tail; }
static void ulqPush(const mavlink_message_t& m) {
  if (!ulqFull()) { s_ulq[s_ulq_head] = m; s_ulq_head = (s_ulq_head + 1) % UL_Q; }
}
static bool ulqPop(mavlink_message_t& m) {
  if (ulqEmpty()) return false;
  m = s_ulq[s_ulq_tail]; s_ulq_tail = (s_ulq_tail + 1) % UL_Q; return true;
}

static void ledPulse(uint32_t ms) {
  digitalWrite(PIN_LED, LOW);      // active-low → on
  s_led_off_at = millis() + ms;
}

// ---- LoRa TX helper --------------------------------------------------------
static void loraSend(const uint8_t* buf, uint16_t len) {
  LoRa.beginPacket();
  LoRa.write(buf, len);
  LoRa.endPacket();      // blocks until TX done
  LoRa.receive();        // back to RX (the default state)
}
static void loraSendMsg(const mavlink_message_t& msg, int reps) {
  uint8_t buf[MAVLINK_MAX_PACKET_LEN];
  uint16_t len = mavlink_msg_to_send_buffer(buf, &msg);
  for (int i = 0; i < reps; ++i) {
    loraSend(buf, len);
    s_ul_tx++;
    if (i < reps - 1) delay(4);
  }
}

// ---- Uplink queueing: USB MAVLink → pending (sent later, one per TDM slot) ---
static void queueUplink(const mavlink_message_t& msg) {
  // Heartbeat is synthesised in-slot (steady GCS keep-alive) — don't relay Bondor's.
  if (msg.msgid == MAVLINK_MSG_ID_HEARTBEAT) return;

  // Visible proof a command/joystick arrived from Bondor over USB: flash the LED.
  // (Heartbeats returned above, so this only lights on real user input.)
  ledPulse(120);

  if (msg.msgid == MAVLINK_MSG_ID_MANUAL_CONTROL) {
    s_mc = msg;
    s_mcTs = millis();
    s_mcValid = true;
    return;
  }
  // Command/param-request: enqueue (idempotent commands 3× for loss tolerance; SROT_MOVE
  // and everything else once — SROT_MOVE increments a sequence per receipt).
  int reps = 1;
  if (msg.msgid == MAVLINK_MSG_ID_COMMAND_LONG) {
    uint16_t cmd = mavlink_msg_command_long_get_command(&msg);
    if (cmd == MAV_CMD_COMPONENT_ARM_DISARM || cmd == MAV_CMD_DO_SET_MODE) reps = 3;
  } else if (msg.msgid == MAVLINK_MSG_ID_SET_MODE) {
    reps = 3;
  }
  for (int i = 0; i < reps; ++i) ulqPush(msg);
}

static void pollUsbUplink() {
  mavlink_message_t msg;
  mavlink_status_t st;
  while (Serial.available()) {
    uint8_t c = (uint8_t)Serial.read();
    if (mavlink_parse_char(MAVLINK_COMM_1, c, &msg, &st)) {
      s_last_usb_ms = millis();
      s_usb_msgs++;
      queueUplink(msg);
    }
  }
}

// One uplink packet per received downlink (the master's RX slot). Priority: queued
// command → fresh joystick → GCS keep-alive heartbeat (keeps the vehicle's GCS up).
static void sendUplinkSlot() {
  mavlink_message_t q;
  if (ulqPop(q)) {
    loraSendMsg(q, 1);
    return;
  }
  if (s_mcValid && millis() - s_mcTs < 300) {
    loraSendMsg(s_mc, 1);
    return;
  }
  mavlink_message_t m;
  mavlink_msg_heartbeat_pack(GCS_SYS_ID, GCS_COMP_ID, &m, MAV_TYPE_GCS, MAV_AUTOPILOT_INVALID,
                             0, 0, MAV_STATE_ACTIVE);
  loraSendMsg(m, 1);
}

// ---- Downlink: telemetry frame → MAVLink over USB (real values only) -------
static void txMsg(mavlink_message_t& m) {
  uint8_t buf[MAVLINK_MAX_PACKET_LEN];
  uint16_t len = mavlink_msg_to_send_buffer(buf, &m);
  Serial.write(buf, len);
}
static void named(const char* name, float v, uint32_t t) {
  mavlink_message_t m;
  mavlink_msg_named_value_float_pack(SYS_ID, COMP_ID, &m, t, name, v);
  txMsg(m);
}

static void bridgeFrame(const LoraTelem& t) {
  const uint32_t now = millis();
  const float CD2RAD = 1.0f / 5729.578f;
  mavlink_message_t m;

  s_last_mode = t.mode;
  s_last_armed = (t.flags & LT_FLAG_ARMED) != 0;
  s_last_frame_ms = now;

  // HEARTBEAT with the REAL mode/armed (4 Hz, from frames) — the only heartbeat we
  // send to Bondor, so mode/armed can't flicker.
  uint8_t base = MAV_MODE_FLAG_CUSTOM_MODE_ENABLED | (s_last_armed ? MAV_MODE_FLAG_SAFETY_ARMED : 0);
  mavlink_msg_heartbeat_pack(SYS_ID, COMP_ID, &m, MAV_TYPE_SUBMARINE, MAV_AUTOPILOT_GENERIC,
                             base, (uint32_t)s_last_mode, s_last_armed ? MAV_STATE_ACTIVE : MAV_STATE_STANDBY);
  txMsg(m);

  mavlink_msg_attitude_pack(SYS_ID, COMP_ID, &m, now,
                            t.roll_cd * CD2RAD, t.pitch_cd * CD2RAD, t.yaw_cd * CD2RAD, 0, 0, 0);
  txMsg(m);
  mavlink_msg_vfr_hud_pack(SYS_ID, COMP_ID, &m, 0, 0, (int16_t)(t.yaw_cd / 100), 0, -(t.depth_cm / 100.0f), 0);
  txMsg(m);
  mavlink_msg_sys_status_pack(SYS_ID, COMP_ID, &m, 0, 0, 0, 0, t.batt_mv, t.curr_ca, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  txMsg(m);
  for (int g = 0; g < 2; ++g) {
    int32_t rpm[4];
    float volt[4] = {0}, curr[4] = {0};
    for (int i = 0; i < 4; ++i) rpm[i] = t.rpm[g * 4 + i];
    mavlink_msg_esc_status_pack(SYS_ID, COMP_ID, &m, g * 4, now, rpm, volt, curr);
    txMsg(m);
  }
  named("LEAK", (t.flags & LT_FLAG_LEAK) ? 1.0f : 0.0f, now);
  named("KILL", (t.flags & LT_FLAG_KILL) ? 1.0f : 0.0f, now);
  named("WTEMP", (float)t.wtemp_c, now);
  named("LORA_RSSI", (float)LoRa.packetRssi(), now);
  named("LORA_RX", (float)s_rx_count, now);
  // Uplink diagnostics (localise where a command dies): USB_RX = cmds the C3 got from
  // Bondor; UP_TX = uplink packets the C3 sent; UL_RX = uplink msgs the board handled.
  named("USB_RX", (float)s_usb_msgs, now);
  named("UP_TX", (float)s_ul_tx, now);
  named("UL_RX", (float)t.ul_rx, now);
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_LED, OUTPUT);
  digitalWrite(PIN_LED, HIGH);   // off (active-low)
  SPI.begin(PIN_SCK, PIN_MISO, PIN_MOSI, PIN_SS);
  LoRa.setSPI(SPI);
  LoRa.setPins(PIN_SS, PIN_RST, PIN_DIO0);
  LoRa.begin(LORA_FREQ_HZ);
  LoRa.setSignalBandwidth(LORA_BW);   // must match the control board
  LoRa.setSpreadingFactor(LORA_SF);
  LoRa.setCodingRate4(LORA_CR);
  LoRa.receive();
}

void loop() {
  const uint32_t now = millis();

  // Drain USB → update pending uplink (no TX here; TX happens in the slot below).
  pollUsbUplink();

  // Downlink from the control board. Classify by first byte:
  //   0xC5 = compact telemetry frame → bridge to MAVLink + reply in the TDM slot.
  //   0xFD = raw MAVLink (PARAM_VALUE/ACK/STATUSTEXT relayed over LoRa) → straight to USB.
  int sz = LoRa.parsePacket();
  if (sz > 0) {
    uint8_t pkt[256];
    int n = 0;
    while (n < sz && n < (int)sizeof(pkt) && LoRa.available()) pkt[n++] = (uint8_t)LoRa.read();
    if (n > 0 && pkt[0] == LORA_TELEM_MAGIC0 && n == (int)sizeof(LoraTelem)) {
      LoraTelem t;
      memcpy(&t, pkt, sizeof(t));
      if (t.magic1 == LORA_TELEM_MAGIC1 && lora_telem_crc(&t) == t.crc) {
        s_rx_count++;
        // Reply FIRST (prompt, lands in the master's RX window) — only while Bondor's USB
        // is live, so the vehicle still detects GCS-loss if Bondor unplugs. Then bridge.
        if (now - s_last_usb_ms < 2000) sendUplinkSlot();
        bridgeFrame(t);
      }
    } else if (n > 0 && pkt[0] == 0xFD) {
      Serial.write(pkt, n);   // raw MAVLink downlink → Bondor parses it natively
    }
  }

  // Cached-value heartbeat keep-alive to Bondor (~2 Hz) when telem frames stall, so the
  // link indicator stays steady with the LAST REAL mode/armed (no flicker, no false state).
  if (now - s_last_frame_ms > 1000 && now - s_dl_hb_last >= 500) {
    s_dl_hb_last = now;
    mavlink_message_t m;
    uint8_t base = MAV_MODE_FLAG_CUSTOM_MODE_ENABLED | (s_last_armed ? MAV_MODE_FLAG_SAFETY_ARMED : 0);
    mavlink_msg_heartbeat_pack(SYS_ID, COMP_ID, &m, MAV_TYPE_SUBMARINE, MAV_AUTOPILOT_GENERIC,
                               base, (uint32_t)s_last_mode, s_last_armed ? MAV_STATE_ACTIVE : MAV_STATE_STANDBY);
    txMsg(m);
  }

  if (s_led_off_at && now >= s_led_off_at) {
    digitalWrite(PIN_LED, HIGH);
    s_led_off_at = 0;
  }
}
