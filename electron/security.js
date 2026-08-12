import path from 'node:path'

export function isExternalUrl (url) {
  try {
    const protocol = new URL(url).protocol
    return protocol === 'https:' || protocol === 'http:' || protocol === 'mailto:'
  } catch {
    return false
  }
}

/** True si candidate es root o un descendiente real, no solo un prefijo. */
export function isPathInside (root, candidate) {
  const base = path.resolve(root)
  const target = path.resolve(candidate)
  return target === base || target.startsWith(base + path.sep)
}

