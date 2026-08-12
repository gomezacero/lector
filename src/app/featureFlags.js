// Banderas locales. No se leen de red y no identifican al usuario. Las
// capacidades terminadas pueden quedar activas; las experimentales requieren
// además la preferencia local correspondiente.

export const FEATURES = Object.freeze({
  search: true,
  reflowPagination: true,
  advancedTypography: true,
  dictionary: true,
  speech: true,
  accessibility: true,
  breaks: true,
  study: false
})

export const featureEnabled = (name, overrides = {}) =>
  Boolean(FEATURES[name] && overrides[name] !== false)

