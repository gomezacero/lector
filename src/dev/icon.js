// Dibuja el icono de la aplicacion y lo publica en window.__icon.
//
// El icono cuenta lo que hace el programa: unas lineas de texto atenuadas y
// una nitida en medio. Se dibuja a cada tamano por separado en vez de reescalar
// uno grande, porque a 16px una barra reescalada se convierte en una mancha.

const SIZES = [256, 128, 64, 48, 32, 16]

const BARS = [
  { y: 0.26, width: 0.92, alpha: 0.14, blur: 0.022 },
  { y: 0.39, width: 0.78, alpha: 0.30, blur: 0.009 },
  { y: 0.52, width: 1.00, alpha: 1.00, blur: 0, accent: true },
  { y: 0.65, width: 0.86, alpha: 0.30, blur: 0.009 },
  { y: 0.78, width: 0.66, alpha: 0.14, blur: 0.022 }
]

function roundRect (ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function draw (size) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')

  const backdrop = ctx.createLinearGradient(0, 0, 0, size)
  backdrop.addColorStop(0, '#272c38')
  backdrop.addColorStop(1, '#14161a')
  roundRect(ctx, 0, 0, size, size, size * 0.22)
  ctx.fillStyle = backdrop
  ctx.fill()

  // A tamano pequeno solo caben tres barras legibles.
  const bars = size <= 32 ? [BARS[1], BARS[2], BARS[3]] : BARS
  const thickness = Math.max(1, size * (size <= 32 ? 0.085 : 0.058))
  const pad = size * 0.19
  const usable = size - pad * 2

  for (const bar of bars) {
    ctx.save()
    // A tamano pequeno el desenfoque solo ensucia.
    if (bar.blur && size > 48) ctx.filter = `blur(${(bar.blur * size).toFixed(2)}px)`
    ctx.globalAlpha = bar.alpha
    ctx.fillStyle = bar.accent ? '#7aa2f7' : '#e6e3dc'
    roundRect(ctx, pad, bar.y * size - thickness / 2, usable * bar.width, thickness, thickness / 2)
    ctx.fill()
    ctx.restore()
  }

  return canvas.toDataURL('image/png')
}

try {
  window.__icon = { ok: true, images: SIZES.map(size => ({ size, dataUrl: draw(size) })) }
} catch (err) {
  console.error(err)
  window.__icon = { ok: false, error: err.message }
}
