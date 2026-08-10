// Que hacer con el OCR guardado al abrir un libro. Funciones puras: la
// distincion importante es intentado vs con texto. Una pagina intentada que
// quedo vacia (una lamina, una pagina en blanco) sigue siendo 'scanned' en el
// cache y lo sera siempre: contarla como pendiente reprocesaria el libro
// entero en cada apertura.

// Al motor van las paginas sin texto util: las escaneadas (pura imagen) y las
// sospechosas (texto extraido pero corrupto, la fuente sin mapa de caracteres
// tipica: ahi el OCR es justo lo que salva el libro).
const wantsOcr = kind => kind === 'scanned' || kind === 'suspect'

/**
 * ¿Hay texto reconocido que el cache aún no incorpora? Solo entonces merece
 * la pena reconstruir el libro.
 * @param {Array<string>} pageKinds del libro cacheado
 * @param {Object} ocrPages pages del fichero .ocr.json
 */
export const hasUnappliedOcr = (pageKinds, ocrPages) =>
  !!ocrPages && (pageKinds ?? []).some((kind, page) =>
    wantsOcr(kind) && ocrPages[page]?.items?.length > 0)

/**
 * Páginas que aún no han pasado por el motor. Las intentadas sin texto no
 * vuelven: repetirlas costaría los mismos minutos para nada.
 */
export const unattemptedPages = (pageKinds, ocrPages) =>
  (pageKinds ?? [])
    .map((kind, page) => wantsOcr(kind) && !ocrPages?.[page] ? page : -1)
    .filter(page => page >= 0)
