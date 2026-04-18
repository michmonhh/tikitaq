// Poisson-Sampling per Knuth-Algorithmus — für Tor-Anzahl mit gegebener xG-Erwartung.
// λ = xG, RNG muss [0,1) liefern.
export function poissonSample(lambda: number, rand: () => number): number {
  if (lambda <= 0) return 0
  // Knuth: multiplicative method; für λ ≤ ~10 schnell und exakt genug.
  const L = Math.exp(-lambda)
  let k = 0
  let p = 1
  // Safety-Cap: 12 Tore reichen für jedes realistische Ergebnis.
  while (k < 12) {
    k++
    p *= rand()
    if (p <= L) return k - 1
  }
  return k - 1
}
