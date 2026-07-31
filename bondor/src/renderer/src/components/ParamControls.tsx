// Reusable parameter editing widgets driven by the SROT metadata layer. Used by
// the Parameters view (all groups) and embedded in Setup (selected groups).
import { useMemo, useState } from 'react'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Chip,
  MenuItem,
  Stack,
  TextField,
  Typography
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { useTelemetry } from '../store/telemetry'
import { GROUP_ORDER, getParamMeta } from '../metadata/srotParams'

export function ParamRow({ name }: { name: string }): JSX.Element {
  const value = useTelemetry((s) => s.paramValues[name])
  const setParam = useTelemetry((s) => s.setParam)
  const meta = getParamMeta(name)
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)

  const shown = editing ? draft : value?.toFixed?.(meta.decimals ?? 3) ?? String(value ?? '')
  // Arrow-key / spinner increment. meta.step was declared for a dozen parameters but nothing
  // read it, so every field stepped by the browser default of 1 — useless on a calibration
  // trim that needs hundredths. Fall back to one unit in the last displayed decimal, which is
  // the finest change the field can actually show.
  const step = meta.step ?? 10 ** -(meta.decimals ?? 3)
  const commit = (v: number, raw?: string): void => {
    // Number('') is 0, not NaN, so a blanked field would silently write 0 — on a divider
    // ratio or a failsafe threshold that is not a harmless default.
    if (raw !== undefined && raw.trim() === '') {
      setEditing(false)
      return
    }
    if (Number.isFinite(v)) setParam(name, v)
    setEditing(false)
  }

  return (
    <Stack direction="row" alignItems="center" spacing={2} sx={{ py: 0.75 }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" noWrap>
          {meta.label}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap>
          {name}
          {meta.help ? ` · ${meta.help}` : ''}
        </Typography>
      </Box>
      {meta.options ? (
        <TextField select size="small" value={value ?? ''} onChange={(e) => commit(Number(e.target.value))} sx={{ width: 190 }}>
          {meta.options.map((o) => (
            <MenuItem key={o.value} value={o.value}>
              {o.label}
            </MenuItem>
          ))}
        </TextField>
      ) : (
        <TextField
          size="small"
          type="number"
          value={shown}
          onFocus={() => {
            setEditing(true)
            setDraft(String(value ?? ''))
          }}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit(Number(draft), draft)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit(Number(draft), draft)
          }}
          inputProps={{ step, min: meta.min, max: meta.max }}
          InputProps={{
            endAdornment: meta.unit ? (
              <Typography variant="caption" color="text.secondary">
                {meta.unit}
              </Typography>
            ) : undefined
          }}
          sx={{ width: 150 }}
        />
      )}
    </Stack>
  )
}

// Render accordions for the given groups (default: all, in GROUP_ORDER). `search`
// filters by name/label. `defaultOpen` opens matching group(s).
export function ParamGroups({
  groups,
  search = '',
  defaultOpen
}: {
  groups?: string[]
  search?: string
  defaultOpen?: string
}): JSX.Element {
  const paramValues = useTelemetry((s) => s.paramValues)
  const names = useMemo(() => Object.keys(paramValues), [paramValues])

  const grouped = useMemo(() => {
    const q = search.trim().toUpperCase()
    const allow = groups ? new Set(groups) : null
    const byGroup: Record<string, string[]> = {}
    for (const n of names) {
      const meta = getParamMeta(n)
      if (allow && !allow.has(meta.group)) continue
      if (q && !n.toUpperCase().includes(q) && !meta.label.toUpperCase().includes(q)) continue
      ;(byGroup[meta.group] ??= []).push(n)
    }
    for (const g of Object.keys(byGroup)) byGroup[g].sort()
    return byGroup
  }, [names, search, groups])

  const order = (groups ?? GROUP_ORDER).filter((g) => grouped[g]?.length)
  if (names.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        Load parameters (Parameters tab) to configure these.
      </Typography>
    )
  }

  return (
    <>
      {order.map((g) => (
        <Accordion
          key={g}
          disableGutters
          defaultExpanded={defaultOpen ? g === defaultOpen : order.length <= 3}
          sx={{ mb: 1, borderRadius: 2, '&:before': { display: 'none' } }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography sx={{ fontWeight: 600 }}>{g}</Typography>
            <Chip size="small" label={grouped[g].length} sx={{ ml: 1.5 }} />
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0 }}>
            {grouped[g].map((n) => (
              <ParamRow key={n} name={n} />
            ))}
          </AccordionDetails>
        </Accordion>
      ))}
    </>
  )
}
