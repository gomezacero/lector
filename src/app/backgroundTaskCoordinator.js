// Ciclo de vida comun para OCR, layout y futuros trabajos por documento.
// Cada sesion recibe un token: un callback tardio del libro anterior queda
// descartado incluso si la cancelacion del motor no puede interrumpirlo.

/** @typedef {{generation:number,key:string|null}} TaskToken */
/** @typedef {{start:()=>unknown|Promise<unknown>,cancel?:()=>void}} BackgroundTask */

export function createBackgroundTaskCoordinator () {
  let generation = 0
  /** @type {string|null} */
  let sessionKey = null
  /** @type {Map<string, {task:BackgroundTask,candidate:TaskToken}>} */
  const active = new Map()

  /** @param {string} key */
  function beginSession (key) {
    cancelAll()
    sessionKey = key
    generation++
    return token()
  }

  /** @returns {TaskToken} */
  const token = () => ({ generation, key: sessionKey })
  /** @param {TaskToken|null|undefined} candidate */
  const isCurrent = candidate => Boolean(candidate &&
    candidate.generation === generation && candidate.key === sessionKey)

  /**
   * @param {TaskToken} candidate
   * @param {(...args:any[])=>any} fn
   */
  function guard (candidate, fn) {
    /** @param {any[]} args */
    return (...args) => {
      if (!isCurrent(candidate)) return undefined
      return fn(...args)
    }
  }

  /** @param {string} name @param {BackgroundTask} task @param {TaskToken} candidate */
  function start (name, task, candidate = token()) {
    if (!isCurrent(candidate)) return Promise.resolve(false)
    cancel(name)
    active.set(name, { task, candidate })

    const run = Promise.resolve().then(() => task.start())
    run.finally(() => {
      if (active.get(name)?.task === task) active.delete(name)
    }).catch(() => {})
    return run
  }

  /** @param {string} name */
  function cancel (name) {
    const entry = active.get(name)
    if (!entry) return
    active.delete(name)
    entry.task?.cancel?.()
  }

  function cancelAll () {
    for (const name of [...active.keys()]) cancel(name)
  }

  function endSession () {
    cancelAll()
    sessionKey = null
    generation++
  }

  return {
    beginSession,
    endSession,
    token,
    isCurrent,
    guard,
    start,
    cancel,
    cancelAll,
    /** @param {string} name */
    has: name => active.has(name),
    get sessionKey () { return sessionKey }
  }
}
