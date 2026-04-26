import type { DefenseStrategy, AttackStrategy } from '../types'

export type RoleGroup = 'defender' | 'midfielder' | 'attacker'

export interface PositionConfig {
  verticalOffset: number    // Einheiten in Vorwärtsrichtung (negativ = zurück)
  ballAttractionY: number   // 0–1: Verschiebung Richtung Ball (vertikal)
  ballAttractionX: number   // 0–1: Verschiebung Richtung Ball (horizontal)
  widthScale: number        // 1.0 = normal, <1 = enger, >1 = weiter
}

export interface PressingConfig {
  maxPressers: number
  radius: number
  allowDefenders: boolean
}

// ── Defensiv-Verhalten pro Strategie ──

export const DEF_BEHAVIOR: Record<DefenseStrategy, Record<RoleGroup, PositionConfig>> = {
  high_press: {
    defender:   { verticalOffset: 2,  ballAttractionY: 0.18, ballAttractionX: 0.20, widthScale: 1.00 },
    midfielder: { verticalOffset: 4,  ballAttractionY: 0.25, ballAttractionX: 0.18, widthScale: 0.95 },
    // Stürmer nicht mehr vom tiefen Ball magnetisch angezogen — sie bleiben
    // als Konter-Anker vorn. Arena-Befund vor Fix: Box-Präsenz ≈ 1 %.
    attacker:   { verticalOffset: 3,  ballAttractionY: 0.05, ballAttractionX: 0.12, widthScale: 0.85 },
  },
  mid_press: {
    defender:   { verticalOffset: 0,  ballAttractionY: 0.18, ballAttractionX: 0.20, widthScale: 1.00 },
    midfielder: { verticalOffset: 0,  ballAttractionY: 0.22, ballAttractionX: 0.18, widthScale: 0.95 },
    attacker:   { verticalOffset: -3, ballAttractionY: 0.03, ballAttractionX: 0.12, widthScale: 1.00 },
  },
  deep_block: {
    defender:   { verticalOffset: -5, ballAttractionY: 0.15, ballAttractionX: 0.20, widthScale: 1.05 },
    midfielder: { verticalOffset: -3, ballAttractionY: 0.18, ballAttractionX: 0.18, widthScale: 0.95 },
    attacker:   { verticalOffset: 0,  ballAttractionY: 0.02, ballAttractionX: 0.12, widthScale: 0.95 },
  },
  man_marking: {
    // Platzhalter — Manndeckung nutzt separate Logik
    defender:   { verticalOffset: 0, ballAttractionY: 0, ballAttractionX: 0, widthScale: 1.0 },
    midfielder: { verticalOffset: 0, ballAttractionY: 0, ballAttractionX: 0, widthScale: 1.0 },
    attacker:   { verticalOffset: 0, ballAttractionY: 0, ballAttractionX: 0, widthScale: 1.0 },
  },
  catenaccio: {
    // Sehr tief, eng, kein Ball-Anziehung in der Höhe — die Kette steht.
    // Stürmer halten als Konter-Anker eher hoch (Ballverlust für Konter).
    defender:   { verticalOffset: -8, ballAttractionY: 0.10, ballAttractionX: 0.18, widthScale: 0.92 },
    midfielder: { verticalOffset: -6, ballAttractionY: 0.14, ballAttractionX: 0.16, widthScale: 0.88 },
    attacker:   { verticalOffset: 2,  ballAttractionY: 0.00, ballAttractionX: 0.08, widthScale: 0.85 },
  },
}

// ── Offensiv-Verhalten pro Strategie ──

export const ATK_BEHAVIOR: Record<AttackStrategy, Record<RoleGroup, PositionConfig>> = {
  possession: {
    defender:   { verticalOffset: 5,  ballAttractionY: 0.05, ballAttractionX: 0.00, widthScale: 1.15 },
    midfielder: { verticalOffset: 8,  ballAttractionY: 0.05, ballAttractionX: 0.00, widthScale: 1.15 },
    attacker:   { verticalOffset: 12, ballAttractionY: 0.05, ballAttractionX: 0.00, widthScale: 1.10 },
  },
  counter: {
    defender:   { verticalOffset: 2,  ballAttractionY: 0.03, ballAttractionX: 0.00, widthScale: 1.05 },
    midfielder: { verticalOffset: 8,  ballAttractionY: 0.05, ballAttractionX: 0.00, widthScale: 1.10 },
    attacker:   { verticalOffset: 18, ballAttractionY: 0.00, ballAttractionX: 0.00, widthScale: 1.05 },
  },
  wing_play: {
    defender:   { verticalOffset: 4,  ballAttractionY: 0.05, ballAttractionX: 0.00, widthScale: 1.15 },
    midfielder: { verticalOffset: 7,  ballAttractionY: 0.05, ballAttractionX: 0.00, widthScale: 1.25 },
    attacker:   { verticalOffset: 12, ballAttractionY: 0.05, ballAttractionX: 0.00, widthScale: 1.10 },
  },
  switch_play: {
    defender:   { verticalOffset: 4,  ballAttractionY: 0.05, ballAttractionX: 0.00, widthScale: 1.20 },
    midfielder: { verticalOffset: 6,  ballAttractionY: 0.05, ballAttractionX: 0.00, widthScale: 1.20 },
    attacker:   { verticalOffset: 10, ballAttractionY: 0.03, ballAttractionX: 0.00, widthScale: 1.15 },
  },
  direct: {
    defender:   { verticalOffset: 3,  ballAttractionY: 0.03, ballAttractionX: 0.00, widthScale: 1.05 },
    midfielder: { verticalOffset: 8,  ballAttractionY: 0.05, ballAttractionX: 0.00, widthScale: 1.10 },
    attacker:   { verticalOffset: 18, ballAttractionY: 0.00, ballAttractionX: 0.00, widthScale: 1.05 },
  },
}

// ── Pressing-Konfiguration ──

export const PRESS_CONFIG: Record<DefenseStrategy, PressingConfig> = {
  high_press:  { maxPressers: 2, radius: 20, allowDefenders: false },
  mid_press:   { maxPressers: 1, radius: 15, allowDefenders: false },
  deep_block:  { maxPressers: 1, radius: 12, allowDefenders: false },
  man_marking: { maxPressers: 1, radius: 15, allowDefenders: false },
  // Catenaccio drückt fast nicht — der Block steht und wartet ab.
  // Pressing nur wenn der Carrier ganz nah ans 16er kommt.
  catenaccio:  { maxPressers: 1, radius: 8,  allowDefenders: false },
}

export const GEGENPRESS_CONFIG: PressingConfig = { maxPressers: 2, radius: 22, allowDefenders: false }
