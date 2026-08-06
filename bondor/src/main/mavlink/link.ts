// A transport for raw MAVLink bytes. UDP or serial (USB) implement this; the
// MavlinkConnection owns the codec and just pipes bytes through whichever link.

export interface LinkStatus {
  connected: boolean
  detail?: string
  error?: string
  // `connected` means THE TRANSPORT IS OPEN, not that the vehicle is talking. On UDP
  // those are very different things: bind always succeeds, so a wrong port, a dead
  // bridge, or another process holding the port all present as a healthy socket that
  // never delivers a byte. `waiting` carries the reason we have heard nothing yet,
  // and is cleared on the first datagram.
  //
  // Kept SEPARATE from `connected` on purpose: MavlinkConnection starts the 1 Hz GCS
  // heartbeat off `connected`, and the board surfaces after GCS_FAILSAFE_MS of
  // silence. Withholding `connected` until data arrives would mean a Bondor pointed
  // at an explicit host stays mute and times the vehicle out.
  waiting?: string
  // We bound a port that ANOTHER PROCESS was already using. Distinct from `waiting`
  // because incoming data does not clear it -- the newcomer wins the stream, so data
  // arriving means we are taking someone else's, not that the problem resolved.
  conflict?: string
}

export interface LinkCallbacks {
  onData: (buf: Buffer) => void
  onStatus: (s: LinkStatus) => void
}

export interface MavlinkLink {
  write(buf: Buffer): void
  close(): void
}
