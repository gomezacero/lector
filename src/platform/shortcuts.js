// Etiquetas de atajos visibles. Electron resuelve CmdOrCtrl en el menu; el
// renderer usa este modulo para no prometer "Ctrl" en macOS.

export function shortcutLabel (key, platform = navigator.platform) {
  const mac = /Mac|iPhone|iPad/.test(platform)
  return mac ? `⌘${key}` : `Ctrl+${key}`
}

export function applyShortcutLabels (root = document, platform = navigator.platform) {
  const labels = {
    'hud-library': `Biblioteca (${shortcutLabel('L', platform)})`,
    'hud-settings': `Ajustes (${shortcutLabel(',', platform)})`,
    'hud-notes': `Notas (${shortcutLabel('B', platform)})`
  }
  for (const [id, title] of Object.entries(labels)) {
    const element = root.getElementById(id)
    if (element) element.title = title
  }
}

