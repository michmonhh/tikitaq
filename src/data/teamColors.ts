/**
 * Team-Farben-Logik.
 *
 * Jedes Team hat eine Heim- und Auswaertsfarbe. Wenn beide Teams aehnliche
 * Heimfarben haben (z.B. Bayern rot vs Mainz rot), faellt das Auswaerts-
 * Team automatisch auf seine colorAlt zurueck. Plus: pro Disc wird die
 * Text-Farbe (Position-Label) dynamisch gewaehlt — schwarze Schrift auf
 * hellen Discs, weisse auf dunklen.
 */

import { TEAMS } from './teams'
import { getEffectiveColor } from './teamOverrides'

// ── Hex-Helpers ─────────────────────────────────────────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = hex.replace('#', '')
  const full = m.length === 3
    ? m.split('').map(c => c + c).join('')
    : m
  const num = parseInt(full, 16)
  return {
    r: (num >> 16) & 0xff,
    g: (num >> 8) & 0xff,
    b: num & 0xff,
  }
}

/** Euklidische RGB-Distanz (0..441). Wird fuer Aehnlichkeit benutzt. */
export function colorDistance(a: string, b: string): number {
  const ra = hexToRgb(a)
  const rb = hexToRgb(b)
  return Math.sqrt(
    (ra.r - rb.r) ** 2 + (ra.g - rb.g) ** 2 + (ra.b - rb.b) ** 2,
  )
}

/** Pragmatische Schwelle: ab wann sind zwei Farben "zu aehnlich"
 *  fuer Spieler-Discs auf demselben Pitch? */
export const SIMILAR_COLOR_THRESHOLD = 110

/** Relative Luminanz nach WCAG (0..1). */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex)
  const toLin = (c: number) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b)
}

/** Liefert die Text-Farbe ('#000' oder '#fff'), die auf der Disc-Farbe
 *  am besten lesbar ist. Schwelle 0.45 ist empirisch — gelb (~0.9)
 *  bekommt schwarz, dunkelblau (~0.05) bekommt weiss. */
export function getContrastTextColor(bg: string): string {
  return relativeLuminance(bg) > 0.45 ? '#000000' : '#ffffff'
}

// ── Disc-Farben-Picker ───────────────────────────────────────────

export interface DiscColors {
  /** Hintergrundfarbe der Spieler-Disc */
  disc: string
  /** Text-Farbe fuer Position-Label (Kontrast-optimiert) */
  text: string
}

export interface MatchDiscColors {
  home: DiscColors
  away: DiscColors
}

/**
 * Bestimmt die Disc-Farben fuer beide Teams eines Matches.
 *
 * - Heim spielt immer in seiner Heimfarbe (color)
 * - Auswaerts spielt in colorAlt, wenn die Heimfarben zu aehnlich sind
 *   (Distanz < SIMILAR_COLOR_THRESHOLD). Sonst auch in seiner Heimfarbe.
 * - Falls auch colorAlt vs Heim noch zu aehnlich, fallback auf
 *   '#ffffff' (default Auswaertstrikot).
 *
 * Plus: pro Team Text-Farbe gemaess Disc-Helligkeit.
 */
export function pickDiscColors(
  homeTeamId: number,
  awayTeamId: number,
): MatchDiscColors {
  const homeTeam = TEAMS.find(t => t.id === homeTeamId)
  const awayTeam = TEAMS.find(t => t.id === awayTeamId)

  const homeBase = getEffectiveColor(homeTeamId)
  const awayBase = getEffectiveColor(awayTeamId)
  const awayAlt = awayTeam?.colorAlt ?? '#ffffff'

  let awayDisc = awayBase
  if (colorDistance(homeBase, awayBase) < SIMILAR_COLOR_THRESHOLD) {
    awayDisc = awayAlt
    // Letzter Fallback: wenn auch colorAlt zu nah am Heim ist
    if (colorDistance(homeBase, awayDisc) < SIMILAR_COLOR_THRESHOLD) {
      awayDisc = relativeLuminance(homeBase) > 0.5 ? '#101418' : '#ffffff'
    }
  }

  return {
    home: {
      disc: homeBase,
      text: getContrastTextColor(homeBase),
    },
    away: {
      disc: awayDisc,
      text: getContrastTextColor(awayDisc),
    },
  }
  void homeTeam // keep imports tree-shakable warning quiet
}
