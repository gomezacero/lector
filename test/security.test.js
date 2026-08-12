import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { isExternalUrl, isPathInside } from '../electron/security.js'

describe('fronteras del proceso principal', () => {
  it('solo abre protocolos externos deliberados', () => {
    expect(isExternalUrl('https://example.com')).toBe(true)
    expect(isExternalUrl('mailto:lector@example.com')).toBe(true)
    expect(isExternalUrl('file:///etc/passwd')).toBe(false)
    expect(isExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isExternalUrl('custom://payload')).toBe(false)
  })

  it('distingue descendientes de rutas que solo comparten prefijo', () => {
    const root = path.resolve('datos')
    expect(isPathInside(root, path.join(root, 'books', 'a.json'))).toBe(true)
    expect(isPathInside(root, `${root}-copia`)).toBe(false)
  })
})

