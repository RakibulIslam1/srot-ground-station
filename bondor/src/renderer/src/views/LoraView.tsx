import { Box, Alert, Card, CardContent, Chip, Stack, Typography } from '@mui/material'
import { useTelemetry } from '../store/telemetry'

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }): JSX.Element {
  return (
    <Card sx={{ flex: 1, minWidth: 130 }}>
      <CardContent>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          {value}
          {unit && (
            <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 0.5 }}>
              {unit}
            </Typography>
          )}
        </Typography>
      </CardContent>
    </Card>
  )
}

export default function LoraView(): JSX.Element {
  const named = useTelemetry((s) => s.named)
  const rssi = named['LORA_RSSI']
  const rxCount = named['LORA_RX']
  const active = rssi !== undefined

  return (
    <Stack spacing={2} sx={{ maxWidth: 760 }}>
      <Alert severity="info" variant="outlined">
        LoRa telemetry is a <b>black-box downlink</b>. The ground-station ESP32 (env{' '}
        <code>groundstation-esp32</code>) receives the compact SROT frame and re-emits it as MAVLink
        over USB — so you just <b>Connect → USB</b> to the ground-station's port and every page
        (Fly, Analyze, Inspector) populates normally. This is receive-only; command uplink still goes
        over UDP/USB to the vehicle.
      </Alert>

      <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
        <Stat label="Link" value={active ? 'Receiving' : '—'} />
        <Stat label="RSSI" value={rssi !== undefined ? rssi.toFixed(0) : '—'} unit="dBm" />
        <Stat label="Frames" value={rxCount !== undefined ? rxCount.toFixed(0) : '—'} />
      </Stack>

      <Alert severity="info" variant="outlined">
        <b>Uplink diagnostics</b> — click <b>Arm</b> a few times and watch these count up. They trace
        a command's path: <code>USB&nbsp;RX</code> = the ground station received it from Bondor →
        <code>UP&nbsp;TX</code> = it forwarded it over LoRa → <code>UL&nbsp;RX</code> = the control
        board handled it. The first one that stays at 0 is where the link breaks.
      </Alert>
      <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
        <Stat label="USB RX (GS ← Bondor)" value={named['USB_RX'] !== undefined ? named['USB_RX'].toFixed(0) : '—'} />
        <Stat label="UP TX (GS → LoRa)" value={named['UP_TX'] !== undefined ? named['UP_TX'].toFixed(0) : '—'} />
        <Stat label="UL RX (board handled)" value={named['UL_RX'] !== undefined ? named['UL_RX'].toFixed(0) : '—'} />
      </Stack>

      <Card>
        <CardContent>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Typography variant="subtitle2" color="text.secondary">
              Status
            </Typography>
            <Chip
              size="small"
              color={active ? 'success' : 'default'}
              variant={active ? 'filled' : 'outlined'}
              label={active ? 'Ground station streaming' : 'No LoRa telemetry seen'}
            />
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            The control board transmits attitude, depth, battery, per-thruster RPM, and leak/kill/mode
            flags at ~4 Hz. Flash the ground receiver with{' '}
            <code>pio run -e groundstation-esp32 -t upload</code>.
          </Typography>
        </CardContent>
      </Card>
    </Stack>
  )
}
