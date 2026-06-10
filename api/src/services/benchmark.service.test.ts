import { describe, it, expect } from 'vitest'
import { computeMetrics, determineWinner } from './benchmark.service.js'

// ---------------------------------------------------------------------------
// computeMetrics
// ---------------------------------------------------------------------------
describe('computeMetrics', () => {
  it('computes p50/p95/p99 from 10 unsorted timings', () => {
    // Intentionally unsorted to confirm the function sorts internally
    const timings = [10, 50, 30, 90, 20, 80, 40, 70, 60, 100]
    // sorted: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
    // p50  → index floor(10 × 0.50) = 5  → 60
    // p95  → index floor(10 × 0.95) = 9  → 100
    // p99  → index floor(10 × 0.99) = 9  → 100
    // avg  → 55  → throughput = round(1000/55) = 18
    const result = computeMetrics(timings)
    expect(result.p50).toBe(60)
    expect(result.p95).toBe(100)
    expect(result.p99).toBe(100)
    expect(result.throughput_rps).toBe(18)
  })

  it('does not mutate the input array', () => {
    const timings = [30, 10, 20]
    computeMetrics(timings)
    expect(timings).toEqual([30, 10, 20])
  })

  it('handles a single timing', () => {
    const result = computeMetrics([42])
    expect(result.p50).toBe(42)
    expect(result.p95).toBe(42)
    expect(result.p99).toBe(42)
    expect(result.throughput_rps).toBe(Math.round(1000 / 42))
  })

  it('returns 0 throughput when average is 0', () => {
    expect(computeMetrics([0, 0, 0]).throughput_rps).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// determineWinner
// ---------------------------------------------------------------------------
describe('determineWinner', () => {
  it('returns tie when difference is strictly less than 5 ms', () => {
    expect(determineWinner(100, 100).winner).toBe('tie')
    expect(determineWinner(100, 103).winner).toBe('tie')
    expect(determineWinner(100, 104).winner).toBe('tie')
  })

  it('returns tie with 0 margin_pct', () => {
    expect(determineWinner(100, 102).margin_pct).toBe(0)
  })

  it('does NOT treat exactly 5 ms difference as a tie', () => {
    // diff = 105 - 100 = 5, |5| < 5 is false → should produce a winner
    expect(determineWinner(100, 105).winner).toBe('sqlserver')
  })

  it('returns sqlserver when it is faster by >= 5 ms', () => {
    const { winner, margin_pct } = determineWinner(50, 100)
    expect(winner).toBe('sqlserver')
    expect(margin_pct).toBe(50) // (100 − 50) / 100 × 100 = 50 %
  })

  it('returns postgis when it is faster by >= 5 ms', () => {
    const { winner, margin_pct } = determineWinner(100, 60)
    expect(winner).toBe('postgis')
    expect(margin_pct).toBe(40) // (100 − 60) / 100 × 100 = 40 %
  })

  it('calculates margin_pct as 100 when winner p95 is 0 ms', () => {
    // sqlserver at 0 ms vs postgis at 10 ms → sqlserver wins 100 %
    const { winner, margin_pct } = determineWinner(0, 10)
    expect(winner).toBe('sqlserver')
    expect(margin_pct).toBe(100)
  })
})
