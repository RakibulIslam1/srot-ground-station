import { useMemo, useState } from 'react'
import {
  Box,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Toolbar,
  Tooltip,
  Typography
} from '@mui/material'
import { useColorScheme } from '@mui/material/styles'
import ScubaDivingIcon from '@mui/icons-material/ScubaDiving'
import TuneIcon from '@mui/icons-material/Tune'
import BuildIcon from '@mui/icons-material/Build'
import TerminalIcon from '@mui/icons-material/Terminal'
import RouteIcon from '@mui/icons-material/Route'
import SettingsInputAntennaIcon from '@mui/icons-material/SettingsInputAntenna'
import ShowChartIcon from '@mui/icons-material/ShowChart'
import DataObjectIcon from '@mui/icons-material/DataObject'
import TravelExploreIcon from '@mui/icons-material/TravelExplore'
import ToysIcon from '@mui/icons-material/Toys'
import SportsEsportsIcon from '@mui/icons-material/SportsEsports'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import LightModeIcon from '@mui/icons-material/LightMode'

import ConnectionBar from './components/ConnectionBar'
import DiveView from './views/DiveView'
import ParamsView from './views/ParamsView'
import SetupView from './views/SetupView'
import TuningView from './views/TuningView'
import ModesView from './views/ModesView'
import AnalyzeView from './views/AnalyzeView'
import InspectorView from './views/InspectorView'
import PayloadView from './views/PayloadView'
import LoraView from './views/LoraView'
import MissionView from './views/MissionView'
import JoystickView from './views/JoystickView'

const NAV = [
  { id: 'dive', label: 'Dive', icon: <ScubaDivingIcon />, el: <DiveView /> },
  { id: 'params', label: 'Parameters', icon: <DataObjectIcon />, el: <ParamsView /> },
  { id: 'setup', label: 'Setup', icon: <BuildIcon />, el: <SetupView /> },
  { id: 'joystick', label: 'Joystick', icon: <SportsEsportsIcon />, el: <JoystickView /> },
  { id: 'tuning', label: 'Tuning', icon: <TuneIcon />, el: <TuningView /> },
  { id: 'modes', label: 'Modes', icon: <TerminalIcon />, el: <ModesView /> },
  { id: 'payload', label: 'Payload', icon: <ToysIcon />, el: <PayloadView /> },
  { id: 'analyze', label: 'Analyze', icon: <ShowChartIcon />, el: <AnalyzeView /> },
  { id: 'inspector', label: 'Inspector', icon: <TravelExploreIcon />, el: <InspectorView /> },
  { id: 'lora', label: 'LoRa', icon: <SettingsInputAntennaIcon />, el: <LoraView /> },
  { id: 'mission', label: 'Mission', icon: <RouteIcon />, el: <MissionView /> }
] as const

const DRAWER_W = 208

export default function App(): JSX.Element {
  const [active, setActive] = useState<string>('dive')
  const { mode, setMode } = useColorScheme()
  const current = useMemo(() => NAV.find((n) => n.id === active) ?? NAV[0], [active])

  return (
    <Box sx={{ display: 'flex', height: '100vh' }}>
      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_W,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: DRAWER_W,
            boxSizing: 'border-box',
            borderRight: (t) => `1px solid ${t.palette.divider}`
          }
        }}
      >
        <Toolbar sx={{ px: 2 }}>
          <Stack direction="row" spacing={1.2} alignItems="center">
            <Box
              sx={{
                width: 30,
                height: 30,
                borderRadius: '50%',
                background: (t) =>
                  `radial-gradient(circle at 30% 30%, ${t.palette.primary.main}, ${t.palette.info.main})`
              }}
            />
            <Typography variant="h6" sx={{ fontWeight: 700, letterSpacing: 1 }}>
              Bondor
            </Typography>
          </Stack>
        </Toolbar>
        <Divider />
        <List sx={{ px: 1 }}>
          {NAV.map((n) => (
            <ListItemButton
              key={n.id}
              selected={active === n.id}
              onClick={() => setActive(n.id)}
              sx={{ borderRadius: 999, mb: 0.5 }}
            >
              <ListItemIcon sx={{ minWidth: 40 }}>{n.icon}</ListItemIcon>
              <ListItemText primary={n.label} primaryTypographyProps={{ fontWeight: 600 }} />
            </ListItemButton>
          ))}
        </List>
        <Box sx={{ flexGrow: 1 }} />
        <Divider />
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ p: 1.5 }}>
          <Typography variant="caption" color="text.secondary">
            SROT Ground Control
          </Typography>
          <Tooltip title={mode === 'dark' ? 'Light mode' : 'Dark mode'}>
            <IconButton size="small" onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')}>
              {mode === 'dark' ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        </Stack>
      </Drawer>

      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <ConnectionBar title={current.label} />
        <Box
          sx={{
            flexGrow: 1,
            minHeight: 0,
            // Dive is a fixed-height cockpit (only its message log scrolls); other tabs scroll.
            overflow: current.id === 'dive' ? 'hidden' : 'auto',
            p: 2,
            bgcolor: 'background.default'
          }}
        >
          {current.el}
        </Box>
      </Box>
    </Box>
  )
}
