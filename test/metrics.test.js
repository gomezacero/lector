// La estadistica de andar por casa sobre la que se apoyan TODAS las
// heuristicas del pipeline. Un cambio sutil aqui mueve margenes, sangrias y
// cuerpos de letra en todos los libros a la vez.

import { describe, it, expect } from 'vitest'
import { median, percentile, mode, marginLeft } from '../src/pdf/metrics.js'

describe('median', () => {
  it('devuelve 0 sin valores', () => {
    expect(median([])).toBe(0)
  })

  it('con cantidad impar devuelve el central', () => {
    expect(median([9, 1, 5])).toBe(5)
  })

  it('con cantidad par promedia los dos centrales', () => {
    expect(median([1, 3, 5, 9])).toBe(4)
  })

  it('no reordena la lista original', () => {
    const values = [3, 1, 2]
    median(values)
    expect(values).toEqual([3, 1, 2])
  })
})

describe('percentile', () => {
  it('devuelve 0 sin valores', () => {
    expect(percentile([], 0.5)).toBe(0)
  })

  it('elige el valor en la posicion pedida', () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
    expect(percentile(values, 0.9)).toBe(100)
    expect(percentile(values, 0.1)).toBe(20)
  })

  it('no se sale de la lista con p = 1', () => {
    expect(percentile([1, 2, 3], 1)).toBe(3)
  })
})

describe('mode', () => {
  it('devuelve el valor mas frecuente', () => {
    expect(mode([12, 12, 12, 14, 14])).toBe(12)
  })

  it('agrupa en cubos el ruido decimal', () => {
    expect(mode([11.9, 12.1, 12.05, 20], 1)).toBe(12)
  })

  it('los pesos cuentan mas que las apariciones', () => {
    expect(mode([12, 14], 1, [1, 10])).toBe(14)
  })
})

describe('marginLeft', () => {
  it('ignora una linea suelta que asoma mas a la izquierda', () => {
    // Nueve lineas en el margen real y una intrusa de otra columna: el minimo
    // a secas daria 10 y todas las demas pareceran sangradas.
    const values = [10, 72, 72, 72, 72, 72, 72, 72, 72, 72]
    expect(marginLeft(values)).toBe(72)
  })

  it('con sangrias frecuentes elige el margen menor con presencia real', () => {
    const values = [72, 72, 72, 90, 90, 90]
    expect(marginLeft(values)).toBe(72)
  })

  it('sin ningun valor frecuente cae al percentil bajo', () => {
    // Diez valores todos distintos: ninguno llega al 12% de presencia.
    const values = [10, 30, 50, 70, 90, 110, 130, 150, 170, 190]
    expect(marginLeft(values)).toBe(percentile(values, 0.1))
  })

  it('devuelve 0 sin valores', () => {
    expect(marginLeft([])).toBe(0)
  })
})
