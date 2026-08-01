// =============================================================================
//  Bondor shared protocol — types/constants used by BOTH the main (IO) process
//  and the renderer (UI). Pure TypeScript (no node/DOM deps) so it bundles into
//  either side. Mirrors the SROT firmware contract (see JETSON_COMMS.md).
// =============================================================================

// Bondor identifies as a GCS.
export const GCS_SYSTEM_ID = 255
export const GCS_COMPONENT_ID = 190
// The SROT vehicle.
export const TARGET_SYSTEM_ID = 1
export const TARGET_COMPONENT_ID = 1

// Flight modes (HEARTBEAT.custom_mode / DO_SET_MODE param2).
export enum FlightMode {
  STABILIZE = 0,
  ACRO = 1,
  DEPTH_HOLD = 2,
  SURFACE = 9,
  MANUAL = 19,
  MOTOR_DETECT = 20,
  AUTOTUNE = 21,
  MOTOR_TUNE = 22,
  AUTO = 23
}

export const FLIGHT_MODE_LABELS: Record<number, string> = {
  [FlightMode.STABILIZE]: 'Stabilize',
  [FlightMode.ACRO]: 'Acro',
  [FlightMode.DEPTH_HOLD]: 'Depth Hold',
  [FlightMode.SURFACE]: 'Surface',
  [FlightMode.MANUAL]: 'Manual',
  [FlightMode.MOTOR_DETECT]: 'Motor Detect',
  [FlightMode.AUTOTUNE]: 'Autotune',
  [FlightMode.MOTOR_TUNE]: 'Motor Tune',
  [FlightMode.AUTO]: 'Auto'
}

// SROT_MOVE wire types (COMMAND_LONG 31000, param1).
export enum MoveType {
  FORWARD = 0,
  BACK = 1,
  STRAFE_LEFT = 2,
  STRAFE_RIGHT = 3,
  TURN = 4,
  DIVE = 5,
  STOP = 6,
  HOLD = 7,
  STYLE = 8,
  ARC = 9
}

// MAVLink command ids Bondor sends.
// SROT_FW_BEHAVIOUR_REV the rest of the stack assumes (firmware include/config.h,
// mirrored in duburi_ws srot_protocol.FW_BEHAVIOUR_REV_REQUIRED). Below this, MOVE_STOP
// COASTS: it applies zero braking thrust. duburi_ws deleted its host-side reverse-leg
// brake once the board started braking on its own, and refuses to arm under this number.
// Bondor cannot refuse anything -- it is the pilot's console, not an autonomy gate -- but
// it MUST show the operator what is in the hull before the vehicle goes in the water.
export const FW_BEHAVIOUR_REV_REQUIRED = 2

export const MAV_CMD = {
  COMPONENT_ARM_DISARM: 400,
  DO_SET_MODE: 176,
  DO_MOTOR_TEST: 209,
  PREFLIGHT_CALIBRATION: 241,
  DO_START_MAG_CAL: 42424,
  ACCELCAL_VEHICLE_POS: 42429,
  PREFLIGHT_STORAGE: 245,
  DO_SET_SERVO: 183,
  PREFLIGHT_REBOOT_SHUTDOWN: 246,
  REQUEST_MESSAGE: 512,
  USER_1: 31010,
  USER_2: 31011,
  USER_3: 31012,
  USER_4: 31013,
  USER_5: 31014,
  SROT_MOVE: 31000
} as const

// MAV_RESULT (COMMAND_ACK.result).
export enum MavResult {
  ACCEPTED = 0,
  TEMPORARILY_REJECTED = 1,
  DENIED = 2,
  UNSUPPORTED = 3,
  FAILED = 4,
  IN_PROGRESS = 5
}

// ---- IPC payloads -----------------------------------------------------------

export interface ConnectOptions {
  kind: 'udp' | 'serial' | 'mavlink2rest'
  // udp: bind locally and talk to the vehicle at host:port (or listen-only if host omitted)
  host?: string
  port?: number
  localPort?: number
  // serial (USB): COM/tty path + baud (the ESP32 UART0/USB MAVLink link, 115200)
  path?: string
  baud?: number
  // mavlink2rest: base URL of the BlueOS MAVLink2Rest websocket/REST endpoint
  url?: string
}

export interface SerialPortInfo {
  path: string
  manufacturer?: string
  friendlyName?: string
}

// A decoded MAVLink message, normalised for the renderer. Generic so new message
// types (params, inspector, LoRa) need no per-message plumbing.
export interface MavMessage {
  id: number
  name: string
  fields: Record<string, number | string | number[]>
  ts: number // epoch ms when received
}

export interface CommandLongArgs {
  command: number
  params?: number[] // param1..param7 (missing → 0)
  targetSystem?: number
  targetComponent?: number
}

export interface ManualControlArgs {
  x: number // forward  −1000..1000
  y: number // lateral  −1000..1000
  z: number // throttle/heave 0..1000 (500 neutral)
  r: number // yaw      −1000..1000
  buttons: number // bitmask
}

export interface ParamSetArgs {
  id: string
  value: number
  // MAV_PARAM_TYPE (9 = REAL32); firmware treats all as float
  type?: number
}

export interface ConnectionStatus {
  connected: boolean
  kind?: ConnectOptions['kind']
  detail?: string
  error?: string
}

// IPC channel names.
export const IPC = {
  CONNECT: 'bondor:connect',
  DISCONNECT: 'bondor:disconnect',
  SEND_COMMAND_LONG: 'bondor:sendCommandLong',
  SEND_MANUAL_CONTROL: 'bondor:sendManualControl',
  SEND_PARAM_SET: 'bondor:sendParamSet',
  REQUEST_PARAM_LIST: 'bondor:requestParamList',
  REQUEST_PARAM_READ: 'bondor:requestParamRead',
  REQUEST_PARAM_READ_INDEX: 'bondor:requestParamReadIndex',
  LIST_SERIAL_PORTS: 'bondor:listSerialPorts',
  GET_STATUS: 'bondor:getStatus',
  // events (main → renderer)
  EVT_MESSAGE: 'bondor:message',
  EVT_STATUS: 'bondor:status'
} as const
