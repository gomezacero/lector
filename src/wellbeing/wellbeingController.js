const IDLE_MS = 90_000
const SAVE_EVERY_MS = 30_000

export function createWellbeingController ({ clock = globalThis, documentRef = globalThis.document, onBreak, onStats }) {
  let intervalMinutes = 0
  let collectStats = false
  let stats = { activeMs: 0, sessions: 0, breaks: 0 }
  let sinceBreak = 0
  let lastTick = 0
  let lastActivity = 0
  let lastSave = 0
  let pendingBreak = false
  let pausedUntil = 0
  let timer = null

  function start ({ interval = 0, collect = false, initialStats = null } = {}) {
    stop(false)
    intervalMinutes = [20, 30, 40].includes(Number(interval)) ? Number(interval) : 0
    collectStats = Boolean(collect)
    stats = initialStats && typeof initialStats === 'object'
      ? { activeMs: initialStats.activeMs ?? 0, sessions: initialStats.sessions ?? 0, breaks: initialStats.breaks ?? 0 }
      : { activeMs: 0, sessions: 0, breaks: 0 }
    if (collectStats) stats.sessions++
    lastTick = lastActivity = lastSave = Date.now()
    timer = clock.setInterval(tick, 1000)
  }

  function activity (at = Date.now()) { lastActivity = at }

  function tick (at = Date.now()) {
    const delta = Math.max(0, Math.min(5000, at - lastTick))
    lastTick = at
    const active = !documentRef?.hidden && at >= pausedUntil && at - lastActivity <= IDLE_MS
    if (!active) return
    sinceBreak += delta
    if (collectStats) stats.activeMs += delta
    if (intervalMinutes && sinceBreak >= intervalMinutes * 60_000) pendingBreak = true
    if (collectStats && at - lastSave >= SAVE_EVERY_MS) {
      lastSave = at
      onStats?.({ ...stats })
    }
  }

  // Se llama despues de actualizar una unidad; asi un aviso nunca la parte.
  function boundary () {
    if (!pendingBreak) return false
    pendingBreak = false
    sinceBreak = 0
    onBreak?.()
    return true
  }

  function pauseFor (milliseconds) {
    pausedUntil = Date.now() + Math.max(0, milliseconds)
    stats.breaks++
    if (collectStats) onStats?.({ ...stats })
  }

  function postpone (minutes = 5) {
    sinceBreak = Math.max(0, sinceBreak - minutes * 60_000)
  }

  function configure ({ interval, collect }) {
    intervalMinutes = [20, 30, 40].includes(Number(interval)) ? Number(interval) : 0
    collectStats = Boolean(collect)
    if (!intervalMinutes) pendingBreak = false
  }

  function stop (flush = true) {
    if (timer) clock.clearInterval(timer)
    timer = null
    if (flush && collectStats) onStats?.({ ...stats })
  }

  function resetStats () {
    stats = { activeMs: 0, sessions: collectStats ? 1 : 0, breaks: 0 }
    lastSave = Date.now()
  }

  return { start, stop, tick, activity, boundary, pauseFor, postpone, configure, resetStats, get stats () { return { ...stats } } }
}
