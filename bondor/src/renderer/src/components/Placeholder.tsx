import { Box, Card, CardContent, Chip, Stack, Typography } from '@mui/material'

export default function Placeholder({
  title,
  phase,
  children
}: {
  title: string
  phase: string
  children?: React.ReactNode
}): JSX.Element {
  return (
    <Box sx={{ maxWidth: 720 }}>
      <Card>
        <CardContent>
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="h6">{title}</Typography>
            <Chip size="small" variant="outlined" label={phase} />
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {children ?? 'Coming in a later phase.'}
          </Typography>
        </CardContent>
      </Card>
    </Box>
  )
}
