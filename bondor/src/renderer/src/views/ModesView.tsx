import { useState } from 'react'
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  MenuItem,
  Stack,
  TextField,
  Typography
} from '@mui/material'
import { useTelemetry } from '../store/telemetry'
import { MoveType, MAV_CMD, MavResult, FlightMode } from '../../../shared/protocol'

const MOVES = [
  { v: MoveType.FORWARD, l: 'Forward', primary: 'duration s', speed: true },
  { v: MoveType.BACK, l: 'Back', primary: 'duration s', speed: true },
  { v: MoveType.STRAFE_LEFT, l: 'Strafe Left', primary: 'duration s', speed: true },
  { v: MoveType.STRAFE_RIGHT, l: 'Strafe Right', primary: 'duration s', speed: true },
  { v: MoveType.TURN, l: 'Turn', primary: 'degrees', speed: false },
  { v: MoveType.DIVE, l: 'Dive', primary: 'depth m', speed: true },
  { v: MoveType.ARC, l: 'Arc', primary: 'duration s', speed: true },
  { v: MoveType.STYLE, l: 'Style', primary: 'count', speed: false },
  { v: MoveType.STOP, l: 'Stop', primary: '', speed: false },
  { v: MoveType.HOLD, l: 'Hold', primary: '', speed: false }
]

const RESULT_LABEL: Record<number, string> = {
  [MavResult.ACCEPTED]: 'DONE',
  [MavResult.IN_PROGRESS]: 'IN PROGRESS',
  [MavResult.DENIED]: 'DENIED',
  [MavResult.FAILED]: 'FAILED',
  [MavResult.TEMPORARILY_REJECTED]: 'REJECTED',
  [MavResult.UNSUPPORTED]: 'UNSUPPORTED'
}

export default function ModesView(): JSX.Element {
  const sendMove = useTelemetry((s) => s.sendMove)
  const sendCommand = useTelemetry((s) => s.sendCommand)
  const setMode = useTelemetry((s) => s.setMode)
  const acks = useTelemetry((s) => s.acks)
  const connected = useTelemetry((s) => s.status.connected)

  const [type, setType] = useState<MoveType>(MoveType.FORWARD)
  const [primary, setPrimary] = useState('3')
  const [speed, setSpeed] = useState('0.5')
  const [aux, setAux] = useState('0')
  const [timeout, setTimeoutS] = useState('30')
  const [turnAbs, setTurnAbs] = useState(false)

  const def = MOVES.find((m) => m.v === type)!
  const moveAcks = acks.filter((a) => a.command === MAV_CMD.SROT_MOVE).slice(-8).reverse()

  const fire = (): void => {
    const p = Number(primary) || 0
    const s = def.speed ? Number(speed) || 0 : Number(speed) || 0
    let auxVal = Number(aux) || 0
    if (type === MoveType.TURN) auxVal = turnAbs ? 1 : 0
    sendMove(type, p, type === MoveType.TURN && s > 1 ? s : def.speed ? s : 0, auxVal, Number(timeout) || 0)
  }

  return (
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            SROT Move console
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            High-level, on-board-braked moves (AUTO mode). Duration × speed → constant distance; the
            board brakes. Turn takes a yaw rate + relative/absolute heading.
          </Typography>
          <Stack spacing={2}>
            <TextField select label="Move" value={type} onChange={(e) => setType(Number(e.target.value))}>
              {MOVES.map((m) => (
                <MenuItem key={m.v} value={m.v}>
                  {m.l}
                </MenuItem>
              ))}
            </TextField>
            {def.primary && (
              <TextField
                label={def.primary}
                value={primary}
                onChange={(e) => setPrimary(e.target.value)}
              />
            )}
            {def.speed && (
              <TextField
                label="speed 0..1"
                value={speed}
                onChange={(e) => setSpeed(e.target.value)}
              />
            )}
            {type === MoveType.TURN && (
              <>
                <TextField
                  label="yaw rate deg/s (0 = default)"
                  value={speed}
                  onChange={(e) => setSpeed(e.target.value)}
                />
                <TextField
                  select
                  label="Turn mode"
                  value={turnAbs ? 1 : 0}
                  onChange={(e) => setTurnAbs(Number(e.target.value) === 1)}
                >
                  <MenuItem value={0}>Relative (±° from now)</MenuItem>
                  <MenuItem value={1}>Absolute heading (shortest)</MenuItem>
                </TextField>
              </>
            )}
            {type === MoveType.ARC && (
              <TextField
                label="arc yaw rate deg/s (+right/−left)"
                value={aux}
                onChange={(e) => setAux(e.target.value)}
              />
            )}
            <TextField label="timeout s (0 = default)" value={timeout} onChange={(e) => setTimeoutS(e.target.value)} />
            <Button variant="contained" disabled={!connected} onClick={fire}>
              Send move
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Move feedback (COMMAND_ACK)
          </Typography>
          {moveAcks.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              No moves sent yet.
            </Typography>
          )}
          <Stack spacing={1}>
            {moveAcks.map((a, i) => (
              <Stack key={i} direction="row" spacing={1} alignItems="center">
                <Chip
                  size="small"
                  color={a.result === MavResult.ACCEPTED ? 'success' : a.result === MavResult.IN_PROGRESS ? 'info' : 'error'}
                  label={RESULT_LABEL[a.result] ?? a.result}
                />
                <Typography variant="body2">{a.progress}%</Typography>
                <Typography variant="caption" color="text.secondary">
                  {new Date(a.ts).toLocaleTimeString()}
                </Typography>
              </Stack>
            ))}
          </Stack>
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" color="text.secondary">
              Live: MV_STATE {useTelemetry.getState().named['MV_STATE'] ?? '—'} · MV_PROG{' '}
              {(useTelemetry.getState().named['MV_PROG'] ?? 0).toFixed?.(2) ?? '—'}
            </Typography>
          </Box>
        </CardContent>
      </Card>

      <Card sx={{ gridColumn: { md: '1 / -1' } }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Maneuvers & modes
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Stunt spins (the ESP32 owns the maneuver and re-levels), the complex pattern, and quick
            mode switches. Vehicle must be armed for spins.
          </Typography>
          <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
            <Button variant="outlined" disabled={!connected} onClick={() => sendCommand(MAV_CMD.USER_1, [1])}>
              Yaw spin
            </Button>
            <Button variant="outlined" disabled={!connected} onClick={() => sendCommand(MAV_CMD.USER_2, [1])}>
              Pitch flip
            </Button>
            <Button variant="outlined" disabled={!connected} onClick={() => sendCommand(MAV_CMD.USER_3, [1])}>
              Roll spin
            </Button>
            <Button variant="outlined" disabled={!connected} onClick={() => sendCommand(MAV_CMD.USER_4, [0])}>
              Pattern
            </Button>
            <Box sx={{ flexGrow: 1 }} />
            <Button variant="text" disabled={!connected} onClick={() => setMode(FlightMode.DEPTH_HOLD)}>
              Depth Hold
            </Button>
            <Button variant="text" color="warning" disabled={!connected} onClick={() => setMode(FlightMode.SURFACE)}>
              Surface
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  )
}
