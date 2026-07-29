import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  FormControlLabel,
  MenuItem,
  Slider,
  Stack,
  Switch,
  TextField,
  Typography
} from '@mui/material'
import { useTelemetry, useThrottledTelemetry } from '../store/telemetry'
import { useGamepad } from '../joystick/useGamepad'
import AttitudeIndicator from '../components/AttitudeIndicator'
import HeadingIndicator from '../components/HeadingIndicator'
import StatusConsole from '../components/StatusConsole'
import { FLIGHT_MODE_LABELS, FlightMode } from '../../../shared/protocol'

const DEG = 180 / Math.PI

function Tile({ label, value, unit, sub, warn }: { label: string; value: string; unit?: string; sub?: string; warn?: boolean }): JSX.Element {
  return (
    <Card sx={{ flex: 1, minWidth: 96 }}>
      <CardContent sx={{ py: 1.2, '&:last-child': { pb: 1.2 } }}>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2, color: warn ? 'error.main' : 'text.primary' }}>
          {value}
          {unit && (
            <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
              {unit}
            </Typography>
          )}
        </Typography>
        {sub && (
          <Typography variant="caption" color="text.secondary">
            {sub}
          </Typography>
        )}
      </CardContent>
    </Card>
  )
}

// Live-param slider that reads the current value and writes on commit.
function PilotSlider({ name, label, min, max, step, unit }: { name: string; label: string; min: number; max: number; step: number; unit?: string }): JSX.Element {
  const value = useTelemetry((s) => s.paramValues[name])
  const setParam = useTelemetry((s) => s.setParam)
  const disabled = value === undefined
  return (
    <Box sx={{ minWidth: 150, flex: 1 }}>
      <Stack direction="row" justifyContent="space-between">
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="caption">
          {disabled ? '—' : value.toFixed(2)}
          {unit}
        </Typography>
      </Stack>
      <Slider
        size="small"
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        value={disabled ? min : value}
        onChangeCommitted={(_e, v) => setParam(name, v as number)}
      />
    </Box>
  )
}

const QUICK_MODES = [FlightMode.MANUAL, FlightMode.STABILIZE, FlightMode.DEPTH_HOLD]
const SELECTABLE_MODES = [
  FlightMode.MANUAL,
  FlightMode.STABILIZE,
  FlightMode.ACRO,
  FlightMode.DEPTH_HOLD,
  FlightMode.AUTO,
  FlightMode.SURFACE
]

export default function DiveView(): JSX.Element {
  const t = useThrottledTelemetry(15) // hot snapshot @15 Hz (decoupled from msg rate)
  const arm = useTelemetry((s) => s.arm)
  const setMode = useTelemetry((s) => s.setMode)
  const reboot = useTelemetry((s) => s.reboot)
  const gp = useGamepad()

  const heading = ((t.yaw * DEG) + 360) % 360
  const connected = t.status.connected

  return (
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '1fr 340px' }, height: '100%', minHeight: 0 }}>
      {/* Left: instruments + controls. Scrolls INTERNALLY if it doesn't fit, so the
          command panel is never clipped; the page/tab itself still doesn't scroll. */}
      <Stack spacing={2} sx={{ minWidth: 0, minHeight: 0, overflowY: 'auto', pr: 0.5 }}>
        <Card>
          <CardContent>
            <Stack direction="row" spacing={3} alignItems="center" flexWrap="wrap" useFlexGap>
              <AttitudeIndicator roll={t.roll} pitch={t.pitch} size={190} />
              <HeadingIndicator heading={heading} size={190} />
              <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ flex: 1 }}>
                <Tile label="Depth" value={t.depth.toFixed(2)} unit="m" />
                <Tile label="Battery 1" value={t.battVolt.toFixed(1)} unit="V" sub={`${t.battCurr.toFixed(1)} A`} />
                <Tile label="Battery 2" value={t.battVolt2 > 0 ? t.battVolt2.toFixed(1) : '—'} unit="V" />
                <Tile label="Water" value={(t.named['WTEMP'] ?? 0).toFixed(1)} unit="°C" />
                <Tile label="Leak" value={t.named['LEAK'] ? 'LEAK' : 'dry'} warn={!!t.named['LEAK']} />
              </Stack>
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
              <Button variant="contained" color={t.armed ? 'error' : 'success'} disabled={!connected} onClick={() => arm(!t.armed)}>
                {t.armed ? 'Disarm' : 'Arm'}
              </Button>
              {QUICK_MODES.map((m) => (
                <Button
                  key={m}
                  size="small"
                  variant={t.mode === m ? 'contained' : 'outlined'}
                  disabled={!connected}
                  onClick={() => setMode(m)}
                >
                  {FLIGHT_MODE_LABELS[m]}
                </Button>
              ))}
              <TextField
                select
                size="small"
                label="Mode"
                value={SELECTABLE_MODES.includes(t.mode) ? t.mode : ''}
                disabled={!connected}
                onChange={(e) => setMode(Number(e.target.value) as FlightMode)}
                sx={{ minWidth: 140 }}
              >
                {SELECTABLE_MODES.map((m) => (
                  <MenuItem key={m} value={m}>
                    {FLIGHT_MODE_LABELS[m]}
                  </MenuItem>
                ))}
              </TextField>
              <Box sx={{ flexGrow: 1 }} />
              <Button variant="text" color="inherit" size="small" disabled={!connected} onClick={reboot}>
                Reboot
              </Button>
            </Stack>
          </CardContent>
        </Card>

        {/* Kept ABOVE the joystick/pilot cards: this column scrolls, and as the last
            card the RPM readout sat below the fold on a short window — you had to know
            to scroll for the one number that tells you the thrusters are actually
            running. Zeros are dimmed so a live value stands out at a glance. */}
        <Card>
          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Thruster RPM
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 1 }}>
              {t.rpm.map((r, i) => (
                <Box key={i} sx={{ textAlign: 'center' }}>
                  <Typography variant="caption" color="text.secondary">
                    M{i + 1}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 600,
                      fontVariantNumeric: 'tabular-nums',
                      color: r === 0 ? 'text.disabled' : r < 0 ? 'warning.main' : 'text.primary'
                    }}
                  >
                    {r}
                  </Typography>
                </Box>
              ))}
            </Box>
          </CardContent>
        </Card>

        <Card>
          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
              <Typography variant="subtitle2" color="text.secondary">
                Joystick
              </Typography>
              <Chip
                size="small"
                color={gp.connected ? 'success' : 'default'}
                variant={gp.connected ? 'filled' : 'outlined'}
                label={gp.connected ? gp.name.slice(0, 24) || 'Connected' : 'No gamepad'}
              />
              <FormControlLabel
                control={<Switch checked={gp.enabled} disabled={!gp.connected || !connected} onChange={(e) => gp.setEnabled(e.target.checked)} />}
                label="Control"
              />
              <Box sx={{ flexGrow: 1 }} />
              <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                x{gp.last.x} y{gp.last.y} z{gp.last.z} r{gp.last.r}
              </Typography>
            </Stack>
            <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
              <PilotSlider name="JS_GAIN_DEFAULT" label="Gain" min={0} max={1} step={0.05} />
              <PilotSlider name="PILOT_YAW_RATE" label="Yaw rate" min={0} max={180} step={5} unit="°/s" />
              <PilotSlider name="PILOT_SPEED" label="Speed" min={0} max={2} step={0.05} />
              <PilotSlider name="PILOT_EXPO" label="Expo" min={0} max={1} step={0.05} />
            </Stack>
          </CardContent>
        </Card>

      </Stack>

      {/* Right: the only scrolling region */}
      <Box sx={{ minHeight: 0, height: '100%' }}>
        <StatusConsole />
      </Box>
    </Box>
  )
}
