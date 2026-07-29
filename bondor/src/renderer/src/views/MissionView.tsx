import Placeholder from '../components/Placeholder'

export default function MissionView(): JSX.Element {
  return (
    <Placeholder title="Mission" phase="Queued">
      Mission editor + LoRa round-trip (ground station ↔ control board ↔ Jetson): pull the Jetson's
      last mission, edit on a map, redeploy. Held in the queue per plan; the tab is a placeholder for
      now.
    </Placeholder>
  )
}
