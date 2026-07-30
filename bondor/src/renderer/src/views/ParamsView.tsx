import { useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import SaveIcon from '@mui/icons-material/Save'
import DownloadIcon from '@mui/icons-material/Download'
import UploadIcon from '@mui/icons-material/Upload'
import { useTelemetry } from '../store/telemetry'
import { ParamGroups } from '../components/ParamControls'
import { downloadText, pickTextFile } from '../utils/files'
import {
  diffParams,
  needsReboot,
  parseParams,
  serializeParams,
  type ParamDiff
} from '../utils/paramFile'

interface PendingImport {
  fileName: string
  diff: ParamDiff
  badLines: string[]
  savedAt?: string
  defaultsVer?: number
}

export default function ParamsView(): JSX.Element {
  const paramValues = useTelemetry((s) => s.paramValues)
  const paramCount = useTelemetry((s) => s.paramCount)
  const requestParams = useTelemetry((s) => s.requestParams)
  const saveParams = useTelemetry((s) => s.saveParams)
  const writeParams = useTelemetry((s) => s.writeParams)
  const reboot = useTelemetry((s) => s.reboot)
  const connected = useTelemetry((s) => s.status.connected)
  const [search, setSearch] = useState('')

  const [pending, setPending] = useState<PendingImport | null>(null)
  const [applying, setApplying] = useState(false)
  const [applyDone, setApplyDone] = useState(0)
  const [result, setResult] = useState<{ ok: number; failed: string[] } | null>(null)

  const received = useMemo(() => Object.keys(paramValues).length, [paramValues])
  const loading = paramCount > 0 && received < paramCount
  // A partial download must never become a backup file — it would look complete and
  // silently restore defaults for everything that hadn't arrived.
  const canExport = received > 0 && (paramCount === 0 || received >= paramCount)

  const doExport = (): void => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    downloadText(
      serializeParams(paramValues, { defaultsVer: paramValues['SYS_PARAM_VER'] }),
      `srot-params-${stamp}.params`
    )
  }

  const doPickImport = async (): Promise<void> => {
    const picked = await pickTextFile('.params,.txt')
    if (!picked) return
    const parsed = parseParams(picked.text)
    setResult(null)
    setPending({
      fileName: picked.name,
      diff: diffParams(parsed.values, paramValues),
      badLines: parsed.badLines,
      savedAt: parsed.savedAt,
      defaultsVer: parsed.defaultsVer
    })
  }

  const doApply = async (): Promise<void> => {
    if (!pending) return
    setApplying(true)
    setApplyDone(0)
    const res = await writeParams(
      pending.diff.changed.map((c) => ({ name: c.name, value: c.to })),
      (done) => setApplyDone(done)
    )
    setApplying(false)
    setPending(null)
    setResult({ ok: res.written.length, failed: res.failed })
    // params::set() persists each write immediately, so this is belt-and-braces — but
    // it also covers the deferred calibration flush for any CAL_* rows.
    saveParams()
  }

  const rebootNeeded = pending?.diff.changed.some((c) => needsReboot(c.name)) ?? false

  return (
    <Box sx={{ maxWidth: 900 }}>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
        <Button variant="contained" startIcon={<RefreshIcon />} disabled={!connected} onClick={requestParams}>
          {received ? 'Reload' : 'Load parameters'}
        </Button>
        <Button variant="outlined" startIcon={<SaveIcon />} disabled={!connected || !received} onClick={saveParams}>
          Save to flash
        </Button>
        <Button
          variant="outlined"
          startIcon={<DownloadIcon />}
          disabled={!canExport}
          onClick={doExport}
          title={
            canExport
              ? 'Save every parameter (including the CAL_* calibration backup) to a .params file'
              : 'Wait for the full parameter list before exporting'
          }
        >
          Export
        </Button>
        <Button
          variant="outlined"
          startIcon={<UploadIcon />}
          disabled={!connected || !received}
          onClick={doPickImport}
          title="Load a .params file and review the changes before writing"
        >
          Import
        </Button>
        <Button variant="text" color="inherit" disabled={!connected} onClick={reboot}>
          Reboot
        </Button>
        <Box sx={{ flexGrow: 1 }} />
        <Chip size="small" variant="outlined" label={paramCount ? `${received} / ${paramCount}` : `${received} params`} />
        <TextField size="small" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </Stack>

      {loading && <LinearProgress variant="determinate" value={(received / paramCount) * 100} sx={{ mb: 2, borderRadius: 2 }} />}

      {result && (
        <Alert
          severity={result.failed.length ? 'warning' : 'success'}
          onClose={() => setResult(null)}
          sx={{ mb: 2 }}
        >
          {result.failed.length
            ? `Wrote ${result.ok}. NOT confirmed: ${result.failed.join(', ')} — re-import or set these by hand.`
            : `Imported ${result.ok} parameter${result.ok === 1 ? '' : 's'}, all confirmed by the vehicle.`}
        </Alert>
      )}

      <Alert severity="info" variant="outlined" sx={{ mb: 2 }}>
        Parameters survive a normal firmware upload, but a build that bumps
        <code> PARAM_DEFAULTS_VER</code> — or a full-chip erase — rewrites every one from its
        compiled default. <strong>Export before you reflash.</strong> The file also carries the{' '}
        <code>CAL_*</code> sensor calibration, which lives in separate storage and is otherwise
        lost for good.
      </Alert>

      {received === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {connected ? 'Load parameters to begin.' : 'Connect to the vehicle first.'}
        </Typography>
      ) : (
        <ParamGroups search={search} defaultOpen="Attitude PID" />
      )}

      <Dialog open={!!pending} onClose={() => !applying && setPending(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Import parameters</DialogTitle>
        <DialogContent>
          {pending && (
            <Stack spacing={2}>
              <Typography variant="body2" color="text.secondary">
                <strong>{pending.fileName}</strong>
                {pending.savedAt ? ` · saved ${pending.savedAt}` : ''}
                {pending.defaultsVer !== undefined ? ` · defaults v${pending.defaultsVer}` : ''}
              </Typography>

              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip size="small" color="primary" label={`${pending.diff.changed.length} to change`} />
                <Chip size="small" variant="outlined" label={`${pending.diff.same} already match`} />
                {pending.diff.unknown.length > 0 && (
                  <Chip size="small" variant="outlined" color="warning" label={`${pending.diff.unknown.length} not on this vehicle`} />
                )}
                {pending.diff.missing.length > 0 && (
                  <Chip size="small" variant="outlined" label={`${pending.diff.missing.length} absent from file`} />
                )}
              </Stack>

              {pending.badLines.length > 0 && (
                <Alert severity="warning">
                  {pending.badLines.length} line(s) could not be parsed and will be ignored.
                </Alert>
              )}
              {pending.diff.missing.length > 0 && (
                <Alert severity="info" variant="outlined">
                  {pending.diff.missing.length} parameter(s) exist on the vehicle but not in the
                  file. They are <strong>left untouched</strong>, not reset.
                </Alert>
              )}
              {rebootNeeded && (
                <Alert severity="warning">
                  Some changes (<code>PIN_*</code> / <code>ESPNOW_EN</code>) only take effect after
                  a reboot.
                </Alert>
              )}

              {pending.diff.changed.length === 0 ? (
                <Typography variant="body2">
                  Nothing to do — the vehicle already matches this file.
                </Typography>
              ) : (
                <Box sx={{ maxHeight: 320, overflowY: 'auto' }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>Parameter</TableCell>
                        <TableCell align="right">Now</TableCell>
                        <TableCell align="right">From file</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {pending.diff.changed.map((c) => (
                        <TableRow key={c.name}>
                          <TableCell sx={{ fontFamily: 'monospace' }}>{c.name}</TableCell>
                          <TableCell align="right" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                            {c.from ?? '—'}
                          </TableCell>
                          <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{c.to}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
              )}

              {applying && (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Writing {applyDone} / {pending.diff.changed.length} — each one is confirmed by
                    the vehicle before moving on.
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={(applyDone / Math.max(1, pending.diff.changed.length)) * 100}
                    sx={{ mt: 0.5, borderRadius: 2 }}
                  />
                </Box>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPending(null)} disabled={applying}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={doApply}
            disabled={applying || !pending?.diff.changed.length}
          >
            {applying ? 'Writing…' : `Write ${pending?.diff.changed.length ?? 0}`}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
