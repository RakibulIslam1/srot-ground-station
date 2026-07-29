import { useMemo, useState } from 'react'
import { Box, Button, Chip, LinearProgress, Stack, TextField, Typography } from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import SaveIcon from '@mui/icons-material/Save'
import { useTelemetry } from '../store/telemetry'
import { ParamGroups } from '../components/ParamControls'

export default function ParamsView(): JSX.Element {
  const paramValues = useTelemetry((s) => s.paramValues)
  const paramCount = useTelemetry((s) => s.paramCount)
  const requestParams = useTelemetry((s) => s.requestParams)
  const saveParams = useTelemetry((s) => s.saveParams)
  const reboot = useTelemetry((s) => s.reboot)
  const connected = useTelemetry((s) => s.status.connected)
  const [search, setSearch] = useState('')

  const received = useMemo(() => Object.keys(paramValues).length, [paramValues])
  const loading = paramCount > 0 && received < paramCount

  return (
    <Box sx={{ maxWidth: 900 }}>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
        <Button variant="contained" startIcon={<RefreshIcon />} disabled={!connected} onClick={requestParams}>
          {received ? 'Reload' : 'Load parameters'}
        </Button>
        <Button variant="outlined" startIcon={<SaveIcon />} disabled={!connected || !received} onClick={saveParams}>
          Save to flash
        </Button>
        <Button variant="text" color="inherit" disabled={!connected} onClick={reboot}>
          Reboot
        </Button>
        <Box sx={{ flexGrow: 1 }} />
        <Chip size="small" variant="outlined" label={paramCount ? `${received} / ${paramCount}` : `${received} params`} />
        <TextField size="small" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </Stack>

      {loading && <LinearProgress variant="determinate" value={(received / paramCount) * 100} sx={{ mb: 2, borderRadius: 2 }} />}

      {received === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {connected ? 'Load parameters to begin.' : 'Connect to the vehicle first.'}
        </Typography>
      ) : (
        <ParamGroups search={search} defaultOpen="Attitude PID" />
      )}
    </Box>
  )
}
