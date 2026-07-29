import { useEffect, useRef } from 'react'
import { Box, Card, CardContent, Chip, Stack, Typography } from '@mui/material'
import { useTelemetry } from '../store/telemetry'

// MAV_SEVERITY → colour/label.
const SEV: Record<number, { c: 'error' | 'warning' | 'info' | 'success' | 'default'; l: string }> = {
  0: { c: 'error', l: 'EMERG' },
  1: { c: 'error', l: 'ALERT' },
  2: { c: 'error', l: 'CRIT' },
  3: { c: 'error', l: 'ERR' },
  4: { c: 'warning', l: 'WARN' },
  5: { c: 'info', l: 'NOTICE' },
  6: { c: 'info', l: 'INFO' },
  7: { c: 'default', l: 'DEBUG' }
}

export default function StatusConsole(): JSX.Element {
  const lines = useTelemetry((s) => s.statusText)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [lines.length])

  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ pb: 1 }}>
        <Typography variant="subtitle2" color="text.secondary">
          Messages
        </Typography>
      </CardContent>
      <Box sx={{ flexGrow: 1, overflow: 'auto', px: 2, pb: 2 }}>
        {lines.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            No messages yet.
          </Typography>
        )}
        <Stack spacing={0.75}>
          {lines.map((l, i) => {
            const s = SEV[l.severity] ?? SEV[6]
            return (
              <Stack key={i} direction="row" spacing={1} alignItems="flex-start">
                <Chip size="small" color={s.c} label={s.l} sx={{ minWidth: 64 }} />
                <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-word' }}>
                  {l.text}
                </Typography>
              </Stack>
            )
          })}
          <div ref={endRef} />
        </Stack>
      </Box>
    </Card>
  )
}
