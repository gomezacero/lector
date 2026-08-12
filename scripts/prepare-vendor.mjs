import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const resources = [
  {
    path: 'vendor/tesseract/eng.traineddata.gz',
    url: 'https://raw.githubusercontent.com/naptha/tessdata/806cd9adc8c6e8abc11c782db1818c990576bebc/eng.traineddata.gz',
    sha256: 'ed350f3752f81ee8f38769edc14d92d997dababe23b565c59879372cc46a2468'
  },
  {
    path: 'vendor/tesseract/spa.traineddata.gz',
    url: 'https://raw.githubusercontent.com/naptha/tessdata/806cd9adc8c6e8abc11c782db1818c990576bebc/spa.traineddata.gz',
    sha256: '6cd52c545bceeacb2e43fad64fc0703a711c482ba20d1ca4b6915c09de9973e6'
  },
  {
    path: 'vendor/tts/voices/es/es_ES/davefx/medium/es_ES-davefx-medium.onnx',
    url: 'https://huggingface.co/diffusionstudio/piper-voices/resolve/840e38a7e26d813bd6221b78cfbaefa3585b3f71/es/es_ES/davefx/medium/es_ES-davefx-medium.onnx?download=true',
    sha256: '6658b03b1a6c316ee4c265a9896abc1393353c2d9e1bca7d66c2c442e222a917'
  },
  {
    path: 'vendor/tts/voices/es/es_ES/davefx/medium/es_ES-davefx-medium.onnx.json',
    url: 'https://huggingface.co/diffusionstudio/piper-voices/resolve/840e38a7e26d813bd6221b78cfbaefa3585b3f71/es/es_ES/davefx/medium/es_ES-davefx-medium.onnx.json?download=true',
    sha256: '0e0dda87c732f6f38771ff274a6380d9252f327dca77aa2963d5fbdf9ec54842'
  }
]

const digest = bytes => createHash('sha256').update(bytes).digest('hex')

async function valid (target, expected) {
  try {
    return digest(await readFile(target)) === expected
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

async function fetchResource (resource) {
  const target = path.join(root, resource.path)
  if (await valid(target, resource.sha256)) {
    console.log(`OK ${resource.path}`)
    return
  }

  console.log(`Descargando ${resource.path}`)
  const response = await fetch(resource.url, { redirect: 'follow' })
  if (!response.ok) throw new Error(`${resource.url}: HTTP ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  const actual = digest(bytes)
  if (actual !== resource.sha256) {
    throw new Error(`${resource.path}: SHA-256 inesperado (${actual})`)
  }

  await mkdir(path.dirname(target), { recursive: true })
  const temporary = `${target}.download`
  await writeFile(temporary, bytes)
  await rm(target, { force: true })
  await rename(temporary, target)
}

for (const resource of resources) await fetchResource(resource)
