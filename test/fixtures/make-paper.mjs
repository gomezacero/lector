// Genera un articulo sintetico a dos columnas con figuras, para probar la
// vista de pagina con foco por region.
//
//   node test/fixtures/make-paper.mjs [salida.pdf]
//
// Trae a proposito todo lo que complica un paper de verdad:
//   - dos columnas con su corredor
//   - un titulo a todo lo ancho por encima de las dos
//   - figuras con dibujo vectorial y etiquetas de ejes dentro
//   - una tabla
//   - una nota al pie
//   - una figura ancha que ocupa las dos columnas

import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PAGE = { w: 612, h: 792 }
const MARGIN = { x: 54, top: 736, bottom: 60 }
const COL = { width: 240, gap: 24 }
const BODY = { size: 9.5, leading: 11.6, maxChars: 46 }

const COL_X = [MARGIN.x, MARGIN.x + COL.width + COL.gap]

export const PAPER_TITLE = 'Sobre la lectura guiada de documentos tecnicos'
export const PAPER_AUTHOR = 'Fixture de prueba'

const SECTIONS = [
  {
    title: '1. Introduccion',
    paragraphs: [
      'Leer un articulo tecnico en una pantalla pequena obliga a un vaiven constante entre el cuerpo del texto y las figuras que lo acompanan. El lector pierde el hilo con facilidad, sobre todo cuando la maquetacion reparte el contenido en dos columnas y las figuras se intercalan sin un orden evidente.',
      'Este trabajo propone una guia de lectura que resalta una region cada vez y atenua el resto de la pagina. La region activa avanza siguiendo el orden real de lectura: primero la columna izquierda de arriba abajo y despues la derecha, intercalando las figuras en el punto en que aparecen.',
      'La propuesta no reconstruye la pagina ni altera su maquetacion. Conserva el documento tal y como fue compuesto, de modo que las formulas, las tablas y los graficos vectoriales se ven exactamente igual que en el original.'
    ]
  },
  {
    title: '2. Metodo',
    paragraphs: [
      'El procedimiento consta de tres fases. En la primera se extraen los fragmentos de texto con sus coordenadas y se reunen en renglones. En la segunda se detectan los corredores verticales que separan las columnas. En la tercera se agrupan los renglones en regiones de lectura.',
      'Las zonas de la pagina que no contienen texto de cuerpo pero si dibujo se tratan como regiones graficas. Su texto interior, que suele corresponder a los rotulos de los ejes, se excluye del flujo de lectura para que no interrumpa la prosa.',
      'El orden de las regiones se establece por columnas: se recorren de arriba abajo dentro de cada columna y despues se pasa a la siguiente. Las regiones que ocupan todo el ancho de la pagina se insertan segun su posicion vertical.'
    ]
  },
  {
    title: '3. Resultados',
    paragraphs: [
      'Se evaluaron cuatro documentos de prueba con maquetaciones distintas. En todos ellos el orden de lectura reconstruido coincidio con el orden previsto por el maquetador, incluidas las paginas mixtas en las que el texto pasa de dos columnas a una sola.',
      'El coste de calculo resulta despreciable frente al de dibujar la pagina. La deteccion de regiones se resuelve en una sola pasada sobre los renglones ya agrupados, sin necesidad de analizar la imagen.',
      'El caso mas dificil sigue siendo el material marginal de anchura variable, que aparece en algunos manuales y que puede confundirse con una columna cuando ocupa muchos renglones seguidos.'
    ]
  },
  {
    title: '4. Conclusiones',
    paragraphs: [
      'Resaltar una region cada vez reduce el esfuerzo de seguimiento sin modificar el documento. El metodo es sencillo de implementar y se apoya unicamente en las coordenadas que ya proporciona el extractor de texto.',
      'Queda pendiente estudiar como se comporta la guia en documentos con notas al margen extensas y en tablas de gran tamano, donde la nocion de region de lectura resulta menos evidente.'
    ]
  }
]

// --- Utilidades de dibujo --------------------------------------------------

const escape = s => s.replace(/([\\()])/g, '\\$1')

const text = (content, x, y, size, font = '/F1') =>
  `BT ${font} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${escape(content)}) Tj ET`

function wrap (content, maxChars) {
  const words = content.split(/\s+/)
  const lines = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (candidate.length <= maxChars) line = candidate
    else { lines.push(line); line = word }
  }
  if (line) lines.push(line)
  return lines
}

/** Recuadro con lineas diagonales: hace de grafico vectorial. */
function figureArt (x, y, w, h) {
  const ops = [`${x} ${y} ${w} ${h} re S`]
  for (let i = 1; i < 7; i++) {
    const t = i / 7
    ops.push(`${(x + w * t).toFixed(1)} ${(y + 6).toFixed(1)} m ${(x + w * (1 - t * 0.6)).toFixed(1)} ${(y + h - 6).toFixed(1)} l S`)
  }
  // Curva suave, para que no sea todo rectas.
  ops.push(`${(x + 6).toFixed(1)} ${(y + h * 0.3).toFixed(1)} m ` +
           `${(x + w * 0.4).toFixed(1)} ${(y + h * 0.9).toFixed(1)} ` +
           `${(x + w * 0.6).toFixed(1)} ${(y + h * 0.1).toFixed(1)} ` +
           `${(x + w - 6).toFixed(1)} ${(y + h * 0.7).toFixed(1)} c S`)
  return ops.join('\n')
}

/** Figura completa: dibujo, rotulos de ejes dentro y pie debajo. */
function figure (x, y, w, h, label, caption) {
  const ops = ['0.6 w', figureArt(x, y + 16, w, h - 16)]
  // Rotulos de los ejes: texto DENTRO de la figura, que no debe leerse.
  ops.push(text('0', x + 3, y + 20, 6, '/F2'))
  ops.push(text('50', x + w * 0.45, y + 20, 6, '/F2'))
  ops.push(text('100', x + w - 16, y + 20, 6, '/F2'))
  ops.push(text('error (%)', x + 3, y + h - 8, 6, '/F2'))
  // Pie de figura, debajo del recuadro.
  for (const [i, line] of wrap(`${label}. ${caption}`, 52).entries()) {
    ops.push(text(line, x, y + 6 - i * 8, 7, '/F2'))
  }
  return ops.join('\n')
}

function table (x, y, w, rows) {
  const ops = ['0.5 w']
  const rowH = 13
  rows.forEach((row, i) => {
    const rowY = y - i * rowH
    if (i === 0) ops.push(`${x} ${(rowY + 10).toFixed(1)} m ${(x + w).toFixed(1)} ${(rowY + 10).toFixed(1)} l S`)
    ops.push(`${x} ${(rowY - 3).toFixed(1)} m ${(x + w).toFixed(1)} ${(rowY - 3).toFixed(1)} l S`)
    row.forEach((cell, j) => {
      ops.push(text(cell, x + 4 + j * (w / row.length), rowY, 7.5, i === 0 ? '/F3' : '/F2'))
    })
  })
  return { ops: ops.join('\n'), height: rows.length * rowH + 12 }
}

// --- Maquetacion -----------------------------------------------------------

function layout () {
  const pages = []
  let ops = []
  let column = 0
  let y = MARGIN.top - 60 // hueco para el titulo de la primera pagina
  let figureCount = 0
  let firstPage = true

  const flushPage = () => {
    pages.push(ops)
    ops = []
    column = 0
    y = MARGIN.top
    firstPage = false
  }

  const nextColumn = () => {
    if (column === 0) { column = 1; y = MARGIN.top }
    else flushPage()
  }

  const room = needed => y - needed >= MARGIN.bottom

  // Titulo y autores, a todo lo ancho de la primera pagina.
  ops.push(text(PAPER_TITLE, MARGIN.x, MARGIN.top + 24, 15, '/F3'))
  ops.push(text(PAPER_AUTHOR, MARGIN.x, MARGIN.top + 6, 9, '/F2'))

  for (const section of SECTIONS) {
    if (!room(BODY.leading * 3)) nextColumn()
    ops.push(text(section.title, COL_X[column], y, 10.5, '/F3'))
    y -= BODY.leading * 1.6

    for (const paragraph of section.paragraphs) {
      const lines = wrap(paragraph, BODY.maxChars)
      lines.forEach((line, i) => {
        if (!room(BODY.leading)) nextColumn()
        ops.push(text(line, COL_X[column] + (i === 0 ? 10 : 0), y, BODY.size))
        y -= BODY.leading
      })
      y -= BODY.leading * 0.4

      // Una figura tras algunos parrafos, dentro de la columna.
      if (figureCount < 3 && Math.random === null) { /* nunca: orden fijo abajo */ }
    }

    // Figura al final de cada seccion, salvo la ultima.
    if (figureCount < 3 && section !== SECTIONS.at(-1)) {
      const figH = 96
      if (!room(figH + 24)) nextColumn()
      figureCount++
      ops.push(figure(COL_X[column], y - figH, COL.width, figH,
        `Figura ${figureCount}`,
        'Error de lectura frente al numero de regiones resaltadas.'))
      y -= figH + 20
    }
  }

  // Tabla en la columna que toque.
  if (!room(80)) nextColumn()
  const built = table(COL_X[column], y, COL.width, [
    ['Documento', 'Regiones', 'Aciertos'],
    ['Articulo A', '412', '98.1'],
    ['Articulo B', '387', '97.4'],
    ['Manual C', '1204', '91.2']
  ])
  ops.push(text('Tabla 1. Resultados por documento.', COL_X[column], y + 14, 7, '/F2'))
  ops.push(built.ops)
  y -= built.height + 18

  // Nota al pie, abajo del todo de la columna izquierda.
  ops.push(text('1 Los datos completos se publican por separado.', COL_X[0], MARGIN.bottom - 12, 7, '/F2'))

  if (ops.length) pages.push(ops)

  // Figura ancha a dos columnas, en una pagina propia al final.
  const wide = []
  const wideW = COL.width * 2 + COL.gap
  wide.push(text('5. Apendice', COL_X[0], MARGIN.top, 10.5, '/F3'))
  wide.push(figure(MARGIN.x, MARGIN.top - 250, wideW, 210, 'Figura 4',
    'Comparacion de las tres estrategias sobre el conjunto completo.'))
  let wy = MARGIN.top - 280
  for (const line of wrap('El apendice recoge la comparacion completa de las tres estrategias evaluadas. La figura anterior ocupa el ancho de las dos columnas, de modo que la region correspondiente abarca la pagina entera y el recorrido debe tratarla como un unico paso.', BODY.maxChars)) {
    wide.push(text(line, COL_X[0], wy, BODY.size))
    wy -= BODY.leading
  }
  pages.push(wide)

  void firstPage
  return pages
}

// --- Escritura del PDF -----------------------------------------------------

function buildPdf (pages) {
  const objects = []
  const add = body => { objects.push(body); return objects.length }

  const catalogId = 1
  const pagesId = 2
  objects.push('', '')

  const fonts = {
    F1: add('<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>'),
    F2: add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),
    F3: add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')
  }
  const fontDict = `<< /F1 ${fonts.F1} 0 R /F2 ${fonts.F2} 0 R /F3 ${fonts.F3} 0 R >>`

  const pageIds = []
  pages.forEach((ops, i) => {
    const stream = [...ops, text(String(i + 1), PAGE.w / 2 - 4, 34, 8, '/F2')].join('\n')
    const contentId = add(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`)
    pageIds.push(add(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE.w} ${PAGE.h}] ` +
      `/Resources << /Font ${fontDict} >> /Contents ${contentId} 0 R >>`
    ))
  })

  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`
  objects[pagesId - 1] =
    `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`

  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'))
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`
  })

  const xrefOffset = Buffer.byteLength(pdf, 'latin1')
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R ` +
         `/Info << /Title (${escape(PAPER_TITLE)}) /Author (${escape(PAPER_AUTHOR)}) >> >>\n` +
         `startxref\n${xrefOffset}\n%%EOF\n`

  return Buffer.from(pdf, 'latin1')
}

const here = path.dirname(fileURLToPath(import.meta.url))
export const FIXTURE_PAPER = path.join(here, 'paper-prueba.pdf')

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = process.argv[2] ?? FIXTURE_PAPER
  const pages = layout()
  writeFileSync(out, buildPdf(pages))
  console.log(`PDF escrito en ${out} (${pages.length} paginas)`)
}
