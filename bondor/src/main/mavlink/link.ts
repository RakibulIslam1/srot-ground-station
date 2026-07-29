// A transport for raw MAVLink bytes. UDP or serial (USB) implement this; the
// MavlinkConnection owns the codec and just pipes bytes through whichever link.

export interface LinkStatus {
  connected: boolean
  detail?: string
  error?: string
}

export interface LinkCallbacks {
  onData: (buf: Buffer) => void
  onStatus: (s: LinkStatus) => void
}

export interface MavlinkLink {
  write(buf: Buffer): void
  close(): void
}
