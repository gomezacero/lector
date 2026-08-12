import { describe, it, expect } from 'vitest'
import { refineStructuredNonfiction } from '../src/pdf/nonfiction.js'

const block = (text, page, extra = {}) => ({
  type: extra.type ?? 'paragraph', text, page, start: extra.start ?? 0,
  rects: [{ page, x: 50, y: extra.y ?? 120, w: 450, h: 12 }],
  ...(extra.role ? { role: extra.role } : {})
})

function fixture () {
  return [
    block('PORTADA', 0, { role: 'cover' }),
    block('ÍNDICE', 1, { role: 'toc' }),
    block('PRIMERA PARTE TÉCNICAS FUNDAMENTALES', 1, { role: 'toc' }),
    block('1. Primer capítulo 2. Segundo capítulo', 1, { role: 'toc' }),
    block('SEGUNDA PARTE SEIS MANERAS', 1, { role: 'toc' }),
    block('1. Otro capítulo 2. Último capítulo', 1, { role: 'toc' }),
    block('OCHO OBJETIVOS QUE ESTE LIBRO AYUDARÁ A LOGRAR', 2),
    block('Texto preliminar.', 2),
    block('PREFACIO A LA EDICIÓN REVISADA', 3),
    block('Texto del prefacio.', 3),
    block('PRIMERA PARTE', 4),
    block('TÉCNICAS FUNDAMENTALES', 4),
    block('1', 4, { y: 180, type: 'heading' }),
    block('PRIMER CAPITULO', 4),
    block('Una línea que el OCR clasificó como título.', 4, { type: 'heading' }),
    block('2', 5, { y: 300, type: 'heading' }),
    block('SEGUNDO CAPÍTULO', 5),
    block('Texto.', 5),
    block('SEGUNDA PARTE', 6),
    block('SEIS MANERAS', 6),
    block('1', 6, { y: 190, type: 'heading' }),
    block('OTRO CAPÍTULO', 6),
    block('Texto.', 6),
    block('2', 7, { y: 400, type: 'heading' }),
    block('ÚLTIMO CAPÍTULO', 7),
    block('Texto final.', 7),
    block('UN BREVE CAMINO HACIA LA DISTINCIÓN por Autor', 8),
    block('Apéndice.', 8),
    block('CURSOS DALE CARNEGIE', 9),
    block('Promoción.', 9)
  ]
}

describe('jerarquía de no ficción', () => {
  it('recupera partes y capítulos, y aparta preliminares y suplementos', () => {
    const blocks = fixture()
    const result = refineStructuredNonfiction({ blocks, bodyStart: 2 })

    expect(result).not.toBeNull()
    expect(result.chapters.filter(chapter => !chapter.kind).map(chapter => chapter.title)).toEqual([
      '1. Primer capítulo', '2. Segundo capítulo', '1. Otro capítulo', '2. Último capítulo'
    ])
    expect(result.chapters.filter(chapter => !chapter.kind).map(chapter => chapter.part)).toEqual([
      'Primera parte — Técnicas fundamentales', 'Primera parte — Técnicas fundamentales',
      'Segunda parte — Seis maneras', 'Segunda parte — Seis maneras'
    ])
    expect(result.chapters.filter(chapter => chapter.kind === 'frontmatter')).toHaveLength(2)
    expect(result.chapters.filter(chapter => chapter.kind === 'supplement')).toHaveLength(2)
    expect(result.bodyEnd).toBe(26)
  })

  it('demueve líneas de prosa que el OCR confundió con títulos', () => {
    const result = refineStructuredNonfiction({ blocks: fixture(), bodyStart: 2 })
    expect(result.blocks.find(block => block.text === 'Una línea que el OCR clasificó como título.').type).toBe('paragraph')
    expect(result.blocks.find(block => block.text === 'PRIMER CAPÍTULO').type).toBe('heading')
  })

  it('no actúa ante números sueltos sin partes coherentes', () => {
    const blocks = Array.from({ length: 30 }, (_, index) => block(`Texto ${index}`, index))
    expect(refineStructuredNonfiction({ blocks, bodyStart: 0 })).toBeNull()
  })
})
