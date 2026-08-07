import { useMemo, useState } from 'react'
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
  // Recorder state lives in the STORE, not here. Keeping it in component state meant
  // switching tabs unmounted the recorder and destroyed the flight you were capturing.
  const recording = useTelemetry((s) => s.recording)
  const count = useTelemetry((s) => s.recCount)
  const startRec = useTelemetry((s) => s.startRecording)
  const stopRec = useTelemetry((s) => s.stopRecording)
  const clear = useTelemetry((s) => s.clearRecording)
  const recordingCsv = useTelemetry((s) => s.recordingCsv)
  const recordingEventsCsv = useTelemetry((s) => s.recordingEventsCsv)

  const available = useMemo(() => {
    const base = ['roll', 'pitch', 'yaw', 'depth', 'battV', 'battA', 'rpm1', 'rpm2', 'rpm3', 'rpm4', 'rpm5', 'rpm6', 'rpm7', 'rpm8']
    const nv = Object.keys(named).map((k) => `nv:${k}`)
    return [...base, ...nv]
  }, [named])

  const series: Series[] = selected.slice(0, 6).map((k, i) => ({ key: k, label: k.replace('nv:', ''), color: PALETTE[i % PALETTE.length] }))

  const toggle = (k: string): void =>
    setSelected((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k].slice(0, 6)))


  const download = (text: string, name: string, type: string): void => {
    const url = URL.createObjectURL(new Blob([text], { type }))
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
  }
  // Two files sharing one t=0: the sample trace, and the event log (mode changes,
  // arm/disarm, statustexts and every command sent). "Which mode was it in when that
  // happened" is the question these exist to answer, so they must line up.
  const exportCsv = (): void => {
    const stamp = Date.now()
    const csv = recordingCsv()
    if (csv) download(csv, `bondor-log-${stamp}.csv`, 'text/csv')
    const ev = recordingEventsCsv()
    if (ev) download(ev, `bondor-events-${stamp}.csv`, 'text/csv')
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
