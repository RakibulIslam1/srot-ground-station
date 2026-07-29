// =============================================================================
//  SROT parameter metadata — Bondor's friendly layer over the on-wire param names.
//  Gives each param a label, group, unit, range and (where relevant) an enum, so
//  the UI reads as SROT-native. Unknown params fall through as raw editable floats.
// =============================================================================

export interface ParamOption {
  value: number
  label: string
}

export interface ParamMeta {
  label: string
  group: string
  unit?: string
  min?: number
  max?: number
  step?: number
  decimals?: number
  options?: ParamOption[]
  help?: string
}

// Display order for groups (anything else lands in "Other").
export const GROUP_ORDER = [
  'Attitude PID',
  'Depth',
  'Model-based',
  'Movement (AUTO)',
  'Motor RPM loop',
  'Safety monitor',
  'Failsafe',
  'Pilot / Input',
  'Motors & Frame',
  'Joystick buttons',
  'Servos & Payload',
  'Lights & Buzzer',
  'Power',
  'GPIO pins',
  'Other'
]

const BOOL: ParamOption[] = [
  { value: 0, label: 'Off' },
  { value: 1, label: 'On' }
]

// Only functions the firmware ACTUALLY implements (mav_commands.cpp runButtonFunction).
// IDs follow ArduSub's AP_JSButton numbering. Do not add an entry without a matching
// case in the firmware — an option that silently does nothing is worse than no option.
// Deliberately absent: 1 (Shift) and 31 (Lights cycle) — both declared but unhandled.
const BTN_FUNCTIONS: ParamOption[] = [
  { value: 0, label: 'None' },
  { value: 2, label: 'Arm toggle' },
  { value: 3, label: 'Arm' },
  { value: 4, label: 'Disarm' },
  { value: 5, label: 'Mode: Manual' },
  { value: 6, label: 'Mode: Stabilize' },
  { value: 7, label: 'Mode: Depth Hold' },
  { value: 9, label: 'Mode: Surface' },
  { value: 10, label: 'Mode: Auto' },
  { value: 12, label: 'Mode: Acro' },
  { value: 32, label: 'Lights brighter' },
  { value: 33, label: 'Lights dimmer' },
  { value: 41, label: 'Gain toggle (low/high)' },
  { value: 42, label: 'Gain up' },
  { value: 43, label: 'Gain down' },
  { value: 51, label: 'Relay 1 on' },
  { value: 52, label: 'Relay 1 off' },
  { value: 53, label: 'Relay 1 toggle' },
  { value: 54, label: 'Relay 2 on' },
  { value: 55, label: 'Relay 2 off' },
  { value: 56, label: 'Relay 2 toggle' }
]

/** Human label for a button-function id — used by the Joystick tab's live grid. */
export function btnFunctionLabel(v: number): string {
  const f = BTN_FUNCTIONS.find((o) => o.value === v)
  return f ? f.label : `id ${v}`
}

const DIRECTION: ParamOption[] = [
  { value: 1, label: 'Normal (+)' },
  { value: -1, label: 'Reversed (−)' }
]

const pid = (label: string, group = 'Attitude PID'): ParamMeta => ({
  label,
  group,
  min: 0,
  max: 5,
  step: 0.001,
  decimals: 4
})

const META: Record<string, ParamMeta> = {
  // Attitude cascade
  ATC_ANG_RLL_P: pid('Roll angle P'),
  ATC_ANG_PIT_P: pid('Pitch angle P'),
  ATC_ANG_YAW_P: pid('Yaw angle P'),
  ATC_RAT_RLL_P: pid('Roll rate P'),
  ATC_RAT_RLL_I: pid('Roll rate I'),
  ATC_RAT_RLL_D: pid('Roll rate D'),
  ATC_RAT_RLL_FF: pid('Roll rate FF'),
  ATC_RAT_RLL_IMAX: pid('Roll rate IMAX'),
  ATC_RAT_PIT_P: pid('Pitch rate P'),
  ATC_RAT_PIT_I: pid('Pitch rate I'),
  ATC_RAT_PIT_D: pid('Pitch rate D'),
  ATC_RAT_PIT_FF: pid('Pitch rate FF'),
  ATC_RAT_PIT_IMAX: pid('Pitch rate IMAX'),
  ATC_RAT_YAW_P: pid('Yaw rate P'),
  ATC_RAT_YAW_I: pid('Yaw rate I'),
  ATC_RAT_YAW_D: pid('Yaw rate D'),
  ATC_RAT_YAW_FF: pid('Yaw rate FF'),
  ATC_RAT_YAW_IMAX: pid('Yaw rate IMAX'),

  // Depth
  DEPTH_P: { label: 'Depth P', group: 'Depth', decimals: 3 },
  DEPTH_I: { label: 'Depth I', group: 'Depth', decimals: 3 },
  DEPTH_D: { label: 'Depth D', group: 'Depth', decimals: 3 },

  // Model-based
  ATC_DRAG_RLL: { label: 'Roll drag FF', group: 'Model-based', decimals: 4 },
  ATC_DRAG_PIT: { label: 'Pitch drag FF', group: 'Model-based', decimals: 4 },
  ATC_DRAG_YAW: { label: 'Yaw drag FF', group: 'Model-based', decimals: 4 },
  XC_YAW2RLL: { label: 'Yaw→Roll coupling', group: 'Model-based', decimals: 4 },
  XC_YAW2PIT: { label: 'Yaw→Pitch coupling', group: 'Model-based', decimals: 4 },
  TRIM_EN: { label: 'CoB auto-trim', group: 'Model-based', options: BOOL },
  TRIM_LEAK: { label: 'Trim leak', group: 'Model-based', decimals: 4 },
  TRIM_MAX: { label: 'Trim max', group: 'Model-based', decimals: 3 },

  // Movement (AUTO)
  MOVE_CRUISE_MAX: { label: 'Cruise speed cap', group: 'Movement (AUTO)', min: 0, max: 1, step: 0.05, decimals: 2 },
  MOVE_ACCEL: { label: 'Accel ramp', group: 'Movement (AUTO)', unit: '/s', decimals: 2 },
  MOVE_BRAKE_GAIN: { label: 'Brake thrust gain', group: 'Movement (AUTO)', min: 0, max: 1, step: 0.05, decimals: 2 },
  MOVE_BRAKE_K: { label: 'Brake time / speed', group: 'Movement (AUTO)', unit: 's', decimals: 2 },
  MOVE_DEPTH_RATE: { label: 'Dive rate', group: 'Movement (AUTO)', unit: 'm/s', decimals: 2 },
  MOVE_YAW_RATE: { label: 'Default turn rate', group: 'Movement (AUTO)', unit: '°/s', decimals: 0 },

  // Motor RPM loop
  RPM_KP: { label: 'RPM P', group: 'Motor RPM loop', decimals: 3 },
  RPM_KI: { label: 'RPM I', group: 'Motor RPM loop', decimals: 3 },
  RPM_FF_A: { label: 'RPM feedforward', group: 'Motor RPM loop', decimals: 5 },
  RPM_IDLE: { label: 'Dynamic idle RPM', group: 'Motor RPM loop', unit: 'rpm', decimals: 0 },
  RPM_MAX: { label: 'RPM at full', group: 'Motor RPM loop', unit: 'rpm', decimals: 0 },
  RPM_FILT: { label: 'RPM filter α', group: 'Motor RPM loop', min: 0, max: 1, step: 0.05, decimals: 2 },
  RPM_SLEW: { label: 'RPM slew limit', group: 'Motor RPM loop', decimals: 3 },
  RPM_LOOP: {
    label: 'Control loop',
    group: 'Motor RPM loop',
    help: 'Closed needs bidir-DShot (Bluejay); open works with any ESC',
    options: [
      { value: 1, label: 'Closed (RPM PI)' },
      { value: 0, label: 'Open (feedforward)' }
    ]
  },
  DSHOT_BIDIR: {
    label: 'DShot mode',
    group: 'Motor RPM loop',
    help: 'Bidir = RPM telemetry + detection (needs a bidir ESC). Normal = any DShot ESC, no RPM. Set while disarmed.',
    options: [
      { value: 1, label: 'Bidirectional (RPM)' },
      { value: 0, label: 'Normal (any ESC)' }
    ]
  },
  MTUNE_EN: { label: 'Allow Motor Tune', group: 'Motor RPM loop', options: BOOL },

  // Safety monitor
  ST_ANGLE_MAX: { label: 'Tumble angle limit', group: 'Safety monitor', unit: '°', decimals: 0 },
  ST_RATE_MAX: { label: 'Spin-out rate limit', group: 'Safety monitor', unit: '°/s', decimals: 0 },
  ST_DEPTH_DELTA: { label: 'Depth runaway limit', group: 'Safety monitor', unit: 'm', decimals: 1 },
  ST_RPM_MAX: { label: 'Over-speed limit', group: 'Safety monitor', unit: 'rpm', decimals: 0 },

  // Failsafe
  FS_GCS_ENABLE: { label: 'GCS-loss failsafe', group: 'Failsafe', options: BOOL },
  FS_BAT_ENABLE: { label: 'Battery failsafe', group: 'Failsafe', options: BOOL },
  FS_BAT_VOLTAGE: { label: 'Battery failsafe V', group: 'Failsafe', unit: 'V', decimals: 1 },
  LEAK_EN: { label: 'Leak failsafe', group: 'Failsafe', options: BOOL },
  ARMING_CHECK: { label: 'Pre-arm checks', group: 'Failsafe', options: BOOL },

  // Pilot / input
  PILOT_SPEED: { label: 'Pilot speed', group: 'Pilot / Input', decimals: 2 },
  PILOT_YAW_RATE: { label: 'Pilot yaw rate', group: 'Pilot / Input', unit: '°/s', decimals: 0 },
  PILOT_EXPO: { label: 'Stick expo', group: 'Pilot / Input', min: 0, max: 1, step: 0.05, decimals: 2 },
  JS_GAIN_DEFAULT: { label: 'Joystick gain', group: 'Pilot / Input', min: 0, max: 1, step: 0.05, decimals: 2 },

  // Motors & frame
  FRAME_CONFIG: { label: 'Frame config', group: 'Motors & Frame', decimals: 0 },
  MOT_PWM_TYPE: { label: 'Motor PWM type', group: 'Motors & Frame', decimals: 0 },
  MOT_PWM_MIN: { label: 'Motor PWM min', group: 'Motors & Frame', unit: 'µs', decimals: 0 },
  MOT_PWM_MAX: { label: 'Motor PWM max', group: 'Motors & Frame', unit: 'µs', decimals: 0 },
  MOT_THST_EXPO: { label: 'Thrust expo', group: 'Motors & Frame', min: 0, max: 1, step: 0.05, decimals: 2 },
  MOT_SPIN_MIN: { label: 'Spin min', group: 'Motors & Frame', min: 0, max: 1, step: 0.01, decimals: 2 },
  MOT_SPIN_ARM: { label: 'Spin at arm', group: 'Motors & Frame', min: 0, max: 1, step: 0.01, decimals: 2 },

  // Lights & buzzer
  BUZZ_MASK: { label: 'Buzzer event mask', group: 'Lights & Buzzer', decimals: 0 },
  BUZZ_DUTY: { label: 'Buzzer volume', group: 'Lights & Buzzer', unit: '%', decimals: 0 },
  THR_BEEP_EN: { label: 'Thruster beeps', group: 'Lights & Buzzer', options: BOOL },
  RGB_BRIGHTNESS: { label: 'LED brightness', group: 'Lights & Buzzer', min: 0, max: 255, decimals: 0 },
  LIGHTS_STEP: { label: 'Lights step', group: 'Lights & Buzzer', min: 0, max: 1, step: 0.05, decimals: 2 },

  // Power
  PM1_SRC: { label: 'PM1 source', group: 'Power', decimals: 0 },
  PM2_SRC: { label: 'PM2 source', group: 'Power', decimals: 0 },
  PM1_VMULT: { label: 'PM1 volt multiplier', group: 'Power', decimals: 4 },
  PM2_VMULT: { label: 'PM2 volt multiplier', group: 'Power', decimals: 4 },

  // Misc
  ESPNOW_EN: { label: 'ESP-NOW link', group: 'Other', options: BOOL },
  ATUNE: { label: 'Start Autotune', group: 'Other', options: BOOL }
}

// Per-thruster direction (MOT_1..8_DIRECTION).
for (let i = 1; i <= 8; i++) {
  META[`MOT_${i}_DIRECTION`] = {
    label: `Thruster ${i} direction`,
    group: 'Motors & Frame',
    options: DIRECTION
  }
}
// Joystick buttons (BTN0..15_FUNCTION).
for (let i = 0; i <= 15; i++) {
  META[`BTN${i}_FUNCTION`] = {
    label: `Button ${i}`,
    group: 'Joystick buttons',
    options: BTN_FUNCTIONS
  }
}

export function getParamMeta(name: string): ParamMeta {
  if (META[name]) return META[name]
  if (/^PIN_/.test(name)) return { label: name, group: 'GPIO pins', decimals: 0, help: 'Reboot to apply.' }
  if (/^SERVO\d+_/.test(name)) return { label: name, group: 'Servos & Payload', decimals: 0 }
  return { label: name, group: 'Other', decimals: 3 }
}
