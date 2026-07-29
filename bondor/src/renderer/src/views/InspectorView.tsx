import { useEffect, useMemo, useState } from 'react'
import {
  Box,
  Card,
  CardContent,
  Chip,
  List,
  ListItemButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableRow,
  Typography
} from '@mui/material'
import { inspector } from '../store/telemetry'

export default function InspectorView(): JSX.Element {
  const msgHz = inspector.hz
  const msgFields = inspector.fields
  const [selected, setSelected] = useState<string>('')
  // Re-render ~3 Hz so ages/rates/fields stay live (registry is non-reactive).
  const [tick, force] = useState(0)
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 333)
    return () => clearInterval(t)
  }, [])

  const names = useMemo(() => Object.keys(msgFields).sort(), [msgFields, tick])
  const active = selected && msgFields[selected] ? selected : names[0]
  const fields = active ? msgFields[active] : undefined

  return (
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '260px 1fr' }, height: '100%' }}>
      <Card sx={{ minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <CardContent sx={{ pb: 0 }}>
          <Typography variant="subtitle2" color="text.secondary">
            Messages ({names.length})
          </Typography>
        </CardContent>
        <Box sx={{ overflow: 'auto', flex: 1 }}>
          <List dense>
            {names.map((n) => (
              <ListItemButton key={n} selected={active === n} onClick={() => setSelected(n)} sx={{ borderRadius: 2, mx: 1 }}>
                <Stack direction="row" justifyContent="space-between" sx={{ width: '100%' }}>
                  <Typography variant="body2" noWrap>
                    {n}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {(msgHz[n] ?? 0).toFixed(1)} Hz
                  </Typography>
                </Stack>
              </ListItemButton>
            ))}
          </List>
        </Box>
      </Card>

      <Card sx={{ minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <CardContent>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Typography variant="h6">{active ?? '—'}</Typography>
            {active && <Chip size="small" variant="outlined" label={`${(msgHz[active] ?? 0).toFixed(1)} Hz`} />}
          </Stack>
        </CardContent>
        <Box sx={{ overflow: 'auto', flex: 1, px: 2, pb: 2 }}>
          {fields ? (
            <Table size="small">
              <TableBody>
                {Object.entries(fields).map(([k, v]) => (
                  <TableRow key={k}>
                    <TableCell sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>{k}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace' }}>
                      {Array.isArray(v) ? `[${v.join(', ')}]` : String(v)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No messages yet.
            </Typography>
          )}
        </Box>
      </Card>
    </Box>
  )
}
