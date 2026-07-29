// Compass / heading indicator (HSI-style): a rotating card under a fixed lubber
// line + nose triangle, showing the vehicle heading like a real flight display.
import { Box, useTheme } from '@mui/material'

interface Props {
  heading: number // degrees 0..360
  size?: number
}

export default function HeadingIndicator({ heading, size = 200 }: Props): JSX.Element {
  const theme = useTheme()
  const c = size / 2
  const r = c - 6
  const fg = theme.palette.text.primary
  const dim = theme.palette.text.secondary
  const accent = theme.palette.primary.main

  const ticks: JSX.Element[] = []
  for (let deg = 0; deg < 360; deg += 10) {
    const major = deg % 30 === 0
    const a = ((deg - 90) * Math.PI) / 180
    const r1 = r
    const r2 = r - (major ? 12 : 7)
    ticks.push(
      <line
        key={deg}
        x1={c + r1 * Math.cos(a)}
        y1={c + r1 * Math.sin(a)}
        x2={c + r2 * Math.cos(a)}
        y2={c + r2 * Math.sin(a)}
        stroke={dim}
        strokeWidth={major ? 1.6 : 0.8}
      />
    )
  }
  const cardinals: [number, string][] = [
    [0, 'N'],
    [90, 'E'],
    [180, 'S'],
    [270, 'W']
  ]

  return (
    <Box sx={{ width: size, height: size, position: 'relative' }}>
      <svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`}>
        <circle cx={c} cy={c} r={r} fill="none" stroke={theme.palette.divider} strokeWidth={2} />
        {/* rotating card */}
        <g transform={`rotate(${-heading} ${c} ${c})`}>
          {ticks}
          {cardinals.map(([deg, label]) => {
            const a = ((deg - 90) * Math.PI) / 180
            const rr = r - 26
            return (
              <text
                key={label}
                x={c + rr * Math.cos(a)}
                y={c + rr * Math.sin(a) + 4}
                textAnchor="middle"
                fontSize={14}
                fontWeight={700}
                fill={label === 'N' ? accent : fg}
              >
                {label}
              </text>
            )
          })}
        </g>
        {/* fixed nose triangle (lubber) */}
        <polygon points={`${c},6 ${c - 8},22 ${c + 8},22`} fill={accent} />
        <circle cx={c} cy={c} r={2.5} fill={fg} />
      </svg>
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          pointerEvents: 'none'
        }}
      >
        <Box sx={{ fontSize: 26, fontWeight: 800, lineHeight: 1 }}>{heading.toFixed(0)}°</Box>
        <Box sx={{ fontSize: 11, color: 'text.secondary' }}>HDG</Box>
      </Box>
    </Box>
  )
}
