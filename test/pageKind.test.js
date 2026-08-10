import { describe, it, expect } from 'vitest'
import { classifyPage } from '../src/pdf/pageKind.js'

// Una pagina carta, como las que produce el generador de fixtures.
const PAGE = { width: 612, height: 792 }

const item = (text, { rotated = false } = {}) => ({ text, rotated })
const fullImage = { x: 0, y: 0, w: 612, h: 792, image: true }

const parrafo = 'Las palabras de una pagina corriente de prosa, con espacios y todo. '.repeat(30)

describe('classifyPage', () => {
  it('una pagina de prosa es texto', () => {
    const { kind } = classifyPage({ ...PAGE, items: [item(parrafo)] })
    expect(kind).toBe('text')
  })

  it('una imagen a pagina completa sin texto es un escaneo', () => {
    const { kind, imageShare } = classifyPage({ ...PAGE, items: [], images: [fullImage] })
    expect(kind).toBe('scanned')
    expect(imageShare).toBeCloseTo(1)
  })

  it('el folio estampado sobre el escaneo no lo convierte en texto', () => {
    const { kind } = classifyPage({ ...PAGE, items: [item('123')], images: [fullImage] })
    expect(kind).toBe('scanned')
  })

  it('las tiras de escaner suman como una sola imagen', () => {
    // Algunos escaneres parten la pagina en franjas horizontales.
    const tiras = [0, 1, 2, 3].map(i => ({ x: 0, y: i * 198, w: 612, h: 198, image: true }))
    const { kind } = classifyPage({ ...PAGE, items: [], images: tiras })
    expect(kind).toBe('scanned')
  })

  it('un escaneado con capa OCR previa es texto: ya se puede leer', () => {
    const { kind } = classifyPage({ ...PAGE, items: [item(parrafo)], images: [fullImage] })
    expect(kind).toBe('text')
  })

  it('una lamina con su pie es mixta', () => {
    const pie = 'Figura 3. El aparato experimental visto desde arriba, con sus valvulas.'
    const { kind } = classifyPage({ ...PAGE, items: [item(pie)], images: [fullImage] })
    expect(kind).toBe('mixed')
  })

  it('una pagina sin nada, o solo con el folio, esta vacia', () => {
    expect(classifyPage({ ...PAGE, items: [] }).kind).toBe('empty')
    expect(classifyPage({ ...PAGE, items: [item('23')] }).kind).toBe('empty')
  })

  it('el texto girado no cuenta como legible', () => {
    // Una marca de agua diagonal sobre un escaneo.
    const marca = item('COPIA PARA REVISIÓN NO DISTRIBUIR MATERIAL CONFIDENCIAL', { rotated: true })
    const { kind } = classifyPage({ ...PAGE, items: [marca], images: [fullImage] })
    expect(kind).toBe('scanned')
  })

  it('una fuente sin Unicode fiable deja la pagina como sospechosa', () => {
    const roto = item('c�digo con caract�res il�gibles por t�da la p�gina de este lib�o')
    const { kind } = classifyPage({ ...PAGE, items: [roto] })
    expect(kind).toBe('suspect')
  })

  it('un caracter suelto sin correspondencia no alarma a nadie', () => {
    const { kind } = classifyPage({ ...PAGE, items: [item(parrafo + '�')] })
    expect(kind).toBe('text')
  })

  it('recorta las imagenes que se salen de la pagina', () => {
    // Una imagen colocada casi entera fuera del papel no cubre la pagina.
    const fuera = { x: 500, y: 0, w: 612, h: 792, image: true }
    const { kind, imageShare } = classifyPage({ ...PAGE, items: [], images: [fuera] })
    expect(imageShare).toBeLessThan(0.25)
    expect(kind).toBe('empty')
  })
})
