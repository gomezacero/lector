// Genera un PDF de prosa con las patologias que el pipeline debe resolver:
// encabezado repetido, numero de pagina al pie, palabras partidas con guion,
// titulos de capitulo en cuerpo mayor y parrafos con sangria.
//
//   node test/fixtures/make-pdf.mjs [salida.pdf]
//
// Se escribe a mano en vez de usar una libreria para que el fixture sea
// reproducible byte a byte y no dependa de nada externo.

import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PAGE = { w: 595, h: 842, marginX: 78, top: 760, bottom: 84 }
const BODY = { size: 11.5, leading: 16.4, maxChars: 66 }
const HEAD = { size: 16 }
export const RUNNING_HEAD = 'LA CASA DE LAS HORAS LENTAS'
export const BOOK_TITLE = 'La casa de las horas lentas'
export const BOOK_AUTHOR = 'Fixture de prueba'

// El texto fuente se exporta para que los tests comparen la reconstruccion del
// pipeline contra el original, palabra por palabra.
export const CHAPTERS = [
  {
    title: 'Capitulo primero',
    paragraphs: [
      'La casa se levantaba al final de un camino que nadie recordaba haber construido. Sus ventanas miraban al valle con esa paciencia que solo tienen las cosas que llevan mucho tiempo en el mismo sitio, y el viento que bajaba de la sierra las encontraba siempre entornadas, como si alguien acabara de asomarse y hubiera decidido esperar un poco mas.',
      'Marta llego un martes de noviembre con dos maletas y la certeza de que se marcharia antes de Navidad. Habia heredado el edificio de una tia a la que apenas recordaba, una mujer de manos secas que le regalaba libros con dedicatorias demasiado largas y que murio sin avisar a nadie, con la discrecion de quien no quiere molestar ni siquiera en eso.',
      'El notario le habia advertido que la propiedad necesitaba obras. No le dijo que necesitaba, sobre todo, alguien dispuesto a escucharla. Las casas viejas hablan de noche, cuando la madera se contrae y las tuberias recuerdan el agua que las atraveso durante decadas, y hay que llevar alli varios inviernos para distinguir el crujido de la queja.',
      'Durante las primeras semanas se dedico a abrir habitaciones. Cada puerta daba a un cuarto lleno de muebles cubiertos con sabanas, y bajo cada sabana habia un objeto que parecia esperar precisamente esa mano y ninguna otra. Un reloj sin agujas. Una silla con el asiento hundido por el peso de una costumbre. Un espejo que devolvia la habitacion con un retraso minimo, casi imperceptible, que Marta atribuyo al cansancio.',
      'Fue en el tercer piso donde encontro los cuadernos. Estaban apilados dentro de un arcon, atados en grupos de diez con una cuerda que se deshizo en cuanto la toco. Reconocio la letra de su tia en la primera pagina, apretada y ligeramente inclinada hacia la izquierda, como si escribiera contra el tiempo o contra alguien que la mirara por encima del hombro.'
    ]
  },
  {
    title: 'Capitulo segundo',
    paragraphs: [
      'Los cuadernos no eran un diario. Eran un inventario. Su tia habia anotado, durante cuarenta y un anos, todo lo que ocurria dentro de la casa a partir de las once de la noche: el orden en que se apagaban las luces del valle, la direccion del viento, el numero exacto de crujidos de cada escalon, la temperatura del pasillo norte medida con un termometro que seguia colgado del marco de la puerta.',
      'Al principio Marta lo leyo como se lee la excentricidad de un pariente lejano, con la sonrisa preparada. Hacia la mitad del segundo cuaderno dejo de sonreir. Las anotaciones eran demasiado precisas para ser un pasatiempo y demasiado constantes para ser una obsesion pasajera. Alguien que anota durante cuarenta anos no esta entretenido: esta vigilando algo.',
      'Aquella noche subio al tercer piso con una manta y el termometro. Se sento en el suelo del pasillo norte, apoyo la espalda en la pared y espero. A las once y diez la temperatura bajo dos grados. A las once y cuarto, uno mas. A las once y veintitres, el cuarto escalon desde arriba crujio sin que nadie lo pisara, y Marta comprendio por que su tia habia necesitado tantos cuadernos.',
      'No sintio miedo, o no exactamente. Sintio la incomodidad concreta de quien descubre que ha estado equivocado en algo pequeno durante mucho tiempo, y que ese error pequeno sostenia otras cosas. Bajo a la cocina, puso agua a calentar y se quedo mirando el fuego con la libreta abierta sobre las rodillas, la primera pagina en blanco esperando una fecha.',
      'Escribio la hora antes que nada, como habia aprendido en trescientas paginas de letra ajena. Luego el viento. Luego la temperatura. Y cuando llego el momento de anotar lo que habia oido, se dio cuenta de que llevaba media hora sin pensar en marcharse antes de Navidad, y de que el invierno, en aquella casa, prometia ser bastante mas largo de lo previsto.'
    ]
  },
  {
    title: 'Capitulo tercero',
    paragraphs: [
      'El pueblo estaba a cuarenta minutos de camino, cuesta abajo primero y luego por una carretera que se estrechaba sin razon aparente hasta convertirse en un pasillo entre dos muros de piedra. Marta bajaba los jueves a comprar y a devolver los libros de la biblioteca municipal, que ocupaba media planta del ayuntamiento y cerraba a la una en punto, sin margen para la conversacion.',
      'La bibliotecaria se llamaba Elvira y llevaba treinta anos en el mismo mostrador. Reconocio el apellido en cuanto Marta rellenó la ficha y levanto la vista con una lentitud que no tenia nada de casual. Dijo que habia conocido a su tia. Dijo tambien, sin que nadie se lo preguntara, que la casa no era mala, que era solamente antigua, y que la gente confunde las dos cosas con demasiada facilidad.',
      'Marta pidio los periodicos locales de los anos sesenta. Elvira los trajo sin comentarios, apilados en cajas que olian a papel humedo y a tabaco de una epoca en la que se fumaba dentro de los edificios publicos. Estuvo tres jueves seguidos pasando paginas hasta que encontro la noticia: cuatro parrafos, sin fotografia, sobre un accidente en el camino alto durante una tormenta.',
      'El nombre del fallecido no le decia nada. La fecha, en cambio, coincidia exactamente con la primera anotacion del primer cuaderno. Su tia habia empezado a medir la temperatura del pasillo norte la misma semana en que un hombre al que nadie parecia recordar se salio de la carretera a doscientos metros de la casa, en un tramo recto y sin curvas, con el motor en marcha y las luces encendidas.',
      'Elvira cerro la biblioteca a la una en punto, como siempre, pero aquel jueves espero fuera, con el bolso apoyado en la cadera y cara de haber ensayado varias veces lo que iba a decir. Le pregunto si dormia bien. Marta contesto que si, y las dos supieron en el mismo instante que era mentira, aunque ninguna de las dos considero necesario senalarlo en voz alta.'
    ]
  },
  {
    title: 'Capitulo cuarto',
    paragraphs: [
      'En diciembre nevo dos veces y el camino quedo impracticable durante nueve dias. Marta lo agradecio en secreto. La nieve simplifica las decisiones: mientras no se pueda salir, no hay que explicar por que uno se queda. Encendio la chimenea del salon por primera vez y descubrio que tiraba mal, que el humo se acumulaba en la parte alta de la habitacion antes de encontrar la salida.',
      'Aprovecho el encierro para ordenar los cuadernos por anos. Le llevo cuatro dias. Al terminar tenia cuarenta y una pilas sobre la mesa del comedor y una imagen bastante clara de una mujer que habia dedicado la mitad de su vida a comprobar, noche tras noche, que algo seguia ocurriendo exactamente igual. No habia conclusiones en ninguna parte. Habia constancia, que es una forma mas terca de saber.',
      'La ultima anotacion era de tres semanas antes de su muerte y no seguia el formato de las anteriores. En lugar de la hora y la temperatura, su tia habia escrito una sola frase, con la misma letra apretada pero mas grande de lo habitual, ocupando el centro de la pagina como si necesitara sitio para respirar: no se trata de descubrirlo, se trata de acompanarlo.',
      'Marta cerro el cuaderno y estuvo un rato largo escuchando la casa. El cuarto escalon crujio a la hora de siempre. El pasillo norte bajo su temperatura con la puntualidad de un tren de cercanias. Y por primera vez desde noviembre no subio a comprobarlo, porque ya no le hacia falta comprobar nada: le bastaba con saber que estaba pasando y que ella estaba alli.',
      'En marzo llamo al notario para preguntar por los tramites de una reforma. Le dijo que queria arreglar la chimenea, cambiar la instalacion electrica del tercer piso y, si el presupuesto lo permitia, poner cristales dobles en las ventanas del norte. No menciono los cuadernos. Compro una libreta nueva en el pueblo, de tapas duras y hojas cuadriculadas, y esa noche escribio la hora antes que nada.'
    ]
  }
]

// --- Maquetacion -----------------------------------------------------------

/** Corta un parrafo en lineas de ancho fijo; parte con guion cada 5 lineas. */
function wrap (text, maxChars, hyphenEvery = 5) {
  const words = text.split(/\s+/)
  const lines = []
  let line = ''

  for (let i = 0; i < words.length; i++) {
    const word = words[i]
    const candidate = line ? `${line} ${word}` : word

    if (candidate.length <= maxChars) {
      line = candidate
      continue
    }
    // De vez en cuando parte la palabra: es lo que hace un maquetador real y
    // el pipeline tiene que saber recomponerla.
    const room = maxChars - line.length - 1
    if (lines.length % hyphenEvery === hyphenEvery - 1 && room >= 4 && word.length - room >= 3) {
      lines.push(`${line} ${word.slice(0, room - 1)}-`)
      line = word.slice(room - 1)
    } else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines
}

/**
 * Reparte capitulos y parrafos en paginas de altura fija.
 * @param {number} repeat veces que se repite el libro, para generar un tomo
 *   grande con el que medir rendimiento.
 */
function paginate (repeat = 1) {
  const chapters = Array.from({ length: repeat }, (_, round) =>
    CHAPTERS.map((chapter, i) => ({
      ...chapter,
      title: repeat > 1 ? `Capitulo ${round * CHAPTERS.length + i + 1}` : chapter.title
    }))
  ).flat()

  const pages = []
  let page = []
  let y = PAGE.top

  const push = (text, size, indent) => {
    if (y < PAGE.bottom + BODY.leading) {
      pages.push(page)
      page = []
      y = PAGE.top
    }
    page.push({ text, size, x: PAGE.marginX + indent, y })
    y -= size > BODY.size ? size * 1.9 : BODY.leading
  }

  for (const chapter of chapters) {
    if (page.length) { pages.push(page); page = []; y = PAGE.top }
    push(chapter.title, HEAD.size, 0)
    y -= 10

    for (const [i, paragraph] of chapter.paragraphs.entries()) {
      const lines = wrap(paragraph, BODY.maxChars)
      lines.forEach((line, j) => {
        // Sangria de primera linea salvo en el parrafo que abre el capitulo.
        push(line, BODY.size, j === 0 && i > 0 ? 18 : 0)
      })
    }
  }
  if (page.length) pages.push(page)
  return pages
}

// --- Escritura del PDF -----------------------------------------------------

const escape = s => s.replace(/([\\()])/g, '\\$1')

function contentStream (lines, pageNumber, totalPages) {
  const out = []

  // Encabezado repetido en todas las paginas menos la primera de cada capitulo.
  out.push(`BT /F2 8 Tf 1 0 0 1 ${PAGE.marginX} 795 Tm (${escape(RUNNING_HEAD)}) Tj ET`)

  for (const line of lines) {
    const font = line.size > BODY.size ? '/F3' : '/F1'
    out.push(`BT ${font} ${line.size} Tf 1 0 0 1 ${line.x.toFixed(2)} ${line.y.toFixed(2)} Tm (${escape(line.text)}) Tj ET`)
  }

  // Numero de pagina centrado al pie.
  const label = String(pageNumber)
  out.push(`BT /F2 9 Tf 1 0 0 1 ${(PAGE.w / 2 - label.length * 2.5).toFixed(2)} 52 Tm (${escape(label)}) Tj ET`)
  void totalPages

  return out.join('\n')
}

function buildPdf (pages) {
  const objects = []
  const add = body => { objects.push(body); return objects.length }

  const catalogId = 1
  const pagesId = 2
  objects.push('', '') // se rellenan al final, cuando se conocen los ids

  const fontIds = {
    F1: add('<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>'),
    F2: add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),
    F3: add('<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold /Encoding /WinAnsiEncoding >>')
  }
  const fontDict = `<< /F1 ${fontIds.F1} 0 R /F2 ${fontIds.F2} 0 R /F3 ${fontIds.F3} 0 R >>`

  const pageIds = []
  pages.forEach((lines, i) => {
    const stream = contentStream(lines, i + 1, pages.length)
    const contentId = add(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`)
    pageIds.push(add(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE.w} ${PAGE.h}] ` +
      `/Resources << /Font ${fontDict} >> /Contents ${contentId} 0 R >>`
    ))
  })

  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`
  objects[pagesId - 1] =
    `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`

  // Ensamblado con tabla xref: los offsets deben ser exactos o el PDF no abre.
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
         `/Info << /Title (La casa de las horas lentas) /Author (Fixture de prueba) >> >>\n` +
         `startxref\n${xrefOffset}\n%%EOF\n`

  return Buffer.from(pdf, 'latin1')
}

const here = path.dirname(fileURLToPath(import.meta.url))
export const FIXTURE_PDF = path.join(here, 'libro-prueba.pdf')

// Solo escribe el PDF si se invoca como script; importarlo desde un test no
// deberia tocar el disco.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = process.argv[2] ?? FIXTURE_PDF
  const pages = paginate(Number(process.argv[3]) || 1)
  writeFileSync(out, buildPdf(pages))
  console.log(`PDF escrito en ${out} (${pages.length} paginas)`)
}
