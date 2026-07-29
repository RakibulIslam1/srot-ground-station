import { useMemo, useRef, useState } from 'react'
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
  Typography
} from '@mui/material'
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord'
import StopIcon from '@mui/icons-material/Stop'
import DownloadIcon from '@mui/icons-material/Download'
import DeleteIcon from '@mui/icons-material/Delete'
import { useTelemetry } from '../store/telemetry'
import LiveChart, { type Series } from '../components/LiveChart'

const DEG = 180 / Math.PI
const PALETTE = ['#D0BCFF', '#7FCFB6', '#EFB8C8', '#FFB868', '#8AB4F8', '#F28B82', '#C58AF9', '#80CBC4']

// Fixed signals + dynamic NAMED_VALUE_FLOAT keys.
function currentSignals(): Record<string, number> {
  const s = useTelemetry.getState()
  const out: Record<string, number> = {
    roll: s.roll * DEG,
    pitch: s.pitch * DEG,
    yaw: s.yaw * DEG,
    depth: s.depth,
    battV: s.battVolt,
    battA: s.battCurr
  }
  s.rpm.forEach((r, i) => (out[`rpm${i + 1}`] = r))
  for (const [k, v] of Object.entries(s.named)) out[`nv:${k}`] = v
  return out
}

export default function AnalyzeView(): JSX.Element {
  const named = useTelemetry((s) => s.named)
  const [selected, setSelected] = useState<string[]>(['roll', 'pitch', 'yaw'])
  const [recording, setRecording] = useState(false)
  const [count, setCount] = useState(0)
  const rows = useRef<Record<string, number>[]>([])
  const recTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const available = useMemo(() => {
    const base = ['roll', 'pitch', 'yaw', 'depth', 'battV', 'battA', 'rpm1', 'rpm2', 'rpm3', 'rpm4', 'rpm5', 'rpm6', 'rpm7', 'rpm8']
    const nv = Object.keys(named).map((k) => `nv:${k}`)
    return [...base, ...nv]
  }, [named])

  const series: Series[] = selected.slice(0, 6).map((k, i) => ({ key: k, label: k.replace('nv:', ''), color: PALETTE[i % PALETTE.length] }))

  const toggle = (k: string): void =>
    setSelected((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k].slice(0, 6)))

  const startRec = (): void => {
    rows.current = []
    setCount(0)
    setRecording(true)
    const t0 = Date.now()
    recTimer.current = setInterval(() => {
      rows.current.push({ t: (Date.now() - t0) / 1000, ...currentSignals() })
      setCount(rows.current.length)
    }, 50) // 20 Hz
  }
  const stopRec = (): void => {
    if (recTimer.current) clearInterval(recTimer.current)
    recTimer.current = null
    setRecording(false)
  }

  const download = (text: string, name: string, type: string): void => {
    const url = URL.createObjectURL(new Blob([text], { type }))
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
  }
  const exportCsv = (): void => {
    if (!rows.current.length) return
    const cols = Object.keys(rows.current[0])
    const lines = [cols.join(',')]
    for (const r of rows.current) lines.push(cols.map((c) => r[c] ?? '').join(','))
    download(lines.join('\n'), `bondor-log-${Date.now()}.csv`, 'text/csv')
  }
  const clear = (): void => {
    rows.current = []
    setCount(0)
  }

  const imuSeries: Series[] = [
    { key: 'roll', label: 'Roll', color: '#D0BCFF' },
    { key: 'pitch', label: 'Pitch', color: '#7FCFB6' },
    { key: 'yaw', label: 'Yaw', color: '#EFB8C8' }
  ]
  const rpmSeries: Series[] = Array.from({ length: 8 }, (_, i) => ({
    key: `rpm${i + 1}`,
    label: `M${i + 1}`,
    color: PALETTE[i % PALETTE.length]
  }))

  return (
    <Stack spacing={2} sx={{ maxWidth: 860 }}>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
        <Card>
          <CardContent>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              IMU attitude (°)
            </Typography>
            <LiveChart symmetric series={imuSeries} sample={currentSignals} windowSec={15} height={160} />
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Motor RPM
            </Typography>
            <LiveChart series={rpmSeries} sample={currentSignals} windowSec={15} height={160} />
          </CardContent>
        </Card>
      </Box>

      <Card>
        <CardContent>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Custom signals ({selected.length}/6)
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {available.map((k) => (
              <Chip
                key={k}
                size="small"
                label={k.replace('nv:', '')}
                color={selected.includes(k) ? 'primary' : 'default'}
                variant={selected.includes(k) ? 'filled' : 'outlined'}
                onClick={() => toggle(k)}
              />
            ))}
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <LiveChart series={series} sample={currentSignals} windowSec={15} height={240} />
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
            <Typography variant="subtitle2" color="text.secondary">
              Black box
            </Typography>
            {recording ? (
              <Button variant="contained" color="error" startIcon={<StopIcon />} onClick={stopRec}>
                Stop
              </Button>
            ) : (
              <Button variant="contained" startIcon={<FiberManualRecordIcon />} onClick={startRec}>
                Record
              </Button>
            )}
            <Button variant="outlined" startIcon={<DownloadIcon />} disabled={!count} onClick={exportCsv}>
              Export CSV
            </Button>
            <Button variant="text" color="inherit" startIcon={<DeleteIcon />} disabled={!count || recording} onClick={clear}>
              Clear
            </Button>
            <Box sx={{ flexGrow: 1 }} />
            <Chip
              size="small"
              color={recording ? 'error' : 'default'}
              variant={recording ? 'filled' : 'outlined'}
              label={`${count} samples${recording ? ' · REC' : ''}`}
            />
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Records all fixed signals + named values at 20 Hz to a CSV you can open in any tool.
          </Typography>
        </CardContent>
      </Card>
    </Stack>
  )
}
