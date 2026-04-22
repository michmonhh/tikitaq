// All game constants in one place.
// Coordinate system: 0-100 for both X and Y (percentage-based).
// Team 1 defends bottom (y=100), attacks top (y=0).
// Team 2 defends top (y=0), attacks bottom (y=100).

// --- Pitch Dimensions ---
export const PITCH = {
  WIDTH: 100,
  HEIGHT: 100,
  ASPECT_RATIO: 1.5, // Visual aspect ratio for 3D perspective (width:height feeling)

  // Boundaries (players can't go beyond these)
  MIN_X: 4,
  MAX_X: 96,
  MIN_Y: 3,
  MAX_Y: 97,

  // Center
  CENTER_X: 50,
  CENTER_Y: 50,
  CENTER_CIRCLE_RADIUS: 9.15,

  // Penalty areas
  PENALTY_AREA_LEFT: 18,
  PENALTY_AREA_RIGHT: 82,
  PENALTY_AREA_DEPTH: 16.5, // From goal line

  // Goal area
  GOAL_AREA_LEFT: 30,
  GOAL_AREA_RIGHT: 70,
  GOAL_AREA_DEPTH: 5.5,

  // Goals
  GOAL_LEFT: 38,
  GOAL_RIGHT: 62,
  GOAL_TOP_Y: 0,    // Team 1 scores here
  GOAL_BOTTOM_Y: 100, // Team 2 scores here

  // Penalty spots
  PENALTY_SPOT_TOP_Y: 11,
  PENALTY_SPOT_BOTTOM_Y: 89,
} as const

// --- Player Movement ---
export const MOVEMENT = {
  BASE_RADIUS: 10,      // Base movement radius (% of pitch)
  MIN_FACTOR: 0.5,      // Minimum multiplier (low pacing)
  STAT_WEIGHT: 0.01,    // pacing * this + MIN_FACTOR = multiplier
} as const

// --- Passing ---
export const PASSING = {
  BASE_RADIUS: 60,      // Base pass radius (% of pitch)
  MIN_FACTOR: 0.5,
  STAT_WEIGHT: 0.01,    // highPassing stat weight
  RECEIVE_RADIUS: 3,    // How close ball must land to receiver
} as const

// --- Interception ---
// Feld-Intercept-Radien per 2026-04-22 halbiert (User-Beobachtung aus Arena-
// Replay: Pässe werden zu oft abgefangen, Ballprogression stirbt im Mittelfeld).
// GOALKEEPER_RADIUS ist Shot-Save, nicht Pass-Intercept → unverändert.
export const INTERCEPTION = {
  GOALKEEPER_RADIUS: 3,  // TW save radius (must be in the shot line)
  DEFENDER_RADIUS: 3,    // IV, LV, RV  (war 6)
  MIDFIELDER_RADIUS: 2.5, // ZDM, LM, RM, OM  (war 5)
  FORWARD_RADIUS: 2,     // ST  (war 4)
} as const

// --- Tackling ---
export const TACKLING = {
  BASE_RADIUS: 6,       // Base tackle radius (% of pitch)
  MIN_FACTOR: 0.5,
  STAT_WEIGHT: 0.01,    // defensiveRadius stat weight
  // Win probability: attacker's ballShielding vs defender's tackling
  BASE_WIN_CHANCE: 0.5,
  STAT_INFLUENCE: 0.005, // Per stat point difference
} as const

// --- Shooting ---
export const SHOOTING = {
  // Goal zone: ball must be dragged here to count as shot
  GOAL_ZONE_Y_TOP: 4,    // For Team 1 attacking top
  GOAL_ZONE_Y_BOTTOM: 96, // For Team 2 attacking bottom
  GOAL_ZONE_X_LEFT: 38,
  GOAL_ZONE_X_RIGHT: 62,

  // Save probability factors.
  // 2026-04-22: BASE_SAVE_CHANCE 0.5 → 0.35, DISTANCE_PENALTY 0.01 → 0.005.
  // Nahdistanz-Schüsse (<= 10 m) hatten vorher saveChance ~0.65–0.75 und
  // Torchancen ~20 %; realistisch sind eher 50–60 % Konversion aus dem
  // Fünfmeterraum. Ergebnis im 306-RR: Ø Tore/Match steigt Richtung 1–2.
  BASE_SAVE_CHANCE: 0.35,
  KEEPER_QUALITY_WEIGHT: 0.004,  // Per keeper quality point
  SHOOTER_FINISHING_WEIGHT: 0.004, // Per shooter finishing point
  DISTANCE_PENALTY: 0.005, // Per unit distance from goal center
} as const

// --- Turn & Game Flow ---
export const GAME = {
  HALF_DURATION: 45,     // Minutes per regulation half
  ET_HALF_DURATION: 15,  // Minutes per extra-time half (IFAB Law 7)
  TOTAL_HALVES: 2,
  MINUTES_PER_TURN: 1,   // Game minutes that pass each turn
  MAX_PASSES_PER_TURN: 1,
  SHOOTOUT_ROUNDS: 5,    // IFAB Law 10: first five kicks per team
} as const

// --- Player Defaults ---
export const PLAYER_DEFAULTS: Record<string, number> = {
  pacing: 70,
  finishing: 70,
  shortPassing: 70,
  highPassing: 70,
  tackling: 70,
  defensiveRadius: 70,
  ballShielding: 70,
  dribbling: 70,
  quality: 70,
} as const

// --- Visual (for Canvas rendering) ---
export const VISUAL = {
  PLAYER_RADIUS: 16,      // px at base scale
  BALL_RADIUS: 8,          // px at base scale
  TEAM1_COLOR: '#eada1e',  // Yellow
  TEAM2_COLOR: '#e32221',  // Red
  BALL_COLOR: '#ffffff',
  PITCH_COLOR: '#2d8a4e',
  LINE_COLOR: '#ffffff',
  MOVEMENT_RANGE_COLOR: 'rgba(255, 255, 255, 0.3)',
  PASS_RANGE_COLOR: 'rgba(0, 200, 80, 0.3)',
  TACKLE_RANGE_COLOR: 'rgba(255, 50, 50, 0.3)',
  OFFSIDE_LINE_COLOR: 'rgba(255, 255, 0, 0.6)',
} as const
