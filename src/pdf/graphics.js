// Donde hay dibujo en una pagina: trazados e imagenes.
//
// pdf.js entrega la lista de operaciones de dibujo, y cada trazado viene con su
// caja envolvente. Basta con ir siguiendo la matriz de transformacion para
// saber donde acaba cada cosa en la pagina, sin tener que pintarla: dibujar 800
// paginas para averiguar donde estan las figuras costaria minutos.
//
// Las coordenadas que salen son las mismas que usan las lineas de texto: origen
// arriba a la izquierda.

/** Multiplica dos matrices [a,b,c,d,e,f], como hace pdf.js internamente. */
function multiply (m1, m2) {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
  ]
}

const apply = (x, y, m) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]

/** Caja envolvente de un rectangulo despues de transformarlo. */
function transformBox (box, m) {
  const [x0, y0, x1, y1] = box
  const corners = [apply(x0, y0, m), apply(x1, y0, m), apply(x0, y1, m), apply(x1, y1, m)]
  const xs = corners.map(c => c[0])
  const ys = corners.map(c => c[1])
  const left = Math.min(...xs)
  const top = Math.min(...ys)
  return { x: left, y: top, w: Math.max(...xs) - left, h: Math.max(...ys) - top }
}

/**
 * @param {{fnArray:Array, argsArray:Array}} operatorList
 * @param {Array} baseTransform matriz del viewport (lleva a coordenadas de pagina)
 * @param {Object} OPS tabla de operadores de pdf.js
 * @returns {Array<{x:number,y:number,w:number,h:number}>}
 */
export function extractDrawings (operatorList, baseTransform, OPS) {
  const { fnArray, argsArray } = operatorList
  const stack = []
  let ctm = baseTransform.slice()
  const drawings = []

  for (let i = 0; i < fnArray.length; i++) {
    switch (fnArray[i]) {
      case OPS.save:
        stack.push(ctm.slice())
        break

      case OPS.restore:
        ctm = stack.pop() ?? ctm
        break

      case OPS.transform:
        ctm = multiply(ctm, argsArray[i])
        break

      case OPS.constructPath: {
        // El tercer argumento es la caja del trazado; a veces no viene.
        const box = argsArray[i]?.[2]
        if (box && box.length === 4) drawings.push({ ...transformBox(box, ctm), image: false })
        break
      }

      case OPS.paintImageXObject:
      case OPS.paintInlineImageXObject:
      case OPS.paintImageMaskXObject:
        // Las imagenes se pintan sobre el cuadrado unitario transformado.
        drawings.push({ ...transformBox([0, 0, 1, 1], ctm), image: true })
        break

      default:
        break
    }
  }

  return drawings.filter(d => Number.isFinite(d.x) && d.w > 0.5 && d.h > 0.5)
}

/**
 * Une los trazados sueltos en figuras.
 *
 * Una grafica llega como decenas de lineas independientes; lo que interesa es
 * el conjunto. Se van fundiendo las cajas que se tocan o casi, hasta que no
 * queda ninguna por unir.
 *
 * @param {Array} drawings
 * @param {number} tolerance holgura para considerar que dos cajas se tocan
 */
export function mergeDrawings (drawings, tolerance = 10, pageArea = Infinity) {
  // `parts` cuenta los trazados fundidos: una grafica trae decenas, mientras
  // que un marco o el filete de un encabezado traen uno. Es lo que despues
  // permite no confundir el recuadro de una pagina con una figura.
  //
  // Los trazos que cubren casi toda la pagina —un fondo, un marco— se apartan
  // antes de fundir nada. Si se dejaran, tocarian todo lo demas y acabarian
  // absorbiendolo: una pagina con una fotografia y un marco daria una sola
  // caja del tamano de la pagina, y la fotografia se perderia dentro.
  const boxes = drawings
    .filter(d => d.w * d.h < pageArea * 0.85)
    .map(d => ({ ...d, parts: 1 }))
  let merged = true

  while (merged) {
    merged = false
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        if (!nearby(boxes[i], boxes[j], tolerance)) continue
        boxes[i] = union(boxes[i], boxes[j])
        boxes.splice(j, 1)
        merged = true
        j--
      }
    }
  }
  return boxes
}

function nearby (a, b, tolerance) {
  return a.x - tolerance < b.x + b.w && b.x - tolerance < a.x + a.w &&
         a.y - tolerance < b.y + b.h && b.y - tolerance < a.y + a.h
}

function union (a, b) {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return {
    x,
    y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y,
    parts: a.parts + b.parts,
    image: a.image || b.image
  }
}

export const area = box => box.w * box.h

export function contains (outer, inner, slack = 2) {
  return inner.x >= outer.x - slack && inner.y >= outer.y - slack &&
         inner.x + inner.w <= outer.x + outer.w + slack &&
         inner.y + inner.h <= outer.y + outer.h + slack
}
