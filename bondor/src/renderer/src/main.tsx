import React from 'react'
import ReactDOM from 'react-dom/client'
import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
import { theme } from './theme/theme'
import { wireTelemetry } from './store/telemetry'
import App from './App'

wireTelemetry()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider theme={theme} defaultMode="dark">
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>
)
