// Simple SVG artificial horizon (roll + pitch) with a heading readout.
import { Box } from '@mui/material'

interface Props {
  roll: number // rad
  pitch: number // rad
  size?: number
}

export default function AttitudeIndicator({ roll, pitch, size = 220 }: Props): JSX.Element {
  const rollDeg = (roll * 180) / Math.PI
  const pitchDeg = (pitch * 180) / Math.PI
  // pixels per degree of pitch on the moving horizon
  const ppd = size / 60
  const horizonY = pitchDeg * ppd

  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        position: 'relative',
        border: (t) => `2px solid ${t.palette.divider}`,
        boxShadow: 3
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          transform: `rotate(${-rollDeg}deg)`,
          transformOrigin: '50% 50%'
        }}
      >
        <svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`}>
          <g transform={`translate(0, ${horizonY})`}>
            <rect x={-size} y={-size * 2} width={size * 3} height={size * 2} fill="#4a7fb5" />
            <rect x={-size} y={0} width={size * 3} height={size * 2} fill="#8a6a45" />
            <line x1={-size} y1={0} x2={size * 2} y2={0} stroke="#fff" strokeWidth={2} />
            {[-30, -20, -10, 10, 20, 30].map((d) => (
              <g key={d}>
                <line
                  x1={size / 2 - 22}
                  y1={-d * ppd}
                  x2={size / 2 + 22}
                  y2={-d * ppd}
                  stroke="#ffffffaa"
                  strokeWidth={1.5}
                />
                <text x={size / 2 + 28} y={-d * ppd + 4} fill="#ffffffcc" fontSize={10}>
                  {Math.abs(d)}
                </text>
              </g>
            ))}
          </g>
        </svg>
      </Box>

      {/* fixed aircraft reference */}
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${size} ${size}`}
        style={{ position: 'absolute', inset: 0 }}
      >
        <line
          x1={size / 2 - 40}
          y1={size / 2}
          x2={size / 2 - 12}
          y2={size / 2}
          stroke="#FFD54F"
          strokeWidth={3}
        />
        <line
          x1={size / 2 + 12}
          y1={size / 2}
          x2={size / 2 + 40}
          y2={size / 2}
          stroke="#FFD54F"
          strokeWidth={3}
        />
        <circle cx={size / 2} cy={size / 2} r={3} fill="#FFD54F" />
      </svg>

      <Box
        sx={{
          position: 'absolute',
          bottom: 6,
          left: 0,
          right: 0,
          textAlign: 'center',
          color: '#fff',
          fontSize: 11,
          fontWeight: 700,
          textShadow: '0 1px 2px #000'
        }}
      >
        R {rollDeg.toFixed(0)}° · P {pitchDeg.toFixed(0)}°
      </Box>
    </Box>
  )
}
