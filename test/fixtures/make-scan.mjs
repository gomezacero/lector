// Genera un PDF "escaneado": una imagen a pagina completa por pagina, con el
// numero de pagina estampado encima, que es exactamente lo que produce un
// escaner domestico. Sirve para probar la clasificacion de paginas y, mas
// adelante, el OCR.
//
//   node test/fixtures/make-scan.mjs [salida.pdf] [paginas]
//
// Se escribe a mano, como make-pdf.mjs, para que el fixture sea reproducible
// y no dependa de nada externo. La imagen del script es un JPEG de 1x1 gris
// estirado a toda la pagina: para clasificar solo importa la caja que cubre,
// no lo que se ve. buildScanPdf tambien acepta JPEGs reales, y asi una tarea
// de desarrollo puede rasterizar texto conocido y envolverlo aqui para
// medir el OCR contra el original.

import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PAGE = { w: 612, h: 792 }

// El JPEG valido mas pequeno que se puede llevar en el propio script: un solo
// pixel gris. Da igual el contenido; el clasificador mira la geometria.
export const GRAY_PIXEL_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==',
  'base64')

/**
 * Envuelve un JPEG por pagina en un PDF donde cada uno cubre la pagina entera.
 * @param {Array<{data:Buffer, width:number, height:number}>} jpegs
 * @param {{w?:number, h?:number, folio?:boolean}} options folio estampa el
 *   numero de pagina encima, como hacen algunos escaneres y sellos de registro
 * @returns {Buffer}
 */
export function buildScanPdf (jpegs, { w = PAGE.w, h = PAGE.h, folio = true } = {}) {
  // Los objetos pueden ser texto o binario (los JPEG), asi que el ensamblado
  // trabaja con Buffers desde el principio: un solo byte de desvio en la
  // tabla xref y el PDF no abre.
  const objects = []
  const add = body => { objects.push(body) ; return objects.length }

  const catalogId = 1
  const pagesId = 2
  objects.push('', '')

  const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')

  const pageIds = []
  jpegs.forEach((jpeg, i) => {
    const imageId = add(Buffer.concat([
      Buffer.from(
        `<< /Type /XObject /Subtype /Image /Width ${jpeg.width} /Height ${jpeg.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode ` +
        `/Length ${jpeg.data.length} >>\nstream\n`, 'latin1'),
      jpeg.data,
      Buffer.from('\nendstream', 'latin1')
    ]))

    // La imagen se pinta sobre el cuadrado unitario escalado a toda la pagina.
    const paint = [`q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`]
    if (folio) {
      paint.push(`BT /F1 9 Tf 1 0 0 1 ${(w / 2 - 3).toFixed(0)} 40 Tm (${i + 1}) Tj ET`)
    }
    const stream = paint.join('\n')
    const contentId = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)

    pageIds.push(add(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${w} ${h}] ` +
      `/Resources << /XObject << /Im0 ${imageId} 0 R >> /Font << /F1 ${fontId} 0 R >> >> ` +
      `/Contents ${contentId} 0 R >>`
    ))
  })

  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`
  objects[pagesId - 1] =
    `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`

  const chunks = [Buffer.from('%PDF-1.4\n', 'latin1')]
  const offsets = [0]
  let position = chunks[0].length
  objects.forEach((body, i) => {
    offsets.push(position)
    const chunk = Buffer.concat([
      Buffer.from(`${i + 1} 0 obj\n`, 'latin1'),
      Buffer.isBuffer(body) ? body : Buffer.from(body, 'latin1'),
      Buffer.from('\nendobj\n', 'latin1')
    ])
    chunks.push(chunk)
    position += chunk.length
  })

  let tail = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (let i = 1; i <= objects.length; i++) {
    tail += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  }
  tail += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R ` +
          `/Info << /Title (Escaneado de prueba) >> >>\n` +
          `startxref\n${position}\n%%EOF\n`
  chunks.push(Buffer.from(tail, 'latin1'))

  return Buffer.concat(chunks)
}

const here = path.dirname(fileURLToPath(import.meta.url))
export const SCAN_PDF = path.join(here, 'escaneado-prueba.pdf')

// Solo escribe el PDF si se invoca como script; importarlo desde un test no
// deberia tocar el disco.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = process.argv[2] ?? SCAN_PDF
  const pages = Number(process.argv[3]) || 6
  const jpegs = Array.from({ length: pages }, () => ({ data: GRAY_PIXEL_JPEG, width: 1, height: 1 }))
  writeFileSync(out, buildScanPdf(jpegs))
  console.log(`PDF escaneado escrito en ${out} (${pages} paginas)`)
}
