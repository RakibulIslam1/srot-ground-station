import { useEffect, useState } from 'react'
import {
  AppBar,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Toolbar,
  Typography
} from '@mui/material'
import LinkIcon from '@mui/icons-material/Link'
import LinkOffIcon from '@mui/icons-material/LinkOff'
import RefreshIcon from '@mui/icons-material/Refresh'
import { IconButton, InputAdornment } from '@mui/material'
import { useTelemetry } from '../store/telemetry'
import {
  FLIGHT_MODE_LABELS,
  type ConnectOptions,
  type SerialPortInfo
} from '../../../shared/protocol'

function useLinkAlive(): boolean {
  const lastHb = useTelemetry((s) => s.lastHeartbeatTs)
  const [alive, setAlive] = useState(false)
  useEffect(() => {
    const t = setInterval(() => setAlive(Date.now() - lastHb < 3000), 500)
    return () => clearInterval(t)
  }, [lastHb])
  return alive
}

export default function ConnectionBar({ title }: { title: string }): JSX.Element {
  const status = useTelemetry((s) => s.status)
  const armed = useTelemetry((s) => s.armed)
  const mode = useTelemetry((s) => s.mode)
  const connect = useTelemetry((s) => s.connect)
  const disconnect = useTelemetry((s) => s.disconnect)
  const alive = useLinkAlive()

  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<ConnectOptions['kind']>('serial')
  const [localPort, setLocalPort] = useState('14550')
  const [host, setHost] = useState('')
  const [port, setPort] = useState('14550')
  const [url, setUrl] = useState('ws://blueos.local:6040')
  const [ports, setPorts] = useState<SerialPortInfo[]>([])
  const [path, setPath] = useState('')
  const [baud, setBaud] = useState('115200')

  const loadPorts = async (): Promise<void> => {
    const list = await window.bondor.listSerialPorts()
    setPorts(list)
    if (list.length && !list.some((p) => p.path === path)) setPath(list[0].path)
  }

  useEffect(() => {
    if (open && kind === 'serial') void loadPorts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kind])

  const doConnect = (): void => {
    if (kind === 'udp') {
      connect({
        kind,
        localPort: Number(localPort) || 14550,
        host: host.trim() || undefined,
        port: host.trim() ? Number(port) || 14550 : undefined
      })
    } else if (kind === 'serial') {
      if (!path) return
      connect({ kind, path, baud: Number(baud) || 115200 })
    } else {
      connect({ kind, url })
    }
    setOpen(false)
  }

  const connected = status.connected

  return (
    <AppBar position="static" color="transparent" elevation={0}
      sx={{ borderBottom: (t) => `1px solid ${t.palette.divider}` }}>
      <Toolbar sx={{ gap: 1.5 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
        <Box sx={{ flexGrow: 1 }} />

        {connected && (
          <>
            <Chip
              size="small"
              color={armed ? 'error' : 'default'}
              variant={armed ? 'filled' : 'outlined'}
              label={armed ? 'ARMED' : 'DISARMED'}
            />
            <Chip size="small" variant="outlined" label={FLIGHT_MODE_LABELS[mode] ?? `Mode ${mode}`} />
          </>
        )}

        <Chip
          size="small"
          color={alive ? 'success' : connected ? 'warning' : 'default'}
          variant={alive ? 'filled' : 'outlined'}
          label={alive ? 'Link OK' : connected ? 'No heartbeat' : 'Offline'}
        />

        {status.error && (
          <Typography variant="caption" color="error" sx={{ maxWidth: 260 }} noWrap title={status.error}>
            {status.error}
          </Typography>
        )}

        {connected ? (
          <Button color="inherit" startIcon={<LinkOffIcon />} onClick={disconnect}>
            Disconnect
          </Button>
        ) : (
          <Button variant="contained" startIcon={<LinkIcon />} onClick={() => setOpen(true)}>
            Connect
          </Button>
        )}
      </Toolbar>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Connect to SROT</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField select label="Transport" value={kind}
              onChange={(e) => setKind(e.target.value as ConnectOptions['kind'])}>
              <MenuItem value="serial">USB (serial)</MenuItem>
              <MenuItem value="udp">Direct UDP</MenuItem>
              <MenuItem value="mavlink2rest">BlueOS MAVLink2Rest (soon)</MenuItem>
            </TextField>

            {kind === 'serial' && (
              <>
                <TextField
                  select
                  label="Port"
                  value={ports.some((p) => p.path === path) ? path : ''}
                  onChange={(e) => setPath(e.target.value)}
                  helperText={ports.length ? 'The SROT ESP32 USB port.' : 'No serial ports found — plug in the board, then refresh.'}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end" sx={{ mr: 3 }}>
                        <IconButton size="small" onClick={() => void loadPorts()}>
                          <RefreshIcon fontSize="small" />
                        </IconButton>
                      </InputAdornment>
                    )
                  }}
                >
                  {ports.map((p) => (
                    <MenuItem key={p.path} value={p.path}>
                      {p.path}
                      {p.friendlyName || p.manufacturer ? ` — ${p.friendlyName ?? p.manufacturer}` : ''}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField select label="Baud" value={baud} onChange={(e) => setBaud(e.target.value)}>
                  {['115200', '57600', '230400', '921600'].map((b) => (
                    <MenuItem key={b} value={b}>
                      {b}
                    </MenuItem>
                  ))}
                </TextField>
              </>
            )}

            {kind === 'udp' && (
              <>
                <TextField label="Listen port (local)" value={localPort}
                  onChange={(e) => setLocalPort(e.target.value)} helperText="Bind here; the router pushes to this port (default 14550)." />
                <TextField label="Vehicle host (optional)" value={host} placeholder="e.g. 192.168.2.2"
                  onChange={(e) => setHost(e.target.value)} helperText="Leave blank to auto-learn the peer from incoming packets." />
                {host.trim() && (
                  <TextField label="Vehicle port" value={port} onChange={(e) => setPort(e.target.value)} />
                )}
              </>
            )}
            {kind === 'mavlink2rest' && (
              <TextField label="MAVLink2Rest URL" value={url} onChange={(e) => setUrl(e.target.value)} />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={doConnect}>
            Connect
          </Button>
        </DialogActions>
      </Dialog>
    </AppBar>
  )
}
