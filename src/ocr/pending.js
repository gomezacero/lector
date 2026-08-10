// Que hacer con el OCR guardado al abrir un libro. Funciones puras: la
// distincion importante es intentado vs con texto. Una pagina intentada que
// quedo vacia (una lamina, una pagina en blanco) sigue siendo 'scanned' en el
// cache y lo sera siempre: contarla como pendiente reprocesaria el libro
// entero en cada apertura.

/**
 * ¿Hay texto reconocido que el cache aún no incorpora? Solo entonces merece
 * la pena reconstruir el libro.
 * @param {Array<string>} pageKinds del libro cacheado
 * @param {Object} ocrPages pages del fichero .ocr.json
 */
export const hasUnappliedOcr = (pageKinds, ocrPages) =>
  !!ocrPages && (pageKinds ?? []).some((kind, page) =>
    kind === 'scanned' && ocrPages[page]?.items?.length > 0)

/**
 * Páginas escaneadas que aún no han pasado por el motor. Las intentadas sin
 * texto no vuelven: repetirlas costaría los mismos minutos para nada.
 */
export const unattemptedPages = (pageKinds, ocrPages) =>
  (pageKinds ?? [])
    .map((kind, page) => kind === 'scanned' && !ocrPages?.[page] ? page : -1)
    .filter(page => page >= 0)
