#pragma once
// =============================================================================
//  SROT LoRa telemetry frame — shared by the control board (TX) and the ground
//  station ESP32 (RX → MAVLink bridge). Compact fixed-size black-box downlink.
//  41 bytes; CRC16-CCITT over everything before `crc`.
//
//  FRAME SIZE CHANGED (39 → 41) when `aux_mv` was added. The receiver requires an exact
//  size match, so a mismatched pair does not corrupt — the link simply goes SILENT, which
//  looks identical to being out of range. Reflash BOTH boards together.
// =============================================================================

#include <stdint.h>
#include <stddef.h>

#define LORA_TELEM_MAGIC0 0xC5
#define LORA_TELEM_MAGIC1 0x53

// Radio config — MUST match on both the control board and the ground station.
// 250 kHz BW halves airtime vs the 125 kHz default → fewer half-duplex collisions
// and dropped frames on the bidirectional link (slightly less range; tunable).
#define LORA_FREQ_HZ 433000000L
#define LORA_BW      250000L
#define LORA_SF      7
#define LORA_CR      5

// flags bitmask
#define LT_FLAG_ARMED    (1 << 0)
#define LT_FLAG_LEAK     (1 << 1)
#define LT_FLAG_KILL     (1 << 2)
#define LT_FLAG_THR_LINK (1 << 3)

#pragma pack(push, 1)
typedef struct {
    uint8_t  magic0;      // 0xC5
    uint8_t  magic1;      // 0x53
    uint16_t seq;
    uint8_t  mode;        // FlightMode
    uint8_t  flags;       // LT_FLAG_*
    int16_t  roll_cd;     // centi-degrees
    int16_t  pitch_cd;
    int16_t  yaw_cd;
    int16_t  depth_cm;    // cm (signed; + = deeper)
    uint16_t batt_mv;     // mV — PM1, the ELECTRONICS/SBC pack (the board's own ADC)
    int16_t  curr_ca;     // cA (0.01 A)
    int16_t  rpm[8];      // per-thruster rpm
    int8_t   wtemp_c;     // water temp °C
    uint16_t ul_rx;       // diag: uplink MAVLink msgs the control board has handled over LoRa
    // mV — PM2, the THRUSTER pack, relayed from the 2nd board over ESP-NOW. 0 = no fresh
    // source. Added because the frame previously carried only PM1, so over LoRa the thruster
    // voltage was structurally unreachable: the ground station emits SYS_STATUS (which a GCS
    // maps to Battery 1) and never BATTERY_STATUS, so Battery 2 could never populate no
    // matter how healthy the ESP-NOW link was.
    uint16_t aux_mv;
    uint16_t crc;         // CRC16-CCITT over [0 .. offsetof(crc))
} LoraTelem;
#pragma pack(pop)

static inline uint16_t lora_telem_crc(const LoraTelem* t) {
    const uint8_t* p = (const uint8_t*)t;
    const size_t n = sizeof(LoraTelem) - sizeof(uint16_t);
    uint16_t crc = 0xFFFF;
    for (size_t i = 0; i < n; ++i) {
        crc ^= (uint16_t)p[i] << 8;
        for (int b = 0; b < 8; ++b) crc = (crc & 0x8000) ? (uint16_t)((crc << 1) ^ 0x1021) : (uint16_t)(crc << 1);
    }
    return crc;
}
