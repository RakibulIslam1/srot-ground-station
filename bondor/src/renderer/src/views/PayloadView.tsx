import { useEffect, useState } from 'react'
import {
  Box,
  Card,
  CardContent,
  Chip,
  MenuItem,
  Slider,
  Stack,
  Switch,
  TextField,
  Typography
} from '@mui/material'
import { useTelemetry } from '../store/telemetry'
import { SERVO_FUNCTIONS, SERVO_ROLES } from '../../../shared/protocol'

// Roles and functions come from shared/protocol.ts -- the one GCS mirror of the
// firmware's config.h. They used to be a local literal here, which is how a third
// copy of a co-owned constant gets born.
const ROLES = SERVO_ROLES

function Channel({ ch }: { ch: number }): JSX.Element {
  // ch is 1-based (SERVO1..16 → DO_SET_SERVO channel 1..16).
  const role = useTelemetry((s) => s.paramValues[`SERVO${ch}_ROLE`])
  const func = useTelemetry((s) => s.paramValues[`SERVO${ch}_FUNCTION`])
  const min = useTelemetry((s) => s.paramValues[`SERVO${ch}_MIN`]) ?? 1100
  const max = useTelemetry((s) => s.paramValues[`SERVO${ch}_MAX`]) ?? 1900
  const trim = useTelemetry((s) => s.paramValues[`SERVO${ch}_TRIM`]) ?? 1500
  const setParam = useTelemetry((s) => s.setParam)
  const sendServo = useTelemetry((s) => s.sendServo)
  const connected = useTelemetry((s) => s.status.connected)

  const [us, setUs] = useState<number>(trim)
  const [on, setOn] = useState(false)
  useEffect(() => setUs(trim), [trim])

  const r = role ?? 0

  return (
    <Card>
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
          <Chip size="small" label={`CH ${ch}`} />
          <TextField
            select
            size="small"
            value={r}
            disabled={!connected || role === undefined}
            onChange={(e) => setParam(`SERVO${ch}_ROLE`, Number(e.target.value))}
            sx={{ minWidth: 150 }}
          >
            {ROLES.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>

          {/* IDENTITY, not authority. The firmware never reads SERVOn_FUNCTION --
              it is storage so the payload map lives on the board and travels with
              the hull, instead of in a host-side table that goes stale the moment
              someone re-wires a channel. duburi_ws reads it at bring-up. */}
          <TextField
            select
            size="small"
            label="Function"
            value={func ?? 0}
            disabled={!connected || func === undefined}
            onChange={(e) => setParam(`SERVO${ch}_FUNCTION`, Number(e.target.value))}
            sx={{ minWidth: 150 }}
          >
            {SERVO_FUNCTIONS.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>
        </Stack>

        {r === 1 && (
          <Box>
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="caption" color="text.secondary">
                Test µs
              </Typography>
              <Typography variant="caption">{us}</Typography>
            </Stack>
            <Slider
              size="small"
              min={min}
              max={max}
              value={us}
              disabled={!connected}
              onChange={(_e, v) => setUs(v as number)}
              onChangeCommitted={(_e, v) => sendServo(ch, v as number)}
            />
            <Typography variant="caption" color="text.secondary">
              range {min}–{max}
            </Typography>
          </Box>
        )}

        {r === 2 && (
          <Stack direction="row" alignItems="center" spacing={1}>
            <Switch
              checked={on}
              disabled={!connected}
              onChange={(e) => {
                setOn(e.target.checked)
                sendServo(ch, e.target.checked ? max : min)
              }}
            />
            <Typography variant="body2">{on ? `ON (${max}µs)` : `OFF (${min}µs)`}</Typography>
          </Stack>
        )}

        {r === 0 && (
          <Typography variant="caption" color="text.secondary">
            Disabled — set a role to control this channel.
          </Typography>
        )}
      </CardContent>
    </Card>
  )
}

export default function PayloadView(): JSX.Element {
  const loaded = useTelemetry((s) => s.paramValues['SERVO1_ROLE'] !== undefined)

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2, maxWidth: 720 }}>
        Configure each PCA9685 aux channel and test it live. <b>Role</b> is the authority — it
        decides what the board will actually drive: <b>Servo</b> channels get a µs slider,{' '}
        <b>Switch</b> channels (MOSFET/relay) get an on/off toggle, and only a Switch channel can
        be fired by the companion. <b>Function</b> is the identity — what duburi_ws calls the
        channel when it reads the payload map off the board at bring-up. The two are independent:
        setting a Function does <b>not</b> make a channel fireable. All of these are saved params —
        press <b>Save</b> on the Parameters tab or they are lost on reboot.
      </Typography>
      {!loaded ? (
        <Typography variant="body2" color="text.secondary">
          Waiting for parameters… (they auto-load on connect; or load them on the Parameters tab).
        </Typography>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr 1fr' }, gap: 1.5 }}>
          {Array.from({ length: 16 }, (_, i) => (
            <Channel key={i} ch={i + 1} />
          ))}
        </Box>
      )}
    </Box>
  )
}
