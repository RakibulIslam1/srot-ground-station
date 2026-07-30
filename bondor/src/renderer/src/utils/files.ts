// =============================================================================
//  Small file in/out helpers for the renderer.
//
//  Deliberately NOT an IPC round-trip to the main process: a Blob + <a download>
//  and a hidden <input type="file"> do the job with no new preload surface to
//  audit. Electron routes the download to the user's Downloads folder.
// =============================================================================

/** Save `text` as a download named `name`. */
export function downloadText(text: string, name: string, type = 'text/plain'): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Prompt for a file and resolve its text. Resolves null if the user cancels.
 *
 * `accept` is a hint only — a determined user can still pick anything, so the
 * caller must validate the CONTENT rather than trusting the extension.
 */
export function pickTextFile(accept = '.params,.txt'): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    // Chromium fires no event on cancel, so this promise can simply never settle.
    // That is fine here (the caller just never opens the dialog) and avoids the
    // false "cancelled" a focus-based heuristic produces on a slow file picker.
    input.onchange = () => {
      const f = input.files?.[0]
      if (!f) {
        resolve(null)
        return
      }
      const r = new FileReader()
      r.onload = () => resolve({ name: f.name, text: String(r.result ?? '') })
      r.onerror = () => resolve(null)
      r.readAsText(f)
    }
    input.click()
  })
}
