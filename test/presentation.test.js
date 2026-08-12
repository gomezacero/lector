import { describe, it, expect } from 'vitest'
import { findBodyEnd, refineBookPresentation, resolveBookIdentity } from '../src/pdf/presentation.js'

const blocks = [
  { type: 'heading', text: 'Gabriel García Márquez', role: 'cover', page: 0, start: 0 },
  { type: 'heading', text: 'Cien años de soledad', role: 'cover', page: 0, start: 23 },
  { type: 'paragraph', text: 'Para Jomi García Ascot', page: 1, start: 44 },
  { type: 'paragraph', text: 'y María Luisa Elio', page: 1, start: 67 },
  { type: 'heading', text: 'I', page: 2, start: 86 },
  { type: 'paragraph', text: 'Muchos años después...', page: 2, start: 88 },
  { type: 'heading', text: 'II', page: 9, start: 112 },
  { type: 'paragraph', text: 'El coronel...', page: 9, start: 115 },
  { type: 'paragraph', text: 'I ........ 3 II ........ 12', role: 'toc', page: 172, start: 130 }
]

const chapters = [
  { title: 'Gabriel García Márquez', start: 0, end: 1 },
  { title: 'Cien años de soledad', start: 1, end: 4 },
  { title: 'I', start: 4, end: 6 },
  { title: 'II', start: 6, end: 9 }
]

describe('presentacion editorial de novelas', () => {
  it('prefiere la identidad visible de la portada a metadatos del creador', () => {
    expect(resolveBookIdentity({
      title: 'García Márquez - Cien años de soledad',
      author: 'Patricio',
      blocks
    })).toEqual({ title: 'Cien años de soledad', author: 'Gabriel García Márquez' })
  })

  it('une un título de portada repartido antes del autor aunque el metadato difiera', () => {
    const cover = [
      { text: 'CÓMO GANAR AMIGOS', role: 'cover' },
      { text: 'E INFLUIR SOBRE', role: 'cover' },
      { text: 'LAS PERSONAS', role: 'cover' },
      { text: 'DALE CARNEGIE', role: 'cover' }
    ]
    expect(resolveBookIdentity({
      title: 'LIBRO Carnegie Dale Cómo ganar amigos e influir en las personas',
      blocks: cover
    })).toEqual({
      title: 'Cómo ganar amigos e influir sobre las personas',
      author: 'Dale Carnegie'
    })
  })

  it('recupera el autor de una ficha editorial cuando la portada es una imagen', () => {
    const credits = [
      { type: 'heading', text: 'Nuestra señora de París', role: 'credits', page: 1, start: 0 },
      { type: 'paragraph', text: 'Hugo, Victor Novela', role: 'credits', page: 1, start: 24 }
    ]
    expect(resolveBookIdentity({
      title: 'Nuestra señora de París', blocks: credits,
      fileName: 'Esto matará aquello - Victor Hugo (1).pdf'
    })).toEqual({ title: 'Nuestra señora de París', author: 'Victor Hugo' })
  })

  it('convierte el título inicial de un extracto corto en su único capítulo', () => {
    const extract = [
      { type: 'heading', text: 'Nuestra señora de París', role: 'credits', page: 1, start: 0 },
      { type: 'paragraph', text: 'Hugo, Victor Novela', role: 'credits', page: 1, start: 24 },
      { type: 'paragraph', text: 'Esto matará a aquello', page: 2, start: 44 },
      { type: 'paragraph', text: 'Que nuestros lectores nos perdonen si nos detenemos un momento para analizar el sentido que se ocultaba tras aquellas palabras enigmáticas y todo lo que significaban para la arquitectura.', page: 2, start: 67 }
    ]
    const book = refineBookPresentation({
      version: 14, title: 'Nuestra señora de París', author: '', blocks: extract,
      chapters: [{ title: 'Sección 1', start: 0, end: 4 }], bodyStart: 2, chars: 220, stats: { words: 30 }
    }, { fileName: 'Esto matará aquello - Victor Hugo (1).pdf', version: 15 })

    expect(book.author).toBe('Victor Hugo')
    expect(book.blocks[2].type).toBe('heading')
    expect(book.chapters).toEqual([
      { title: 'Portada y créditos', start: 0, end: 2, kind: 'frontmatter' },
      { title: 'Esto matará a aquello', start: 2, end: 4 }
    ])
    expect(book.bodyStart).toBe(2)
  })

  it('convierte portada y dedicatoria en una sola seccion auxiliar', () => {
    const book = refineBookPresentation({
      version: 10,
      title: 'García Márquez - Cien años de soledad', author: 'Patricio',
      blocks, chapters
    }, { version: 11 })

    expect(book.version).toBe(11)
    expect(book.chapters.map(chapter => chapter.title)).toEqual(['Dedicatoria', 'I', 'II', 'Índice'])
    expect(book.chapters.filter(chapter => !chapter.kind)).toHaveLength(2)
    expect(book.chapters[0]).toMatchObject({ start: 0, end: 4, kind: 'frontmatter' })
    expect(book.chapters.at(-1)).toMatchObject({ start: 8, end: 9, kind: 'supplement' })
    expect(book.bodyEnd).toBe(8)
  })

  it('solo separa un indice contiguo al final', () => {
    expect(findBodyEnd(blocks)).toBe(8)
    expect(findBodyEnd([{ text: 'índice', role: 'toc' }, { text: 'epílogo' }])).toBe(2)
  })
})
