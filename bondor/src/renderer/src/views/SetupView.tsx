import { useRef, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Slider,
  Stack,
  Tab,
  Tabs,
  Typography
} from '@mui/material'
import { useTelemetry, useThrottledTelemetry } from '../store/telemetry'
import { ParamGroups } from '../components/ParamControls'
import { MAV_CMD, FlightMode } from '../../../shared/protocol'

function TabPanel({ value, index, children }: { value: number; index: number; children: React.ReactNode }): JSX.Element {
  return <Box hidden={value !== index} sx={{ pt: 2 }}>{value === index && children}</Box>
}

// ---- Sensors / calibration -------------------------------------------------
function SensorsTab(): JSX.Element {
  const sendCommand = useTelemetry((s) => s.sendCommand)
  const connected = useTelemetry((s) => s.status.connected)
  const lastMsg = useTelemetry((s) => s.statusText[s.statusText.length - 1])

  const cal = (p: number[]): void => sendCommand(MAV_CMD.PREFLIGHT_CALIBRATION, p)
  const POSITIONS = ['Level', 'Left', 'Right', 'Nose down', 'Nose up', 'Back']

  return (
    <Stack spacing={2} sx={{ maxWidth: 640 }}>
      {lastMsg && <Alert severity="info" variant="outlined">{lastMsg.text}</Alert>}
      <Card>
        <CardContent>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Quick calibrations
          </Typography>
          <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
            <Button variant="outlined" disabled={!connected} onClick={() => cal([1, 0, 0, 0, 0, 0, 0])}>
              Gyro
            </Button>
            <Button variant="outlined" disabled={!connected} onClick={() => cal([0, 0, 0, 0, 2, 0, 0])}>
              Level horizon
            </Button>
            <Button variant="outlined" disabled={!connected} onClick={() => cal([0, 0, 1, 0, 0, 0, 0])}>
              Zero depth (baro)
            </Button>
            <Button variant="outlined" disabled={!connected} onClick={() => cal([0, 1, 0, 0, 0, 0, 0])}>
              Compass
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Accelerometer — 6-point
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Start, then place the vehicle in each orientation and capture. Watch the message banner for prompts.
          </Typography>
          <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
            <Button variant="contained" disabled={!connected} onClick={() => cal([0, 0, 0, 0, 1, 0, 0])}>
              Start
            </Button>
            {POSITIONS.map((p, i) => (
              <Button
                key={p}
                variant="outlined"
                disabled={!connected}
                onClick={() => sendCommand(MAV_CMD.ACCELCAL_VEHICLE_POS, [i + 1, 0, 0, 0, 0, 0, 0])}
              >
                {p}
              </Button>
            ))}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  )
}

// Live RPM for one motor. Kept in its own component reading a THROTTLED snapshot: the
// ESC_STATUS handler rebuilds the rpm array on every message, so subscribing to it from
// MotorsTab would re-render the whole tab (and its buttons/slider) at telemetry rate.
function MotorRpm({ index }: { index: number }): JSX.Element {
  const t = useThrottledTelemetry(10)
  const v = Math.round(t.rpm[index] ?? 0)
  return (
    <Typography
      variant="body2"
      sx={{ fontVariantNumeric: 'tabular-nums', color: v === 0 ? 'text.disabled' : v < 0 ? 'warning.main' : 'success.main' }}
    >
      {v}
      <Typography component="span" variant="caption" sx={{ ml: 0.25, color: 'text.secondary' }}>
        rpm
      </Typography>
    </Typography>
  )
}

// ---- Motors: test / reverse / detect ---------------------------------------
function MotorsTab(): JSX.Element {
  const armed = useTelemetry((s) => s.armed)
  const arm = useTelemetry((s) => s.arm)
  const setMode = useTelemetry((s) => s.setMode)
  const sendCommand = useTelemetry((s) => s.sendCommand)
  const connected = useTelemetry((s) => s.status.connected)
  const [throttle, setThrottle] = useState(15)
  const holdTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const runMotor = (motor: number): void => {
    // DO_MOTOR_TEST: p1 motor (1-based), p2 throttle type 0=percent, p3 percent, p4 timeout s.
    sendCommand(MAV_CMD.DO_MOTOR_TEST, [motor, 0, throttle, 1, 0, 0, 0])
  }
  const startHold = (motor: number): void => {
    runMotor(motor)
    holdTimer.current = setInterval(() => runMotor(motor), 300) // ≥2 Hz keep-alive
  }
  const stopHold = (): void => {
    if (holdTimer.current) clearInterval(holdTimer.current)
    holdTimer.current = null
  }

  return (
    <Stack spacing={2} sx={{ maxWidth: 720 }}>
      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
        <Button variant="contained" color={armed ? 'error' : 'success'} disabled={!connected} onClick={() => arm(!armed)}>
          {armed ? 'Disarm' : 'Arm'}
        </Button>
        <Button variant="outlined" disabled={!connected} onClick={() => setMode(FlightMode.MOTOR_DETECT)}>
          Run Motor Detect
        </Button>
        <Chip
          size="small"
          color={armed ? 'error' : 'default'}
          label={armed ? 'ARMED — motors live' : 'Disarmed'}
          variant={armed ? 'filled' : 'outlined'}
        />
      </Stack>

      <Card>
        <CardContent>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Motor test — hold to spin (throttle {throttle}%)
          </Typography>
          <Slider value={throttle} onChange={(_e, v) => setThrottle(v as number)} min={0} max={50} valueLabelDisplay="auto" sx={{ maxWidth: 300 }} />
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1.5, mt: 1 }}>
            {Array.from({ length: 8 }, (_, i) => (
              <Button
                key={i}
                variant="outlined"
                disabled={!armed || !connected}
                onMouseDown={() => startHold(i + 1)}
                onMouseUp={stopHold}
                onMouseLeave={stopHold}
                sx={{ flexDirection: 'column', py: 1, lineHeight: 1.3 }}
              >
                <Typography variant="button" component="span">M{i + 1}</Typography>
                <MotorRpm index={i} />
              </Button>
            ))}
          </Box>
          <Typography
            variant="caption"
            color={armed ? 'text.secondary' : 'warning.main'}
            sx={{ mt: 1, display: 'block' }}
          >
            {armed
              ? 'Releasing a button stops that motor but stays armed — test as many as you like, then Disarm.'
              : 'Arm the vehicle to test motors.'}
          </Typography>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Thruster direction (reverse)
          </Typography>
          {/* Motor test is hard-gated on armed in the firmware ("Arm motors before
              testing motors"), so verifying a direction with Bondor alone means arming
              -- and arming trips the companion failsafe unless FS_GCS_COMPID accepts us.
              The Dive tab carries the one-click bench-mode toggle and the explanation. */}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            Verifying a direction needs <b>Motor test</b>, which the board only allows
            while <b>armed</b>. Using Bondor on its own? Enable <b>bench mode</b> from the
            banner on the Dive tab first, or arming will trip the companion failsafe and
            the board will surface.
          </Typography>
          <ParamGroups groups={['Motors & Frame']} defaultOpen="Motors & Frame" />
        </CardContent>
      </Card>
    </Stack>
  )
}

// ---- Config: grouped params ------------------------------------------------
function ConfigTab(): JSX.Element {
  return (
    <Box sx={{ maxWidth: 760 }}>
      <ParamGroups groups={['Power', 'Failsafe', 'Pilot / Input', 'Lights & Buzzer', 'Servos & Payload', 'GPIO pins']} />
    </Box>
  )
}

export default function SetupView(): JSX.Element {
  const [tab, setTab] = useState(0)
  return (
    <Box>
      <Tabs value={tab} onChange={(_e, v) => setTab(v)}>
        <Tab label="Sensors" />
        <Tab label="Motors" />
        <Tab label="Config" />
      </Tabs>
      <TabPanel value={tab} index={0}>
        <SensorsTab />
      </TabPanel>
      <TabPanel value={tab} index={1}>
        <MotorsTab />
      </TabPanel>
      <TabPanel value={tab} index={2}>
        <ConfigTab />
      </TabPanel>
    </Box>
  )
}
