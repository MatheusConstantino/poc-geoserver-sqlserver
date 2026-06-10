// =============================================================================
// Seed Configuration
// All values sourced from environment variables — see .env.example
// =============================================================================

export const BBOX = {
  minLon: -54.6,
  maxLon: -48.0,
  minLat: -26.7,
  maxLat: -22.5,
} as const

export const COUNTS = {
  postes:           parseInt(process.env.SEED_POINTS_COUNT       ?? '50000'),
  trechos:          parseInt(process.env.SEED_LINES_COUNT        ?? '100000'),
  subestacoes:      parseInt(process.env.SEED_POLYGONS_COUNT     ?? '2000'),
  inconsistencias:  parseInt(process.env.SEED_INCONSISTENCIES_COUNT ?? '15000'),
} as const

export const RANDOM_SEED = parseInt(process.env.SEED_RANDOM_SEED ?? '42')

export const BATCH_SIZE = 1000  // rows per INSERT batch

export const TENSAO_VALUES   = ['13.8kV', '34.5kV', '69kV'] as const
export const MATERIAL_VALUES = ['concreto', 'madeira', 'metalico'] as const
export const CABO_VALUES     = ['ACSR', 'XLPE', 'AAC'] as const

// Approximate inconsistency breakdown (from spec, section VR-001 to VR-005)
export const INCONSISTENCY_COUNTS = {
  vr001: Math.floor(COUNTS.inconsistencias * 0.20),  // ~3000: poles outside polygons
  vr002: Math.floor(COUNTS.inconsistencias * 0.30),  // ~4500: dangling line endpoints
  vr003: Math.floor(COUNTS.inconsistencias * 0.13),  // ~2000: self-intersecting polygons
  vr004: Math.floor(COUNTS.inconsistencias * 0.20),  // ~3000: geometric duplicates
  vr005: Math.floor(COUNTS.inconsistencias * 0.13),  // ~2000: SRID inconsistencies
} as const
