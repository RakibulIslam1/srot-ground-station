import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  FormControlLabel,
  Stack,
  Switch,
  Typography
} from '@mui/material'
import { useTelemetry } from '../store/telemetry'
import { ParamGroups } from '../components/ParamControls'
import LiveChart from '../components/LiveChart'
import { FlightMode, FLIGHT_MODE_LABELS } from '../../../shared/protocol'

const DEG = 180 / Math.PI

export default function TuningView(): JSX.Element {
  const connected = useTelemetry((s) => s.status.connected)
  const armed = useTelemetry((s) => s.armed)
  const mode = useTelemetry((s) => s.mode)
  const setMode = useTelemetry((s) => s.setMode)
  const arm = useTelemetry((s) => s.arm)
  const setParam = useTelemetry((s) => s.setParam)
  const saveParams = useTelemetry((s) => s.saveParams)
  const mtuneEn = useTelemetry((s) => s.paramValues['MTUNE_EN'])
  const lastMsg = useTelemetry((s) => s.statusText[s.statusText.length - 1])

  const running = mode === FlightMode.AUTOTUNE || mode === FlightMode.MOTOR_TUNE

  return (
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' } }}>
      {/* PID groups */}
      <Box sx={{ minWidth: 0 }}>
        <ParamGroups groups={['Attitude PID', 'Depth', 'Model-based']} defaultOpen="Attitude PID" />
      </Box>

      {/* Live response + tune consoles */}
      <Stack spacing={2}>
        <Card>
          <CardContent>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Attitude response (live, °)
            </Typography>
            <LiveChart
              symmetric
              series={[
                { key: 'roll', label: 'Roll', color: '#D0BCFF' },
                { key: 'pitch', label: 'Pitch', color: '#7FCFB6' },
                { key: 'yaw', label: 'Yaw', color: '#EFB8C8' }
              ]}
              sample={() => {
                const s = useTelemetry.getState()
                return { roll: s.roll * DEG, pitch: s.pitch * DEG, yaw: s.yaw * DEG }
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
              <Typography variant="h6">Autotune</Typography>
              <Chip size="small" variant="outlined" label={FLIGHT_MODE_LABELS[mode] ?? mode} />
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Relay auto-tune of the rate → angle → depth PIDs. Enter the mode, then arm. A tumble /
              spin-out / depth-runaway aborts and disarms automatically.
            </Typography>
            <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
              <Button variant="outlined" disabled={!connected} onClick={() => setMode(FlightMode.AUTOTUNE)}>
                Enter Autotune
              </Button>
              <Button variant="contained" color={armed ? 'error' : 'success'} disabled={!connected} onClick={() => arm(!armed)}>
                {armed ? 'Disarm' : 'Arm'}
              </Button>
              <Button variant="text" disabled={!connected} onClick={() => void saveParams()}>
                Save gains
              </Button>
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
              <Typography variant="h6">Motor Tune (RPM)</Typography>
              <Chip size="small" color={mtuneEn === 1 ? 'success' : 'default'} variant={mtuneEn === 1 ? 'filled' : 'outlined'} label={mtuneEn === 1 ? 'enabled' : 'locked'} />
            </Stack>
            <Alert severity="warning" variant="outlined" sx={{ mb: 1.5 }}>
              Spins the thrusters — run in water. Requires MTUNE_EN.
            </Alert>
            <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
              <FormControlLabel
                control={
                  <Switch
                    checked={mtuneEn === 1}
                    disabled={!connected || mtuneEn === undefined}
                    onChange={(e) => setParam('MTUNE_EN', e.target.checked ? 1 : 0)}
                  />
                }
                label="Enable"
              />
              <Button variant="outlined" disabled={!connected || mtuneEn !== 1} onClick={() => setMode(FlightMode.MOTOR_TUNE)}>
                Enter Motor Tune
              </Button>
              <Button variant="contained" color={armed ? 'error' : 'success'} disabled={!connected} onClick={() => arm(!armed)}>
                {armed ? 'Disarm' : 'Arm'}
              </Button>
            </Stack>
          </CardContent>
        </Card>

        {running && lastMsg && <Alert severity="info" variant="outlined">{lastMsg.text}</Alert>}
      </Stack>
    </Box>
  )
}
