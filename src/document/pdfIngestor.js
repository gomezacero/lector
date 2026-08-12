import { buildBook } from '../pdf/pipeline.js'
import { buildBookInWorker } from '../pdf/ingestClient.js'

/**
 * Adaptador del formato PDF hacia el modelo Book normalizado. Un futuro EPUB
 * implementara la misma unica operacion sin tocar biblioteca ni lectores.
 */
export function createPdfIngestor ({ onWorkerFallback } = {}) {
  return {
    format: 'pdf',
    async ingest (bytes, options = {}) {
      try {
        return await buildBookInWorker(bytes, options)
      } catch (err) {
        if (err?.name !== 'WorkerUnavailable') throw err
        onWorkerFallback?.(err)
        return buildBook(bytes, options)
      }
    }
  }
}
