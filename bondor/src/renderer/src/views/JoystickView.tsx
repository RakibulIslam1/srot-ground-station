// =============================================================================
//  Joystick — live controller state + button mapping.
//
//  Two jobs: show which physical button is which INDEX (press it and watch the
//  grid light up), and let that index be assigned a vehicle function. The mapping
//  itself is just BTN0..15_FUNCTION params, so it reuses the normal param plumbing
//  rather than inventing a second write path.
// =============================================================================

import {
  Box,
  Card,
  CardContent,
  Chip,
  FormControlLabel,
  LinearProgress,
  Stack,
  Switch,
  Typography
} from '@mui/material'
import { usePad } from '../joystick/useGamepad'
import { useTelemetry, useThrottledTelemetry } from '../store/telemetry'
import { ParamGroups } from '../components/ParamControls'
import { btnFunctionLabel } from '../metadata/srotParams'

// The firmware only decodes the low 16 buttons of MANUAL_CONTROL.
const MAPPABLE = 16

function AxisBar({ label, value }: { label: string; value: number }): JSX.Element {
  const pct = Math.round(((value + 1) / 2) * 100) // -1..1 -> 0..100
  return (
    <Box sx={{ mb: 1 }}>
      <Stack direction="row" justifyContent="space-between">
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>
          {value.toFixed(2)}
        </Typography>
      </Stack>
      <LinearProgress variant="determinate" value={pct} sx={{ height: 6, borderRadius: 3 }} />
    </Box>
  )
}

export default function JoystickView(): JSX.Element {
  const pad = usePad(15)
  const t = useThrottledTelemetry(10)
  const paramValues = useTelemetry((s) => s.paramValues)
  const connected = useTelemetry((s) => s.status.connected)

  // Live gain comes from the vehicle (NAMED_VALUE_FLOAT "GAIN") because the gain
  // buttons change it at runtime — JS_GAIN_DEFAULT is only the power-on value.
  const gain = t.named?.GAIN

  return (
    <Stack spacing={2} sx={{ maxWidth: 900 }}>
      <Card>
        <CardContent>
          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
            <Chip
              size="small"
              color={pad.connected ? 'success' : 'default'}
              variant={pad.connected ? 'filled' : 'outlined'}
              label={pad.connected ? 'Controller connected' : 'No controller'}
            />
            {pad.connected && (
              <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 420 }} noWrap>
                {pad.name}
              </Typography>
            )}
            <Box sx={{ flex: 1 }} />
            <FormControlLabel
              control={
                <Switch
                  checked={pad.enabled}
                  disabled={!connected}
                  onChange={(e) => pad.setEnabled(e.target.checked)}
                />
              }
              label="Send to vehicle"
            />
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
            {pad.enabled
              ? 'Sticks and buttons are being sent to the vehicle.'
              : 'Input is shown here but NOT sent — safe for setting up the mapping.'}
          </Typography>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Buttons — press one to find its number
          </Typography>
          {!pad.connected ? (
            <Typography variant="body2" color="text.secondary">
              Connect a controller and press any button.
            </Typography>
          ) : (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))',
                gap: 1
              }}
            >
              {pad.buttons.map((down, i) => {
                const fn = i < MAPPABLE ? paramValues[`BTN${i}_FUNCTION`] : undefined
                return (
                  <Box
                    key={i}
                    sx={{
                      p: 1,
                      borderRadius: 1,
                      textAlign: 'center',
                      border: 1,
                      borderColor: down ? 'success.main' : 'divider',
                      bgcolor: down ? 'success.main' : 'transparent',
                      color: down ? 'success.contrastText' : 'text.primary',
                      transition: 'background-color 80ms'
                    }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {i}
                    </Typography>
                    <Typography variant="caption" sx={{ display: 'block', lineHeight: 1.2 }}>
                      {i >= MAPPABLE
                        ? 'not mappable'
                        : fn === undefined
                          ? '—'
                          : btnFunctionLabel(Math.round(fn))}
                    </Typography>
                  </Box>
                )
              })}
            </Box>
          )}
          {pad.connected && pad.buttons.length > MAPPABLE && (
            <Typography variant="caption" color="warning.main" sx={{ mt: 1, display: 'block' }}>
              Only buttons 0–{MAPPABLE - 1} can be mapped — the vehicle decodes 16.
            </Typography>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Sticks
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2 }}>
            <Box>
              {pad.axes.map((v, i) => (
                <AxisBar key={i} label={`Axis ${i}`} value={v} />
              ))}
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Sent to vehicle
              </Typography>
              <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', mt: 0.5 }}>
                forward {pad.cmd.x} · lateral {pad.cmd.y}
                <br />
                yaw {pad.cmd.r} · heave {pad.cmd.z}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                Pilot gain
              </Typography>
              <Typography variant="h6" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                {gain === undefined ? '—' : `${Math.round(gain * 100)}%`}
              </Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>

      <ParamGroups groups={['Joystick buttons']} defaultOpen="Joystick buttons" />
      <ParamGroups groups={['Pilot / Input']} />
    </Stack>
  )
}
