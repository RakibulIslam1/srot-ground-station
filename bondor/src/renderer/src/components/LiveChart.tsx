// Lightweight rolling multi-series line chart (SVG, no deps). Samples a getter
// on an interval and auto-scales. Used by Tuning (attitude response) and Analyze.
import { useEffect, useRef, useState } from 'react'
import { Box, Stack, Typography, useTheme } from '@mui/material'

export interface Series {
  key: string
  label: string
  color: string
}

interface Props {
  series: Series[]
  sample: () => Record<string, number>
  windowSec?: number
  hz?: number
  height?: number
  symmetric?: boolean // scale around 0
}

export default function LiveChart({
  series,
  sample,
  windowSec = 10,
  hz = 20,
  height = 180,
  symmetric = false
}: Props): JSX.Element {
  const cap = Math.max(2, Math.round(windowSec * hz))
  const buf = useRef<Record<string, number>[]>([])
  const [, tick] = useState(0)
  const theme = useTheme()

  useEffect(() => {
    const t = setInterval(() => {
      buf.current.push(sample())
      if (buf.current.length > cap) buf.current.shift()
      tick((n) => (n + 1) % 100000)
    }, 1000 / hz)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cap, hz])

  const data = buf.current
  const W = 600
  const H = height
  let min = Infinity
  let max = -Infinity
  for (const row of data)
    for (const s of series) {
      const v = row[s.key]
      if (Number.isFinite(v)) {
        if (v < min) min = v
        if (v > max) max = v
      }
    }
  if (!Number.isFinite(min)) {
    min = -1
    max = 1
  }
  if (symmetric) {
    const m = Math.max(Math.abs(min), Math.abs(max), 1e-6)
    min = -m
    max = m
  }
  if (max - min < 1e-6) {
    max += 1
    min -= 1
  }
  const x = (i: number): number => (data.length <= 1 ? 0 : (i / (data.length - 1)) * W)
  const y = (v: number): number => H - ((v - min) / (max - min)) * H

  return (
    <Box>
      <Box sx={{ width: '100%', border: (t) => `1px solid ${t.palette.divider}`, borderRadius: 2, overflow: 'hidden' }}>
        <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          <line x1={0} y1={y(0)} x2={W} y2={y(0)} stroke={theme.palette.divider} strokeWidth={1} />
          {series.map((s) => {
            const pts = data
              .map((row, i) => (Number.isFinite(row[s.key]) ? `${x(i)},${y(row[s.key])}` : ''))
              .filter(Boolean)
              .join(' ')
            return <polyline key={s.key} points={pts} fill="none" stroke={s.color} strokeWidth={1.6} />
          })}
        </svg>
      </Box>
      <Stack direction="row" spacing={2} sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
        {series.map((s) => (
          <Stack key={s.key} direction="row" spacing={0.5} alignItems="center">
            <Box sx={{ width: 12, height: 3, bgcolor: s.color, borderRadius: 2 }} />
            <Typography variant="caption" color="text.secondary">
              {s.label} {data.length ? (data[data.length - 1][s.key] ?? 0).toFixed(2) : '—'}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Box>
  )
}
