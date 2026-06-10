// =============================================================================
// Geometry generators — produces WKT strings for each feature type
// All coordinates in SRID 4326 (WGS84), within Paraná state bounding box
// =============================================================================

import { SeededRng } from './rng.js'
import { BBOX, TENSAO_VALUES, MATERIAL_VALUES, CABO_VALUES } from './config.js'

// Polygon size in degrees (roughly 5–20km per side at lat -25)
const POLY_SIZE_MIN = 0.05
const POLY_SIZE_MAX = 0.20

// ---------------------------------------------------------------------------
// POINT generator (postes)
// ---------------------------------------------------------------------------

export interface PosteRow {
  codigo:   string
  nome:     string
  tensao:   string
  material: string
  altura_m: number
  wkt:      string
  srid:     number
}

export function generatePoste(rng: SeededRng, index: number): PosteRow {
  const lon = rng.float(BBOX.minLon, BBOX.maxLon)
  const lat = rng.float(BBOX.minLat, BBOX.maxLat)

  return {
    codigo:   `P-${String(index).padStart(6, '0')}`,
    nome:     `Poste ${index}`,
    tensao:   rng.pick(TENSAO_VALUES),
    material: rng.pick(MATERIAL_VALUES),
    altura_m: Math.round(rng.float(8.0, 18.0) * 100) / 100,
    wkt:      `POINT(${lon.toFixed(6)} ${lat.toFixed(6)})`,
    srid:     4326,
  }
}

// ---------------------------------------------------------------------------
// LINESTRING generator (trechos)
// Connects two random points — simulates a network segment
// ---------------------------------------------------------------------------

export interface TrechoRow {
  codigo:         string
  tensao:         string
  comprimento_m:  number
  tipo_cabo:      string
  poste_inicio_id: number | null
  poste_fim_id:    number | null
  wkt:            string
  srid:           number
}

export function generateTrecho(
  rng:    SeededRng,
  index:  number,
  posteIds: number[],
  totalPostes: number
): TrechoRow {
  // Connect two random poles
  const startIdx = rng.int(0, totalPostes - 1)
  const endIdx   = rng.int(0, totalPostes - 1)

  const startLon = rng.float(BBOX.minLon, BBOX.maxLon)
  const startLat = rng.float(BBOX.minLat, BBOX.maxLat)
  const endLon   = startLon + rng.float(-0.05, 0.05)
  const endLat   = startLat + rng.float(-0.05, 0.05)

  // Approximate length in meters (rough conversion: 1 degree ≈ 111km at lat -25)
  const dLon = (endLon - startLon) * 111000 * Math.cos(-25 * Math.PI / 180)
  const dLat = (endLat - startLat) * 111000
  const length = Math.sqrt(dLon * dLon + dLat * dLat)

  return {
    codigo:          `T-${String(index).padStart(7, '0')}`,
    tensao:          rng.pick(TENSAO_VALUES),
    comprimento_m:   Math.round(length * 100) / 100,
    tipo_cabo:       rng.pick(CABO_VALUES),
    poste_inicio_id: posteIds[startIdx] ?? null,
    poste_fim_id:    posteIds[endIdx] ?? null,
    wkt:  `LINESTRING(${startLon.toFixed(6)} ${startLat.toFixed(6)}, ${endLon.toFixed(6)} ${endLat.toFixed(6)})`,
    srid: 4326,
  }
}

// ---------------------------------------------------------------------------
// POLYGON generator (subestacoes) — rectangular concession areas
// ---------------------------------------------------------------------------

export interface SubestacaoRow {
  codigo:         string
  nome:           string
  capacidade_mva: number
  wkt:            string
  srid:           number
}

export function generateSubestacao(rng: SeededRng, index: number): SubestacaoRow {
  const cx = rng.float(BBOX.minLon + POLY_SIZE_MAX, BBOX.maxLon - POLY_SIZE_MAX)
  const cy = rng.float(BBOX.minLat + POLY_SIZE_MAX, BBOX.maxLat - POLY_SIZE_MAX)
  const hw  = rng.float(POLY_SIZE_MIN, POLY_SIZE_MAX) / 2  // half-width
  const hh  = rng.float(POLY_SIZE_MIN, POLY_SIZE_MAX) / 2  // half-height

  const minX = (cx - hw).toFixed(6)
  const maxX = (cx + hw).toFixed(6)
  const minY = (cy - hh).toFixed(6)
  const maxY = (cy + hh).toFixed(6)

  // Closed ring: 5 points (first = last)
  const ring = `${minX} ${minY}, ${maxX} ${minY}, ${maxX} ${maxY}, ${minX} ${maxY}, ${minX} ${minY}`

  return {
    codigo:         `S-${String(index).padStart(4, '0')}`,
    nome:           `Subestacao ${index}`,
    capacidade_mva: Math.round(rng.float(10, 500) * 100) / 100,
    wkt:            `POLYGON((${ring}))`,
    srid:           4326,
  }
}

// ---------------------------------------------------------------------------
// INCONSISTENCY generators — one per rule (VR-001 to VR-005)
// ---------------------------------------------------------------------------

/** VR-001: pole placed clearly outside Paraná — always outside all subestacoes */
export function generateVR001Poste(rng: SeededRng, index: number): PosteRow {
  // Place in southern ocean — will never intersect any subestacao
  const lon = rng.float(-60.0, -40.0)
  const lat = rng.float(-35.0, -30.0)

  return {
    codigo:   `P-VR001-${String(index).padStart(5, '0')}`,
    nome:     `Poste Inconsistente VR001 ${index}`,
    tensao:   rng.pick(TENSAO_VALUES),
    material: rng.pick(MATERIAL_VALUES),
    altura_m: rng.float(8.0, 18.0),
    wkt:      `POINT(${lon.toFixed(6)} ${lat.toFixed(6)})`,
    srid:     4326,
  }
}

/** VR-002: trecho with completely isolated endpoints (no pole within 0.5m) */
export function generateVR002Trecho(rng: SeededRng, index: number): TrechoRow {
  // Place in isolated area far from any real pole cluster
  const startLon = rng.float(-54.5, -54.0)
  const startLat = rng.float(-26.6, -26.3)
  const endLon   = startLon + rng.float(0.001, 0.010)
  const endLat   = startLat + rng.float(0.001, 0.010)

  return {
    codigo:          `T-VR002-${String(index).padStart(6, '0')}`,
    tensao:          rng.pick(TENSAO_VALUES),
    comprimento_m:   rng.float(50, 500),
    tipo_cabo:       rng.pick(CABO_VALUES),
    poste_inicio_id: null,  // explicitly dangling
    poste_fim_id:    null,
    wkt:  `LINESTRING(${startLon.toFixed(6)} ${startLat.toFixed(6)}, ${endLon.toFixed(6)} ${endLat.toFixed(6)})`,
    srid: 4326,
  }
}

/** VR-003: self-intersecting polygon (figure-8 shape) */
export function generateVR003Subestacao(rng: SeededRng, index: number): SubestacaoRow {
  const cx = rng.float(BBOX.minLon + 0.1, BBOX.maxLon - 0.1)
  const cy = rng.float(BBOX.minLat + 0.1, BBOX.maxLat - 0.1)
  const s  = 0.05  // size

  // Figure-8: ring crosses itself at the center — guaranteed STIsValid = 0
  const ring = [
    `${(cx - s).toFixed(6)} ${(cy - s).toFixed(6)}`,
    `${(cx + s).toFixed(6)} ${(cy + s).toFixed(6)}`,  // ← crossing diagonal
    `${(cx + s).toFixed(6)} ${(cy - s).toFixed(6)}`,
    `${(cx - s).toFixed(6)} ${(cy + s).toFixed(6)}`,  // ← crossing diagonal
    `${(cx - s).toFixed(6)} ${(cy - s).toFixed(6)}`,  // close ring
  ].join(', ')

  return {
    codigo:         `S-VR003-${String(index).padStart(4, '0')}`,
    nome:           `Subestacao Invalida VR003 ${index}`,
    capacidade_mva: rng.float(10, 500),
    wkt:            `POLYGON((${ring}))`,
    srid:           4326,
  }
}

/** VR-005: feature with wrong SRID (3857 instead of 4326) */
export function generateVR005Poste(rng: SeededRng, index: number): PosteRow {
  // Coordinates that look like EPSG:3857 (Web Mercator) values — large numbers
  const x = rng.float(-6000000, -5000000)
  const y = rng.float(-3100000, -2500000)

  return {
    codigo:   `P-VR005-${String(index).padStart(5, '0')}`,
    nome:     `Poste SRID Errado VR005 ${index}`,
    tensao:   rng.pick(TENSAO_VALUES),
    material: rng.pick(MATERIAL_VALUES),
    altura_m: rng.float(8.0, 18.0),
    wkt:      `POINT(${x.toFixed(2)} ${y.toFixed(2)})`,
    srid:     3857,  // Wrong SRID — will be caught by VR-005 view
  }
}
