// =============================================================================
//  Bondor theme — Material Design 3 flavour, light-purple. Light + dark schemes
//  via MUI v6 colorSchemes (CSS variables). Clean, rounded, tonal — no sci-fi.
// =============================================================================

import { createTheme } from '@mui/material/styles'

// M3-ish purple tones.
const purple = {
  primaryLight: '#6750A4',
  primaryDark: '#D0BCFF',
  secondaryLight: '#625B71',
  secondaryDark: '#CCC2DC',
  tertiaryLight: '#7D5260',
  tertiaryDark: '#EFB8C8'
}

export const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'class' },
  shape: { borderRadius: 14 },
  typography: {
    fontFamily:
      '"Segoe UI", Roboto, "Helvetica Neue", system-ui, -apple-system, sans-serif',
    h6: { fontWeight: 600, letterSpacing: 0.15 },
    subtitle2: { fontWeight: 600 },
    button: { textTransform: 'none', fontWeight: 600, letterSpacing: 0.1 }
  },
  colorSchemes: {
    light: {
      palette: {
        mode: 'light',
        primary: { main: purple.primaryLight },
        secondary: { main: purple.secondaryLight },
        info: { main: purple.tertiaryLight },
        background: { default: '#FEF7FF', paper: '#F7F2FA' },
        success: { main: '#386A20' },
        warning: { main: '#8C5000' },
        error: { main: '#B3261E' }
      }
    },
    dark: {
      palette: {
        mode: 'dark',
        primary: { main: purple.primaryDark },
        secondary: { main: purple.secondaryDark },
        info: { main: purple.tertiaryDark },
        background: { default: '#141218', paper: '#1D1B20' },
        success: { main: '#B7F397' },
        warning: { main: '#FFB868' },
        error: { main: '#F2B8B5' }
      }
    }
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' }
      }
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: ({ theme }) => ({
          border: `1px solid ${theme.palette.divider}`,
          borderRadius: 18
        })
      }
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { borderRadius: 999, paddingInline: 18 } }
    },
    MuiChip: {
      styleOverrides: { root: { fontWeight: 600 } }
    }
  }
})
