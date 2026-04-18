// Mulberry32 — kleine, schnelle, deterministische RNG.
// Gibt Zufallszahlen in [0, 1) zurück, seedbar für reproduzierbare Simulationen.
export function createRng(seed: number): () => number {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let x = t
    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

// Default-Seed: aus aktueller Uhrzeit — für echte Varianz außerhalb von Tests.
export function randomSeed(): number {
  return (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0
}
