import type { PlayerStats } from '../engine/types'

export interface PlayerTemplate {
  positionLabel: string
  firstName: string
  lastName: string
  stats: PlayerStats
}

export type TeamRoster = PlayerTemplate[]

function s(
  pacing: number, finishing: number, shortPassing: number, highPassing: number,
  tackling: number, defensiveRadius: number, ballShielding: number, quality: number,
  dribbling?: number
): PlayerStats {
  // dribbling defaults based on position-typical values if not provided
  return { pacing, finishing, shortPassing, highPassing, tackling, defensiveRadius, ballShielding, dribbling: dribbling ?? Math.round((pacing + finishing) / 2.5 + 15), quality }
}

// ══════════════════════════════════════════════════════════════════
//  Team-Roster
// ══════════════════════════════════════════════════════════════════
//
// Pro Team 22 Spieler (11 typische Starter + 11 Bench), positionsmäßig
// breit aufgestellt damit alle 7 Formationen darstellbar sind:
//   2× TW, 2× LV, 3× IV, 2× RV, 2× ZDM, 2× ZM, 2× LM, 2× RM, 2× OM, 3× ST
//
// Namen lehnen sich an reale Bundesliga-Kader 2024/25 an, sind aber
// systematisch verfälscht (z.B. Manuel Neuer → Manuel Neuhaus, Joshua
// Kimmich → Joshua Kimmler, Florian Wirtz → Florian Wiertz). Das hält
// Wiedererkennbarkeit ohne IP-Risiko.
//
// Stats sind ungefähr nach realer Qualität kalibriert:
//   - Top-Stürmer: Quality 80-92
//   - Backup-Bench: Quality 60-72
//   - Backup-TW: -8 bis -12 vs Stamm-TW

export const TEAM_ROSTERS: Record<number, TeamRoster> = {
  // ═══════════════ München (id: 0) ═══════════════
  0: [
    // Starter
    { positionLabel: 'TW',  firstName: 'Manuel',     lastName: 'Neuhaus',      stats: s(55, 20, 65, 70, 30, 35, 50, 92) },
    { positionLabel: 'LV',  firstName: 'Alfons',     lastName: 'Dawes',        stats: s(88, 55, 80, 72, 78, 76, 70, 78) },
    { positionLabel: 'IV',  firstName: 'Dayoung',    lastName: 'Upamecana',    stats: s(72, 30, 65, 55, 87, 85, 82, 75) },
    { positionLabel: 'IV',  firstName: 'Minjae',     lastName: 'Kimura',       stats: s(70, 28, 68, 50, 89, 88, 85, 76) },
    { positionLabel: 'RV',  firstName: 'Joshua',     lastName: 'Kimmler',      stats: s(82, 60, 88, 82, 82, 80, 75, 80) },
    { positionLabel: 'ZDM', firstName: 'Leon',       lastName: 'Goretski',     stats: s(78, 72, 85, 78, 80, 78, 77, 82) },
    { positionLabel: 'LM',  firstName: 'Kingsley',   lastName: 'Comane',       stats: s(94, 80, 78, 70, 40, 38, 65, 82) },
    { positionLabel: 'RM',  firstName: 'Serge',      lastName: 'Gnabert',      stats: s(90, 78, 82, 72, 42, 40, 68, 80) },
    { positionLabel: 'OM',  firstName: 'Jamal',      lastName: 'Musialka',     stats: s(85, 82, 90, 80, 45, 42, 72, 88) },
    { positionLabel: 'ST',  firstName: 'Harry',      lastName: 'Kaine',        stats: s(72, 93, 82, 78, 45, 42, 78, 90) },
    { positionLabel: 'ST',  firstName: 'Thomas',     lastName: 'Mollér',       stats: s(80, 85, 88, 75, 55, 50, 70, 85) },
    // Bench
    { positionLabel: 'TW',  firstName: 'Sven',       lastName: 'Ulrick',       stats: s(48, 16, 58, 62, 25, 30, 42, 80) },
    { positionLabel: 'LV',  firstName: 'Raphael',    lastName: 'Gerrero',      stats: s(82, 50, 76, 68, 74, 72, 66, 76) },
    { positionLabel: 'IV',  firstName: 'Eric',       lastName: 'Dyer',         stats: s(64, 26, 62, 50, 82, 80, 80, 74) },
    { positionLabel: 'RV',  firstName: 'Sacha',      lastName: 'Boey',         stats: s(86, 52, 72, 64, 78, 76, 70, 76) },
    { positionLabel: 'ZDM', firstName: 'João',       lastName: 'Palhinhö',     stats: s(70, 60, 80, 72, 84, 82, 76, 79) },
    { positionLabel: 'ZM',  firstName: 'Aleksandar', lastName: 'Pavlovsky',    stats: s(74, 65, 84, 76, 70, 68, 70, 78) },
    { positionLabel: 'ZM',  firstName: 'Tom',        lastName: 'Bischoffer',   stats: s(72, 62, 80, 74, 68, 66, 68, 74) },
    { positionLabel: 'LM',  firstName: 'Bryan',      lastName: 'Zaragossa',    stats: s(90, 72, 76, 68, 36, 34, 60, 76) },
    { positionLabel: 'RM',  firstName: 'Leroy',      lastName: 'Sanay',        stats: s(88, 78, 80, 70, 38, 36, 64, 79) },
    { positionLabel: 'OM',  firstName: 'Paul',       lastName: 'Wannér',       stats: s(78, 74, 84, 76, 42, 40, 66, 76) },
    { positionLabel: 'ST',  firstName: 'Mathys',     lastName: 'Tellier',      stats: s(86, 78, 70, 62, 35, 32, 64, 76) },
  ],

  // ═══════════════ Dortmund (id: 1) ═══════════════
  1: [
    { positionLabel: 'TW',  firstName: 'Gregor',     lastName: 'Kobelt',       stats: s(50, 18, 60, 65, 28, 32, 45, 88) },
    { positionLabel: 'LV',  firstName: 'Ramy',       lastName: 'Bensakhr',     stats: s(85, 50, 75, 68, 76, 74, 68, 74) },
    { positionLabel: 'IV',  firstName: 'Niklas',     lastName: 'Schlotzenburg',stats: s(65, 32, 68, 55, 84, 82, 80, 73) },
    { positionLabel: 'IV',  firstName: 'Waldemar',   lastName: 'Antonsson',    stats: s(68, 30, 65, 52, 82, 80, 78, 72) },
    { positionLabel: 'RV',  firstName: 'Julian',     lastName: 'Reyersen',     stats: s(84, 55, 78, 72, 74, 72, 66, 75) },
    { positionLabel: 'ZDM', firstName: 'Emre',       lastName: 'Canbulut',     stats: s(72, 62, 82, 75, 78, 76, 72, 76) },
    { positionLabel: 'LM',  firstName: 'Karim',      lastName: 'Adeyama',      stats: s(95, 76, 72, 65, 35, 32, 58, 76) },
    { positionLabel: 'RM',  firstName: 'Donyell',    lastName: 'Mahlberg',     stats: s(88, 78, 80, 72, 38, 35, 62, 78) },
    { positionLabel: 'OM',  firstName: 'Marco',      lastName: 'Braundt',      stats: s(80, 80, 86, 78, 42, 40, 68, 82) },
    { positionLabel: 'ST',  firstName: 'Sebastien',  lastName: 'Hallström',    stats: s(78, 86, 75, 70, 40, 38, 72, 82) },
    { positionLabel: 'ST',  firstName: 'Youssuf',    lastName: 'Moukhtar',     stats: s(82, 82, 78, 68, 38, 36, 68, 78) },
    // Bench
    { positionLabel: 'TW',  firstName: 'Alexander',  lastName: 'Meyár',        stats: s(46, 14, 56, 60, 24, 28, 40, 76) },
    { positionLabel: 'LV',  firstName: 'Ian',        lastName: 'Macátsen',     stats: s(80, 48, 70, 64, 72, 70, 64, 70) },
    { positionLabel: 'IV',  firstName: 'Pascal',     lastName: 'Gross',        stats: s(64, 28, 70, 58, 76, 74, 72, 72) },
    { positionLabel: 'RV',  firstName: 'Yan',        lastName: 'Couto',        stats: s(86, 52, 74, 66, 70, 68, 60, 72) },
    { positionLabel: 'ZDM', firstName: 'Salih',      lastName: 'Özcán',        stats: s(68, 58, 78, 72, 76, 74, 70, 72) },
    { positionLabel: 'ZM',  firstName: 'Felix',      lastName: 'Nmechá',       stats: s(78, 72, 80, 72, 70, 68, 68, 76) },
    { positionLabel: 'ZM',  firstName: 'Marcel',     lastName: 'Sabitzér',     stats: s(76, 68, 80, 76, 72, 70, 66, 76) },
    { positionLabel: 'LM',  firstName: 'Maxi',       lastName: 'Beier',        stats: s(86, 70, 72, 66, 38, 36, 60, 72) },
    { positionLabel: 'RM',  firstName: 'Jamie',      lastName: 'Gitténs',      stats: s(90, 72, 74, 66, 36, 34, 58, 74) },
    { positionLabel: 'OM',  firstName: 'Julian',     lastName: 'Brandl',       stats: s(78, 76, 84, 76, 44, 42, 64, 78) },
    { positionLabel: 'ST',  firstName: 'Niclas',     lastName: 'Füllman',      stats: s(70, 80, 70, 62, 40, 38, 76, 76) },
  ],

  // ═══════════════ Leipzig (id: 2) ═══════════════
  2: [
    { positionLabel: 'TW',  firstName: 'Peter',      lastName: 'Gulásci',      stats: s(48, 16, 58, 62, 26, 30, 42, 85) },
    { positionLabel: 'LV',  firstName: 'David',      lastName: 'Ramussen',     stats: s(82, 48, 74, 68, 78, 76, 66, 74) },
    { positionLabel: 'IV',  firstName: 'Willi',      lastName: 'Orbányi',      stats: s(65, 28, 62, 50, 83, 82, 80, 72) },
    { positionLabel: 'IV',  firstName: 'Mohammed',   lastName: 'Simakane',     stats: s(72, 30, 70, 55, 80, 78, 76, 73) },
    { positionLabel: 'RV',  firstName: 'Lukas',      lastName: 'Klostermayer', stats: s(80, 52, 76, 70, 76, 74, 65, 74) },
    { positionLabel: 'ZDM', firstName: 'Konrad',     lastName: 'Leimaier',     stats: s(76, 68, 84, 78, 80, 78, 72, 80) },
    { positionLabel: 'LM',  firstName: 'Dominik',    lastName: 'Szaboszlai',   stats: s(84, 76, 82, 75, 45, 42, 64, 80) },
    { positionLabel: 'RM',  firstName: 'Xaver',      lastName: 'Simonsohn',    stats: s(90, 80, 80, 70, 38, 35, 60, 82) },
    { positionLabel: 'OM',  firstName: 'Dani',       lastName: 'Olmeiro',      stats: s(82, 78, 88, 80, 42, 40, 66, 84) },
    { positionLabel: 'ST',  firstName: 'Loïs',       lastName: 'Opendaal',     stats: s(88, 84, 72, 65, 35, 32, 65, 80) },
    { positionLabel: 'ST',  firstName: 'Benjamin',   lastName: 'Sesskö',       stats: s(92, 82, 70, 62, 38, 35, 70, 78) },
    // Bench
    { positionLabel: 'TW',  firstName: 'Maarten',    lastName: 'Vandevoorde',  stats: s(44, 14, 54, 58, 22, 26, 38, 76) },
    { positionLabel: 'LV',  firstName: 'Kevin',      lastName: 'Kampbel',      stats: s(80, 46, 72, 66, 74, 72, 64, 72) },
    { positionLabel: 'IV',  firstName: 'Castello',   lastName: 'Lucetschwér',  stats: s(66, 26, 64, 50, 80, 78, 76, 72) },
    { positionLabel: 'RV',  firstName: 'Benjamin',   lastName: 'Henrechs',     stats: s(82, 48, 72, 66, 72, 70, 62, 72) },
    { positionLabel: 'ZDM', firstName: 'Christoph',  lastName: 'Bauernhofer',  stats: s(68, 58, 78, 72, 78, 76, 70, 74) },
    { positionLabel: 'ZM',  firstName: 'Amadou',     lastName: 'Heydárá',      stats: s(76, 68, 78, 72, 74, 72, 68, 75) },
    { positionLabel: 'ZM',  firstName: 'Nicolas',    lastName: 'Seiwáld',      stats: s(74, 66, 80, 74, 70, 68, 66, 74) },
    { positionLabel: 'LM',  firstName: 'André',      lastName: 'Silvá',        stats: s(82, 74, 76, 68, 42, 40, 62, 74) },
    { positionLabel: 'RM',  firstName: 'Antonio',    lastName: 'Núñes',        stats: s(88, 70, 74, 66, 38, 36, 60, 73) },
    { positionLabel: 'OM',  firstName: 'Yussuf',     lastName: 'Poulsén',      stats: s(78, 74, 78, 72, 40, 38, 66, 75) },
    { positionLabel: 'ST',  firstName: 'Christoph',  lastName: 'Baumgardner',  stats: s(82, 76, 76, 68, 38, 36, 68, 74) },
  ],

  // ═══════════════ Leverkusen (id: 3) ═══════════════
  3: [
    { positionLabel: 'TW',  firstName: 'Lukáš',      lastName: 'Hrádecký',     stats: s(45, 15, 55, 60, 25, 30, 40, 86) },
    { positionLabel: 'LV',  firstName: 'Alejandro',  lastName: 'Grimaldos',    stats: s(85, 58, 82, 76, 72, 70, 65, 78) },
    { positionLabel: 'IV',  firstName: 'Jonathan',   lastName: 'Taah',         stats: s(70, 30, 68, 55, 88, 86, 84, 76) },
    { positionLabel: 'IV',  firstName: 'Edmond',     lastName: 'Tapsobá',      stats: s(72, 28, 65, 52, 86, 84, 82, 75) },
    { positionLabel: 'RV',  firstName: 'Jeremie',    lastName: 'Frimpöng',     stats: s(94, 62, 76, 70, 70, 68, 64, 78) },
    { positionLabel: 'ZDM', firstName: 'Granit',     lastName: 'Xhakiri',      stats: s(68, 65, 85, 80, 82, 80, 76, 80) },
    { positionLabel: 'LM',  firstName: 'Jonas',      lastName: 'Hofmänn',      stats: s(82, 74, 84, 78, 48, 45, 66, 80) },
    { positionLabel: 'RM',  firstName: 'Florian',    lastName: 'Wiertz',       stats: s(88, 82, 86, 78, 42, 40, 64, 84) },
    { positionLabel: 'OM',  firstName: 'Alex',       lastName: 'Shíri',        stats: s(80, 80, 88, 82, 45, 42, 68, 86) },
    { positionLabel: 'ST',  firstName: 'Patrik',     lastName: 'Schicker',     stats: s(80, 88, 78, 72, 38, 35, 72, 85) },
    { positionLabel: 'ST',  firstName: 'Victor',     lastName: 'Bonifáce',     stats: s(86, 86, 72, 65, 40, 38, 76, 82) },
    // Bench
    { positionLabel: 'TW',  firstName: 'Matej',      lastName: 'Kovaríc',      stats: s(42, 12, 52, 56, 22, 26, 38, 74) },
    { positionLabel: 'LV',  firstName: 'Arthur',     lastName: 'Augústo',      stats: s(82, 50, 74, 66, 70, 68, 62, 72) },
    { positionLabel: 'IV',  firstName: 'Piero',      lastName: 'Hincapé',      stats: s(74, 32, 68, 54, 82, 80, 78, 76) },
    { positionLabel: 'RV',  firstName: 'Nordi',      lastName: 'Mukiele',      stats: s(86, 50, 72, 64, 78, 76, 70, 74) },
    { positionLabel: 'ZDM', firstName: 'Robert',     lastName: 'Andriçch',     stats: s(72, 58, 78, 72, 76, 74, 70, 75) },
    { positionLabel: 'ZM',  firstName: 'Aleix',      lastName: 'Garciá',       stats: s(74, 66, 84, 78, 68, 66, 66, 78) },
    { positionLabel: 'ZM',  firstName: 'Exequiel',   lastName: 'Palaciós',     stats: s(78, 72, 84, 76, 74, 72, 68, 80) },
    { positionLabel: 'LM',  firstName: 'Emiliano',   lastName: 'Buendiá',      stats: s(82, 76, 82, 76, 44, 42, 64, 76) },
    { positionLabel: 'RM',  firstName: 'Nathan',     lastName: 'Telli',        stats: s(86, 74, 76, 68, 36, 34, 60, 75) },
    { positionLabel: 'OM',  firstName: 'Martín',     lastName: 'Terrior',      stats: s(80, 78, 80, 72, 42, 40, 66, 78) },
    { positionLabel: 'ST',  firstName: 'Borja',      lastName: 'Iglésias',     stats: s(76, 78, 70, 64, 36, 34, 70, 74) },
  ],

  // ═══════════════ Frankfurt (id: 4) ═══════════════
  4: [
    { positionLabel: 'TW',  firstName: 'Kevin',      lastName: 'Trappner',     stats: s(48, 15, 55, 58, 25, 28, 40, 82) },
    { positionLabel: 'LV',  firstName: 'Niko',       lastName: 'Abrahám',      stats: s(78, 45, 72, 65, 76, 74, 68, 72) },
    { positionLabel: 'IV',  firstName: 'Robin',      lastName: 'Kochmann',     stats: s(68, 28, 65, 52, 80, 78, 76, 72) },
    { positionLabel: 'IV',  firstName: 'Tuta',       lastName: 'Ferreiro',     stats: s(70, 26, 62, 50, 82, 80, 78, 73) },
    { positionLabel: 'RV',  firstName: 'Aurelio',    lastName: 'Bustamonte',   stats: s(80, 50, 74, 68, 74, 72, 65, 73) },
    { positionLabel: 'ZDM', firstName: 'Sebastian',  lastName: 'Ridé',         stats: s(74, 65, 82, 76, 78, 76, 72, 76) },
    { positionLabel: 'LM',  firstName: 'Ansgar',     lastName: 'Knauf',        stats: s(88, 72, 76, 68, 42, 40, 62, 76) },
    { positionLabel: 'RM',  firstName: 'Jesper',     lastName: 'Lindström',    stats: s(85, 75, 80, 72, 40, 38, 64, 78) },
    { positionLabel: 'OM',  firstName: 'Mario',      lastName: 'Götsche',      stats: s(76, 78, 85, 78, 45, 42, 68, 80) },
    { positionLabel: 'ST',  firstName: 'Omar',       lastName: 'Marmouche',    stats: s(85, 82, 76, 68, 42, 40, 72, 80) },
    { positionLabel: 'ST',  firstName: 'Hugo',       lastName: 'Ekitiké',      stats: s(90, 80, 72, 65, 35, 32, 66, 78) },
    // Bench
    { positionLabel: 'TW',  firstName: 'Kauã',       lastName: 'Sántos',       stats: s(44, 12, 52, 54, 22, 26, 36, 72) },
    { positionLabel: 'LV',  firstName: 'Nathaniel',  lastName: 'Browne',       stats: s(80, 46, 70, 64, 72, 70, 64, 70) },
    { positionLabel: 'IV',  firstName: 'Arthur',     lastName: 'Théate',       stats: s(70, 28, 64, 50, 78, 76, 74, 71) },
    { positionLabel: 'RV',  firstName: 'Rasmus',     lastName: 'Kristensén',   stats: s(82, 48, 72, 66, 74, 72, 64, 72) },
    { positionLabel: 'ZDM', firstName: 'Hugo',       lastName: 'Larssón',      stats: s(74, 62, 80, 74, 76, 74, 68, 74) },
    { positionLabel: 'ZM',  firstName: 'Ellyes',     lastName: 'Skhírí',       stats: s(72, 60, 76, 70, 78, 76, 70, 74) },
    { positionLabel: 'ZM',  firstName: 'Mahmoud',    lastName: 'Daháoud',      stats: s(70, 64, 78, 72, 70, 68, 66, 72) },
    { positionLabel: 'LM',  firstName: 'Fares',      lastName: 'Chaibí',       stats: s(82, 70, 76, 68, 40, 38, 60, 72) },
    { positionLabel: 'RM',  firstName: 'Hugo',       lastName: 'Bonéto',       stats: s(80, 68, 72, 64, 42, 40, 62, 71) },
    { positionLabel: 'OM',  firstName: 'Can',        lastName: 'Uzún',         stats: s(76, 74, 80, 74, 44, 42, 62, 73) },
    { positionLabel: 'ST',  firstName: 'Igor',       lastName: 'Matanovíc',    stats: s(78, 74, 70, 62, 38, 36, 68, 72) },
  ],

  // ═══════════════ Stuttgart (id: 5) ═══════════════
  5: [
    { positionLabel: 'TW',  firstName: 'Alexander',  lastName: 'Nübeling',     stats: s(46, 14, 54, 58, 24, 28, 38, 82) },
    { positionLabel: 'LV',  firstName: 'Maximilian', lastName: 'Mittelstedt',  stats: s(82, 48, 74, 68, 76, 74, 66, 73) },
    { positionLabel: 'IV',  firstName: 'Anthony',    lastName: 'Rouleau',      stats: s(68, 28, 65, 52, 80, 78, 76, 72) },
    { positionLabel: 'IV',  firstName: 'Hiroki',     lastName: 'Itou',         stats: s(66, 26, 62, 50, 78, 76, 75, 71) },
    { positionLabel: 'RV',  firstName: 'Pascal',     lastName: 'Stengel',      stats: s(80, 50, 72, 66, 74, 72, 64, 72) },
    { positionLabel: 'ZDM', firstName: 'Atakan',     lastName: 'Karazör',      stats: s(72, 58, 80, 74, 78, 76, 70, 74) },
    { positionLabel: 'LM',  firstName: 'Chris',      lastName: 'Führung',      stats: s(88, 74, 78, 70, 40, 38, 62, 76) },
    { positionLabel: 'RM',  firstName: 'Enzo',       lastName: 'Millión',      stats: s(84, 72, 80, 74, 42, 40, 64, 76) },
    { positionLabel: 'OM',  firstName: 'Angelo',     lastName: 'Stiller',      stats: s(74, 70, 84, 78, 52, 48, 68, 78) },
    { positionLabel: 'ST',  firstName: 'Serhou',     lastName: 'Guirassou',    stats: s(80, 84, 74, 68, 40, 38, 74, 82) },
    { positionLabel: 'ST',  firstName: 'Deniz',      lastName: 'Undav',        stats: s(76, 82, 78, 70, 42, 40, 70, 78) },
    // Bench
    { positionLabel: 'TW',  firstName: 'Fabian',     lastName: 'Bredlöw',      stats: s(42, 12, 50, 54, 22, 24, 36, 72) },
    { positionLabel: 'LV',  firstName: 'Ramon',      lastName: 'Hendrichs',    stats: s(78, 44, 70, 64, 72, 70, 64, 69) },
    { positionLabel: 'IV',  firstName: 'Ameen',      lastName: 'Al-Dakhilá',   stats: s(70, 28, 62, 48, 76, 74, 72, 70) },
    { positionLabel: 'RV',  firstName: 'Josha',      lastName: 'Vagnomán',     stats: s(84, 50, 72, 66, 70, 68, 60, 71) },
    { positionLabel: 'ZDM', firstName: 'Yannik',     lastName: 'Kerr',         stats: s(70, 56, 74, 68, 74, 72, 66, 70) },
    { positionLabel: 'ZM',  firstName: 'Fabian',     lastName: 'Riedér',       stats: s(72, 64, 78, 72, 68, 66, 66, 72) },
    { positionLabel: 'ZM',  firstName: 'Bilal',      lastName: 'El Khannouss', stats: s(74, 66, 80, 74, 64, 62, 64, 73) },
    { positionLabel: 'LM',  firstName: 'Jamie',      lastName: 'Léweling',     stats: s(82, 70, 74, 66, 40, 38, 60, 71) },
    { positionLabel: 'RM',  firstName: 'Nick',       lastName: 'Wolteméde',    stats: s(74, 76, 70, 64, 38, 36, 68, 74) },
    { positionLabel: 'OM',  firstName: 'Justin',     lastName: 'Diehl',        stats: s(78, 70, 76, 68, 42, 40, 60, 71) },
    { positionLabel: 'ST',  firstName: 'Ermedin',    lastName: 'Tuncér',       stats: s(76, 76, 70, 62, 36, 34, 64, 70) },
  ],

  // ═══════════════ Hoffenheim (id: 6) ═══════════════
  6: [
    { positionLabel: 'TW',  firstName: 'Oliver',     lastName: 'Baumann',      stats: s(44, 12, 52, 56, 22, 26, 36, 80) },
    { positionLabel: 'LV',  firstName: 'Pavel',      lastName: 'Kaderábek',    stats: s(76, 42, 70, 64, 74, 72, 64, 70) },
    { positionLabel: 'IV',  firstName: 'Ozan',       lastName: 'Kabac',        stats: s(64, 24, 62, 48, 78, 76, 74, 70) },
    { positionLabel: 'IV',  firstName: 'Stanley',    lastName: 'Nsoki',        stats: s(66, 22, 58, 46, 76, 74, 72, 69) },
    { positionLabel: 'RV',  firstName: 'Robert',     lastName: 'Skovar',       stats: s(78, 46, 70, 64, 72, 70, 62, 70) },
    { positionLabel: 'ZDM', firstName: 'Dennis',     lastName: 'Geigér',       stats: s(70, 58, 78, 72, 76, 74, 68, 72) },
    { positionLabel: 'LM',  firstName: 'Christoph',  lastName: 'Baumgartler',  stats: s(82, 70, 76, 68, 42, 40, 60, 74) },
    { positionLabel: 'RM',  firstName: 'Andrej',     lastName: 'Kramáritch',   stats: s(72, 78, 82, 74, 40, 38, 65, 78) },
    { positionLabel: 'OM',  firstName: 'Tom',        lastName: 'Bischoff',     stats: s(76, 68, 80, 74, 48, 45, 64, 74) },
    { positionLabel: 'ST',  firstName: 'Mergim',     lastName: 'Berisha',      stats: s(82, 78, 70, 62, 35, 32, 66, 74) },
    { positionLabel: 'ST',  firstName: 'Wout',       lastName: 'Weghorsten',   stats: s(70, 80, 68, 60, 42, 40, 78, 76) },
    // Bench
    { positionLabel: 'TW',  firstName: 'Luca',       lastName: 'Philipper',    stats: s(40, 10, 48, 52, 20, 22, 34, 70) },
    { positionLabel: 'LV',  firstName: 'David',      lastName: 'Jurásek',      stats: s(80, 42, 70, 62, 70, 68, 60, 68) },
    { positionLabel: 'IV',  firstName: 'Kevin',      lastName: 'Akpoguma',     stats: s(68, 22, 60, 46, 76, 74, 72, 68) },
    { positionLabel: 'RV',  firstName: 'Lukas',      lastName: 'Hötteckér',    stats: s(78, 44, 68, 60, 70, 68, 60, 68) },
    { positionLabel: 'ZDM', firstName: 'Anton',      lastName: 'Stáach',       stats: s(64, 54, 74, 68, 74, 72, 68, 70) },
    { positionLabel: 'ZM',  firstName: 'Grischa',    lastName: 'Prömel',       stats: s(70, 60, 76, 70, 72, 70, 66, 71) },
    { positionLabel: 'ZM',  firstName: 'Florian',    lastName: 'Grillicch',    stats: s(72, 58, 74, 68, 70, 68, 64, 70) },
    { positionLabel: 'LM',  firstName: 'Maxi',       lastName: 'Beier',        stats: s(82, 70, 72, 64, 38, 36, 58, 70) },
    { positionLabel: 'RM',  firstName: 'Marius',     lastName: 'Bülter',       stats: s(80, 68, 72, 64, 40, 38, 58, 70) },
    { positionLabel: 'OM',  firstName: 'Adam',       lastName: 'Hloszek',      stats: s(74, 70, 76, 70, 42, 40, 62, 70) },
    { positionLabel: 'ST',  firstName: 'Jacob',      lastName: 'Bruun',        stats: s(78, 72, 66, 58, 38, 36, 66, 70) },
  ],

  // ═══════════════ Mainz (id: 7) ═══════════════
  7: [
    { positionLabel: 'TW',  firstName: 'Robin',      lastName: 'Zentnar',      stats: s(42, 10, 50, 54, 20, 24, 35, 78) },
    { positionLabel: 'LV',  firstName: 'Aaron',      lastName: 'Martinsen',    stats: s(78, 42, 68, 62, 74, 72, 64, 70) },
    { positionLabel: 'IV',  firstName: 'Stefan',     lastName: 'Belli',        stats: s(62, 22, 60, 46, 76, 74, 72, 68) },
    { positionLabel: 'IV',  firstName: 'Moritz',     lastName: 'Hackett',      stats: s(64, 24, 58, 48, 74, 72, 70, 67) },
    { positionLabel: 'RV',  firstName: 'Silvan',     lastName: 'Widmér',       stats: s(80, 48, 70, 64, 72, 70, 62, 70) },
    { positionLabel: 'ZDM', firstName: 'Leandro',    lastName: 'Barréiro',     stats: s(72, 60, 78, 72, 76, 74, 68, 72) },
    { positionLabel: 'LM',  firstName: 'Jae-sung',   lastName: 'Lée',          stats: s(78, 68, 80, 72, 48, 45, 62, 74) },
    { positionLabel: 'RM',  firstName: 'Paul',       lastName: 'Nebeling',     stats: s(80, 70, 74, 66, 40, 38, 58, 72) },
    { positionLabel: 'OM',  firstName: 'Nadiem',     lastName: 'Amiri',        stats: s(76, 72, 82, 76, 42, 40, 64, 76) },
    { positionLabel: 'ST',  firstName: 'Karim',      lastName: 'Onisiwó',      stats: s(78, 76, 68, 60, 38, 35, 72, 74) },
    { positionLabel: 'ST',  firstName: 'Ludovic',    lastName: 'Ajorqué',      stats: s(68, 78, 65, 58, 40, 38, 76, 74) },
    // Bench
    { positionLabel: 'TW',  firstName: 'Daniel',     lastName: 'Bátz',         stats: s(38, 8, 46, 50, 18, 22, 32, 68) },
    { positionLabel: 'LV',  firstName: 'Anthony',    lastName: 'Cací',         stats: s(80, 44, 68, 62, 72, 70, 62, 68) },
    { positionLabel: 'IV',  firstName: 'Andreas',    lastName: 'Hänschke',     stats: s(60, 22, 60, 44, 74, 72, 70, 66) },
    { positionLabel: 'RV',  firstName: 'Phillipp',   lastName: 'Mwene',        stats: s(76, 46, 68, 60, 72, 70, 62, 68) },
    { positionLabel: 'ZDM', firstName: 'Dominik',    lastName: 'Kohrs',        stats: s(70, 58, 74, 68, 74, 72, 66, 70) },
    { positionLabel: 'ZM',  firstName: 'Anthony',    lastName: 'Caci',         stats: s(72, 60, 76, 70, 70, 68, 64, 71) },
    { positionLabel: 'ZM',  firstName: 'Lee',        lastName: 'Jay-Sung',     stats: s(74, 64, 78, 70, 68, 66, 64, 72) },
    { positionLabel: 'LM',  firstName: 'Brajan',     lastName: 'Gruda',        stats: s(82, 70, 74, 66, 38, 36, 58, 72) },
    { positionLabel: 'RM',  firstName: 'Nelson',     lastName: 'Weiper',       stats: s(78, 68, 70, 62, 40, 38, 60, 70) },
    { positionLabel: 'OM',  firstName: 'Maxim',      lastName: 'Diakhité',     stats: s(74, 68, 76, 70, 42, 40, 62, 71) },
    { positionLabel: 'ST',  firstName: 'Armindo',    lastName: 'Sieb',         stats: s(74, 72, 68, 60, 36, 34, 64, 70) },
  ],

  // ═══════════════ Kiel (id: 8) ═══════════════
  8: [
    { positionLabel: 'TW',  firstName: 'Thomas',     lastName: 'Dahne',        stats: s(40, 10, 48, 52, 20, 22, 34, 76) },
    { positionLabel: 'LV',  firstName: 'Jan',        lastName: 'Bercholter',   stats: s(74, 38, 66, 60, 72, 70, 62, 68) },
    { positionLabel: 'IV',  firstName: 'Simon',      lastName: 'Lorénz',       stats: s(60, 20, 58, 44, 74, 72, 70, 66) },
    { positionLabel: 'IV',  firstName: 'Marco',      lastName: 'Komenda',      stats: s(62, 22, 56, 46, 72, 70, 68, 65) },
    { positionLabel: 'RV',  firstName: 'Timo',       lastName: 'Béckers',      stats: s(78, 44, 68, 62, 70, 68, 60, 68) },
    { positionLabel: 'ZDM', firstName: 'Lewis',      lastName: 'Holdtmann',    stats: s(70, 55, 74, 68, 74, 72, 66, 70) },
    { positionLabel: 'LM',  firstName: 'Fabian',     lastName: 'Reesé',        stats: s(80, 66, 72, 64, 40, 38, 58, 70) },
    { positionLabel: 'RM',  firstName: 'Finn',       lastName: 'Portélius',    stats: s(78, 64, 70, 62, 42, 40, 56, 68) },
    { positionLabel: 'OM',  firstName: 'Alexander',  lastName: 'Mühling',      stats: s(72, 68, 78, 72, 44, 42, 62, 72) },
    { positionLabel: 'ST',  firstName: 'Benedikt',   lastName: 'Piechotta',    stats: s(76, 74, 66, 58, 35, 32, 64, 70) },
    { positionLabel: 'ST',  firstName: 'Shuto',      lastName: 'Machino',      stats: s(82, 72, 68, 60, 34, 32, 60, 68) },
    // Bench
    { positionLabel: 'TW',  firstName: 'Timon',      lastName: 'Weiner',       stats: s(38, 8, 46, 50, 18, 20, 32, 66) },
    { positionLabel: 'LV',  firstName: 'Tom',        lastName: 'Roßbach',      stats: s(76, 40, 64, 58, 70, 68, 60, 66) },
    { positionLabel: 'IV',  firstName: 'Tomas',      lastName: 'Bechmann',     stats: s(58, 18, 56, 42, 72, 70, 68, 64) },
    { positionLabel: 'RV',  firstName: 'Lasse',      lastName: 'Rosenboom',    stats: s(76, 42, 66, 58, 68, 66, 58, 66) },
    { positionLabel: 'ZDM', firstName: 'Phillip',    lastName: 'Sander',       stats: s(68, 52, 72, 66, 72, 70, 64, 68) },
    { positionLabel: 'ZM',  firstName: 'Magnus',     lastName: 'Knudsen',      stats: s(72, 56, 74, 68, 66, 64, 60, 67) },
    { positionLabel: 'ZM',  firstName: 'Steven',     lastName: 'Skrzybski',    stats: s(70, 58, 72, 66, 64, 62, 60, 66) },
    { positionLabel: 'LM',  firstName: 'Armin',      lastName: 'Gigowicz',     stats: s(78, 64, 68, 60, 38, 36, 54, 66) },
    { positionLabel: 'RM',  firstName: 'Linus',      lastName: 'Köhler',       stats: s(76, 62, 68, 60, 40, 38, 54, 66) },
    { positionLabel: 'OM',  firstName: 'Tymo',       lastName: 'Klutén',       stats: s(72, 64, 72, 66, 42, 40, 58, 67) },
    { positionLabel: 'ST',  firstName: 'Alexander',  lastName: 'Bernhardsson', stats: s(74, 70, 64, 56, 32, 30, 60, 66) },
  ],

  // ═══════════════ Gladbach (id: 9) ═══════════════
  9: [
    { positionLabel: 'TW',  firstName: 'Jonas',      lastName: 'Omlin',        stats: s(44, 12, 52, 56, 22, 26, 36, 80) },
    { positionLabel: 'LV',  firstName: 'Rami',       lastName: 'Bensebaíni',   stats: s(76, 45, 72, 66, 76, 74, 66, 72) },
    { positionLabel: 'IV',  firstName: 'Ko',         lastName: 'Itakúra',      stats: s(66, 24, 64, 50, 80, 78, 76, 72) },
    { positionLabel: 'IV',  firstName: 'Nico',       lastName: 'Elvedín',      stats: s(64, 28, 62, 48, 78, 76, 74, 71) },
    { positionLabel: 'RV',  firstName: 'Joe',        lastName: 'Scallý',       stats: s(82, 48, 72, 66, 72, 70, 62, 72) },
    { positionLabel: 'ZDM', firstName: 'Christoph',  lastName: 'Kramér',       stats: s(70, 62, 80, 74, 76, 74, 68, 74) },
    { positionLabel: 'LM',  firstName: 'Nathan',     lastName: 'Ngoumóu',      stats: s(90, 72, 74, 66, 38, 36, 58, 74) },
    { positionLabel: 'RM',  firstName: 'Franck',     lastName: 'Honoré',       stats: s(82, 70, 78, 70, 42, 40, 62, 74) },
    { positionLabel: 'OM',  firstName: 'Florian',    lastName: 'Neuhauser',    stats: s(76, 74, 84, 78, 44, 42, 66, 78) },
    { positionLabel: 'ST',  firstName: 'Tim',        lastName: 'Kleindiénst',  stats: s(76, 80, 70, 62, 40, 38, 72, 76) },
    { positionLabel: 'ST',  firstName: 'Alassane',   lastName: 'Pleá',         stats: s(80, 78, 76, 68, 38, 36, 66, 76) },
    // Bench
    { positionLabel: 'TW',  firstName: 'Moritz',     lastName: 'Nicolás',      stats: s(40, 10, 48, 52, 20, 24, 34, 70) },
    { positionLabel: 'LV',  firstName: 'Luca',       lastName: 'Netz',         stats: s(80, 46, 70, 62, 72, 70, 64, 70) },
    { positionLabel: 'IV',  firstName: 'Marvin',     lastName: 'Friedrichs',   stats: s(64, 26, 62, 48, 76, 74, 72, 70) },
    { positionLabel: 'RV',  firstName: 'Stefan',     lastName: 'Lainér',       stats: s(78, 44, 68, 62, 70, 68, 60, 68) },
    { positionLabel: 'ZDM', firstName: 'Julian',     lastName: 'Weigl',        stats: s(66, 56, 78, 72, 74, 72, 68, 73) },
    { positionLabel: 'ZM',  firstName: 'Rocco',      lastName: 'Reitz',        stats: s(72, 60, 78, 72, 70, 68, 66, 72) },
    { positionLabel: 'ZM',  firstName: 'Philipp',    lastName: 'Sander',       stats: s(70, 58, 76, 70, 68, 66, 64, 70) },
    { positionLabel: 'LM',  firstName: 'Robin',      lastName: 'Hack',         stats: s(82, 70, 72, 64, 40, 38, 58, 71) },
    { positionLabel: 'RM',  firstName: 'Gerardo',    lastName: 'Seoane',       stats: s(76, 68, 70, 62, 38, 36, 58, 70) },
    { positionLabel: 'OM',  firstName: 'Lukas',      lastName: 'Ullrich',      stats: s(74, 70, 76, 70, 42, 40, 60, 71) },
    { positionLabel: 'ST',  firstName: 'Shio',       lastName: 'Fukuda',       stats: s(82, 72, 68, 60, 34, 32, 62, 70) },
  ],

  // ═══════════════ Berlin (id: 10) ═══════════════
  10: [
    { positionLabel: 'TW',  firstName: 'Frederik',   lastName: 'Rönne',        stats: s(42, 10, 50, 54, 20, 24, 34, 78) },
    { positionLabel: 'LV',  firstName: 'Robin',      lastName: 'Gösens',       stats: s(82, 52, 74, 68, 74, 72, 64, 74) },
    { positionLabel: 'IV',  firstName: 'Diogo',      lastName: 'Leíte',        stats: s(64, 24, 62, 48, 78, 76, 74, 70) },
    { positionLabel: 'IV',  firstName: 'Marc-Oliver',lastName: 'Kémpf',        stats: s(62, 22, 60, 46, 76, 74, 72, 68) },
    { positionLabel: 'RV',  firstName: 'Jonjoe',     lastName: 'Kennédy',      stats: s(78, 44, 70, 64, 72, 70, 62, 70) },
    { positionLabel: 'ZDM', firstName: 'Rani',       lastName: 'Khedíra',      stats: s(68, 58, 78, 72, 78, 76, 70, 74) },
    { positionLabel: 'LM',  firstName: 'Kevin',      lastName: 'Stögér',       stats: s(74, 70, 82, 76, 44, 42, 64, 76) },
    { positionLabel: 'RM',  firstName: 'Derry',      lastName: 'Lukébakio',    stats: s(88, 74, 72, 64, 36, 34, 58, 74) },
    { positionLabel: 'OM',  firstName: 'Suat',       lastName: 'Serdár',       stats: s(72, 68, 80, 74, 48, 45, 66, 74) },
    { positionLabel: 'ST',  firstName: 'Davie',      lastName: 'Selke',        stats: s(76, 76, 68, 60, 38, 36, 70, 72) },
    { positionLabel: 'ST',  firstName: 'Jordan',     lastName: 'Siebácheu',    stats: s(82, 74, 66, 58, 36, 34, 66, 70) },
    // Bench
    { positionLabel: 'TW',  firstName: 'Alex',       lastName: 'Schwolow',     stats: s(40, 10, 48, 50, 20, 22, 32, 70) },
    { positionLabel: 'LV',  firstName: 'Jérôme',     lastName: 'Roussillón',   stats: s(78, 42, 68, 60, 70, 68, 60, 68) },
    { positionLabel: 'IV',  firstName: 'Tomas',      lastName: 'Ostrak',       stats: s(64, 22, 60, 46, 74, 72, 70, 68) },
    { positionLabel: 'RV',  firstName: 'Pascal',     lastName: 'Klemens',      stats: s(80, 46, 70, 62, 70, 68, 60, 70) },
    { positionLabel: 'ZDM', firstName: 'Ányas',      lastName: 'Schäfer',      stats: s(70, 56, 76, 70, 74, 72, 68, 71) },
    { positionLabel: 'ZM',  firstName: 'Janik',      lastName: 'Háberer',      stats: s(72, 64, 78, 72, 68, 66, 66, 72) },
    { positionLabel: 'ZM',  firstName: 'Aljoscha',   lastName: 'Kembátsch',    stats: s(70, 60, 76, 70, 70, 68, 64, 71) },
    { positionLabel: 'LM',  firstName: 'Andras',     lastName: 'Schäfer',      stats: s(80, 68, 72, 64, 38, 36, 58, 70) },
    { positionLabel: 'RM',  firstName: 'Kevin',      lastName: 'Volland',      stats: s(76, 72, 76, 70, 42, 40, 64, 73) },
    { positionLabel: 'OM',  firstName: 'Tousseint',  lastName: 'Reinhardt',    stats: s(74, 68, 76, 70, 44, 42, 62, 70) },
    { positionLabel: 'ST',  firstName: 'Benedict',   lastName: 'Hollerbach',   stats: s(82, 72, 68, 60, 34, 32, 62, 70) },
  ],

  // ═══════════════ Heidenheim (id: 11) ═══════════════
  11: [
    { positionLabel: 'TW',  firstName: 'Kevin',      lastName: 'Müllér',       stats: s(40, 10, 48, 52, 18, 22, 32, 76) },
    { positionLabel: 'LV',  firstName: 'Omar',       lastName: 'Traoré',       stats: s(78, 42, 66, 60, 72, 70, 62, 68) },
    { positionLabel: 'IV',  firstName: 'Patrick',    lastName: 'Mainka',       stats: s(60, 22, 58, 44, 76, 74, 72, 68) },
    { positionLabel: 'IV',  firstName: 'Benedikt',   lastName: 'Adams',        stats: s(62, 20, 56, 44, 74, 72, 70, 67) },
    { positionLabel: 'RV',  firstName: 'Marnon',     lastName: 'Bushá',        stats: s(80, 44, 68, 62, 70, 68, 60, 68) },
    { positionLabel: 'ZDM', firstName: 'Lennard',    lastName: 'Maloney',      stats: s(68, 55, 74, 68, 74, 72, 66, 70) },
    { positionLabel: 'LM',  firstName: 'Jan-Niklas', lastName: 'Besté',        stats: s(82, 66, 72, 64, 40, 38, 58, 70) },
    { positionLabel: 'RM',  firstName: 'Eren',       lastName: 'Dinkelí',      stats: s(76, 64, 70, 62, 42, 40, 56, 68) },
    { positionLabel: 'OM',  firstName: 'Paul',       lastName: 'Wannér',       stats: s(80, 72, 78, 72, 40, 38, 62, 74) },
    { positionLabel: 'ST',  firstName: 'Jonas',      lastName: 'Föhrenbach',   stats: s(74, 76, 66, 58, 38, 36, 70, 72) },
    { positionLabel: 'ST',  firstName: 'Adrian',     lastName: 'Becker',       stats: s(78, 72, 64, 56, 34, 32, 64, 68) },
    // Bench
    { positionLabel: 'TW',  firstName: 'Frank',      lastName: 'Feller',       stats: s(36, 8, 44, 48, 16, 20, 30, 66) },
    { positionLabel: 'LV',  firstName: 'Florian',    lastName: 'Pieringer',    stats: s(76, 40, 64, 58, 70, 68, 60, 66) },
    { positionLabel: 'IV',  firstName: 'Benedikt',   lastName: 'Gimber',       stats: s(58, 20, 56, 42, 74, 72, 70, 66) },
    { positionLabel: 'RV',  firstName: 'Tim',        lastName: 'Siersleben',   stats: s(76, 40, 64, 58, 68, 66, 58, 65) },
    { positionLabel: 'ZDM', firstName: 'Niklas',     lastName: 'Dorsch',       stats: s(66, 52, 72, 66, 72, 70, 66, 68) },
    { positionLabel: 'ZM',  firstName: 'Jonas',      lastName: 'Föhrenbach',   stats: s(70, 56, 72, 66, 68, 66, 62, 68) },
    { positionLabel: 'ZM',  firstName: 'Stefan',     lastName: 'Schimmer',     stats: s(72, 58, 72, 66, 66, 64, 60, 67) },
    { positionLabel: 'LM',  firstName: 'Mikkel',     lastName: 'Kaufmann',     stats: s(78, 64, 68, 60, 38, 36, 54, 66) },
    { positionLabel: 'RM',  firstName: 'Léo',        lastName: 'Scienza',      stats: s(80, 66, 70, 62, 36, 34, 56, 68) },
    { positionLabel: 'OM',  firstName: 'Sirlord',    lastName: 'Conteh',       stats: s(76, 66, 70, 64, 40, 38, 58, 67) },
    { positionLabel: 'ST',  firstName: 'Marvin',     lastName: 'Pieringer',    stats: s(74, 68, 64, 56, 34, 32, 60, 66) },
  ],

  // ═══════════════ Augsburg (id: 12) ═══════════════
  12: [
    { positionLabel: 'TW',  firstName: 'Rafal',      lastName: 'Gikéwicz',     stats: s(42, 10, 48, 52, 20, 22, 34, 78) },
    { positionLabel: 'LV',  firstName: 'Mads',       lastName: 'Pedersén',     stats: s(76, 40, 66, 60, 74, 72, 64, 70) },
    { positionLabel: 'IV',  firstName: 'Jeffrey',    lastName: 'Gouwelééuw',   stats: s(58, 20, 62, 46, 78, 76, 74, 70) },
    { positionLabel: 'IV',  firstName: 'Maximilian', lastName: 'Bauer',        stats: s(60, 22, 58, 44, 76, 74, 72, 68) },
    { positionLabel: 'RV',  firstName: 'Robert',     lastName: 'Gumney',       stats: s(80, 46, 68, 62, 72, 70, 62, 70) },
    { positionLabel: 'ZDM', firstName: 'Elvis',      lastName: 'Rexhbecai',    stats: s(70, 56, 76, 70, 74, 72, 66, 72) },
    { positionLabel: 'LM',  firstName: 'Ruben',      lastName: 'Vargas',       stats: s(84, 70, 74, 66, 38, 36, 58, 72) },
    { positionLabel: 'RM',  firstName: 'Philip',     lastName: 'Tiétz',        stats: s(74, 72, 70, 62, 42, 40, 60, 70) },
    { positionLabel: 'OM',  firstName: 'Arne',       lastName: 'Engel',        stats: s(76, 66, 78, 72, 46, 44, 64, 72) },
    { positionLabel: 'ST',  firstName: 'Ermedin',    lastName: 'Demírovic',    stats: s(78, 78, 70, 62, 38, 36, 68, 74) },
    { positionLabel: 'ST',  firstName: 'Dion',       lastName: 'Beljo',        stats: s(76, 76, 66, 58, 36, 34, 72, 72) },
    // Bench
    { positionLabel: 'TW',  firstName: 'Finn',       lastName: 'Dahmén',       stats: s(38, 8, 46, 50, 18, 22, 32, 68) },
    { positionLabel: 'LV',  firstName: 'Iago',       lastName: 'Borduchéu',    stats: s(80, 44, 68, 60, 70, 68, 60, 68) },
    { positionLabel: 'IV',  firstName: 'Felix',      lastName: 'Uduokhái',     stats: s(64, 22, 60, 46, 76, 74, 72, 68) },
    { positionLabel: 'RV',  firstName: 'Kristijan', lastName: 'Jakíc',         stats: s(76, 40, 64, 58, 68, 66, 58, 66) },
    { positionLabel: 'ZDM', firstName: 'Arne',       lastName: 'Maier',        stats: s(68, 54, 74, 68, 72, 70, 64, 70) },
    { positionLabel: 'ZM',  firstName: 'Mert',       lastName: 'Kömür',        stats: s(72, 64, 76, 70, 66, 64, 62, 70) },
    { positionLabel: 'ZM',  firstName: 'Niklas',     lastName: 'Dörsch',       stats: s(70, 60, 74, 68, 70, 68, 64, 70) },
    { positionLabel: 'LM',  firstName: 'Sven',       lastName: 'Michel',       stats: s(80, 68, 70, 62, 38, 36, 56, 68) },
    { positionLabel: 'RM',  firstName: 'Han-noah',   lastName: 'Massengo',     stats: s(78, 64, 68, 60, 40, 38, 58, 67) },
    { positionLabel: 'OM',  firstName: 'Frank',      lastName: 'Rieder',       stats: s(76, 70, 74, 68, 44, 42, 62, 70) },
    { positionLabel: 'ST',  firstName: 'Phillip',    lastName: 'Tiétz',        stats: s(76, 70, 66, 58, 36, 34, 64, 68) },
  ],

  // ═══════════════ Bochum (id: 13) ═══════════════
  13: [
    { positionLabel: 'TW',  firstName: 'Manuel',     lastName: 'Riemann',      stats: s(38, 8, 46, 50, 18, 20, 32, 74) },
    { positionLabel: 'LV',  firstName: 'Bernardo',   lastName: 'Soarés',       stats: s(72, 38, 64, 58, 70, 68, 60, 66) },
    { positionLabel: 'IV',  firstName: 'Erhan',      lastName: 'Masovíc',      stats: s(58, 18, 56, 42, 74, 72, 70, 66) },
    { positionLabel: 'IV',  firstName: 'Keven',      lastName: 'Schlotterbéck',stats: s(60, 20, 58, 44, 72, 70, 68, 65) },
    { positionLabel: 'RV',  firstName: 'Cristian',   lastName: 'Gamboá',       stats: s(76, 42, 66, 60, 70, 68, 60, 68) },
    { positionLabel: 'ZDM', firstName: 'Anthony',    lastName: 'Losillá',      stats: s(66, 52, 72, 66, 74, 72, 66, 68) },
    { positionLabel: 'LM',  firstName: 'Felix',      lastName: 'Passlach',     stats: s(72, 68, 76, 70, 42, 40, 60, 72) },
    { positionLabel: 'RM',  firstName: 'Philipp',    lastName: 'Hoffman',      stats: s(76, 66, 72, 64, 40, 38, 56, 68) },
    { positionLabel: 'OM',  firstName: 'Pierre',     lastName: 'Holtmann',     stats: s(80, 64, 74, 68, 38, 36, 58, 70) },
    { positionLabel: 'ST',  firstName: 'Moritz',     lastName: 'Bröschinski',  stats: s(78, 72, 64, 56, 34, 32, 64, 68) },
    { positionLabel: 'ST',  firstName: 'Gonçalo',    lastName: 'Paciencia',    stats: s(72, 74, 68, 60, 36, 34, 68, 70) },
    // Bench
    { positionLabel: 'TW',  firstName: 'Patrick',    lastName: 'Drewes',       stats: s(36, 6, 44, 48, 16, 20, 30, 64) },
    { positionLabel: 'LV',  firstName: 'Max',        lastName: 'Wittek',       stats: s(74, 38, 62, 56, 68, 66, 58, 64) },
    { positionLabel: 'IV',  firstName: 'Patrick',    lastName: 'Osterhage',    stats: s(58, 18, 54, 40, 72, 70, 68, 64) },
    { positionLabel: 'RV',  firstName: 'Ivan',       lastName: 'Ordéts',       stats: s(64, 20, 58, 44, 72, 70, 68, 65) },
    { positionLabel: 'ZDM', firstName: 'Tim',        lastName: 'Oermann',      stats: s(66, 52, 70, 64, 70, 68, 64, 67) },
    { positionLabel: 'ZM',  firstName: 'Matúš',      lastName: 'Bero',         stats: s(70, 58, 72, 66, 68, 66, 62, 68) },
    { positionLabel: 'ZM',  firstName: 'Anthony',    lastName: 'Losilla Jr',   stats: s(68, 56, 70, 64, 70, 68, 64, 67) },
    { positionLabel: 'LM',  firstName: 'Dani',       lastName: 'de Wit',       stats: s(76, 64, 68, 60, 36, 34, 54, 64) },
    { positionLabel: 'RM',  firstName: 'Lukáš',      lastName: 'Daschnér',     stats: s(74, 62, 68, 60, 38, 36, 56, 64) },
    { positionLabel: 'OM',  firstName: 'Matúš',      lastName: 'Jelínek',      stats: s(72, 64, 70, 64, 40, 38, 58, 65) },
    { positionLabel: 'ST',  firstName: 'Philipp',    lastName: 'Hofman',       stats: s(70, 70, 64, 56, 32, 30, 64, 64) },
  ],

  // ═══════════════ Freiburg (id: 14) ═══════════════
  14: [
    { positionLabel: 'TW',  firstName: 'Mark',       lastName: 'Flekken',      stats: s(44, 12, 52, 56, 22, 26, 36, 82) },
    { positionLabel: 'LV',  firstName: 'Christian',  lastName: 'Günter',       stats: s(76, 42, 72, 66, 78, 76, 66, 74) },
    { positionLabel: 'IV',  firstName: 'Philipp',    lastName: 'Lienhárt',     stats: s(64, 24, 66, 50, 80, 78, 76, 72) },
    { positionLabel: 'IV',  firstName: 'Matthias',   lastName: 'Gintér',       stats: s(62, 26, 68, 52, 82, 80, 78, 74) },
    { positionLabel: 'RV',  firstName: 'Lukas',      lastName: 'Küblér',       stats: s(80, 46, 70, 64, 76, 74, 64, 72) },
    { positionLabel: 'ZDM', firstName: 'Nicolas',    lastName: 'Höfler',       stats: s(68, 58, 80, 74, 80, 78, 70, 76) },
    { positionLabel: 'LM',  firstName: 'Vincenzo',   lastName: 'Grifo',        stats: s(76, 76, 84, 80, 40, 38, 62, 80) },
    { positionLabel: 'RM',  firstName: 'Daniel-Kofi',lastName: 'Kyereh',       stats: s(82, 70, 76, 68, 44, 42, 60, 74) },
    { positionLabel: 'OM',  firstName: 'Yannik',     lastName: 'Kebel',        stats: s(74, 72, 80, 76, 48, 46, 66, 76) },
    { positionLabel: 'ST',  firstName: 'Michael',    lastName: 'Gregeritsch',  stats: s(74, 80, 72, 64, 38, 36, 72, 76) },
    { positionLabel: 'ST',  firstName: 'Lucas',      lastName: 'Höhler',       stats: s(84, 78, 70, 62, 36, 34, 66, 74) },
    // Bench
    { positionLabel: 'TW',  firstName: 'Florian',    lastName: 'Müller',       stats: s(40, 10, 48, 52, 20, 22, 34, 72) },
    { positionLabel: 'LV',  firstName: 'Jordy',      lastName: 'Makengo',      stats: s(80, 44, 68, 60, 72, 70, 62, 70) },
    { positionLabel: 'IV',  firstName: 'Manuel',     lastName: 'Gulde',        stats: s(60, 22, 64, 48, 76, 74, 72, 70) },
    { positionLabel: 'RV',  firstName: 'Jonathan',   lastName: 'Schmid',       stats: s(76, 44, 70, 62, 72, 70, 62, 70) },
    { positionLabel: 'ZDM', firstName: 'Maximilian', lastName: 'Eggesteín',    stats: s(70, 58, 78, 72, 76, 74, 68, 72) },
    { positionLabel: 'ZM',  firstName: 'Ritsu',      lastName: 'Doán',         stats: s(82, 70, 78, 70, 50, 48, 62, 75) },
    { positionLabel: 'ZM',  firstName: 'Yannik',     lastName: 'Eggestein',    stats: s(72, 60, 76, 70, 70, 68, 64, 71) },
    { positionLabel: 'LM',  firstName: 'Roland',     lastName: 'Sallai',       stats: s(80, 68, 74, 66, 40, 38, 60, 72) },
    { positionLabel: 'RM',  firstName: 'Junior',     lastName: 'Adamou',       stats: s(78, 66, 70, 62, 38, 36, 58, 70) },
    { positionLabel: 'OM',  firstName: 'Maximilian', lastName: 'Philipp',      stats: s(76, 72, 76, 70, 42, 40, 62, 72) },
    { positionLabel: 'ST',  firstName: 'Patrick',    lastName: 'Osterhage',    stats: s(76, 72, 68, 60, 36, 34, 64, 70) },
  ],

  // ═══════════════ Wolfsburg (id: 15) ═══════════════
  15: [
    { positionLabel: 'TW',  firstName: 'Koen',       lastName: 'Castéels',     stats: s(44, 12, 54, 58, 22, 26, 36, 82) },
    { positionLabel: 'LV',  firstName: 'Paulo',      lastName: 'Otávio',       stats: s(78, 44, 70, 64, 74, 72, 64, 72) },
    { positionLabel: 'IV',  firstName: 'Maxence',    lastName: 'Lacrouix',     stats: s(64, 22, 62, 48, 78, 76, 74, 70) },
    { positionLabel: 'IV',  firstName: 'Sebastien',  lastName: 'Bornauw',      stats: s(66, 24, 64, 50, 80, 78, 76, 72) },
    { positionLabel: 'RV',  firstName: 'Ridle',      lastName: 'Bakú',         stats: s(84, 50, 74, 68, 72, 70, 62, 74) },
    { positionLabel: 'ZDM', firstName: 'Arnold',     lastName: 'Maximilian',   stats: s(70, 62, 82, 78, 76, 74, 68, 76) },
    { positionLabel: 'LM',  firstName: 'Patrick',    lastName: 'Wimmér',       stats: s(82, 70, 76, 68, 44, 42, 60, 74) },
    { positionLabel: 'RM',  firstName: 'Yannick',    lastName: 'Geráhdt',      stats: s(76, 68, 80, 74, 46, 44, 64, 74) },
    { positionLabel: 'OM',  firstName: 'Mattias',    lastName: 'Svanberg',     stats: s(74, 68, 80, 74, 50, 48, 66, 74) },
    { positionLabel: 'ST',  firstName: 'Lukas',      lastName: 'Nmechá',       stats: s(80, 78, 72, 64, 38, 36, 68, 74) },
    { positionLabel: 'ST',  firstName: 'Jonas',      lastName: 'Wínd',         stats: s(76, 80, 70, 62, 40, 38, 74, 76) },
    // Bench
    { positionLabel: 'TW',  firstName: 'Pavao',      lastName: 'Pervan',       stats: s(40, 10, 50, 54, 20, 24, 34, 72) },
    { positionLabel: 'LV',  firstName: 'Joakim',     lastName: 'Mæhle',        stats: s(80, 46, 70, 64, 72, 70, 62, 70) },
    { positionLabel: 'IV',  firstName: 'Cédric',     lastName: 'Zesigér',      stats: s(64, 24, 62, 48, 76, 74, 72, 70) },
    { positionLabel: 'RV',  firstName: 'Kilian',     lastName: 'Fischer',      stats: s(80, 46, 70, 62, 70, 68, 60, 68) },
    { positionLabel: 'ZDM', firstName: 'Vinicius',   lastName: 'Júnior',       stats: s(72, 60, 78, 72, 74, 72, 66, 73) },
    { positionLabel: 'ZM',  firstName: 'Mohammed',   lastName: 'Amoura',       stats: s(76, 70, 78, 72, 64, 62, 62, 74) },
    { positionLabel: 'ZM',  firstName: 'Bence',      lastName: 'Dárdai',       stats: s(72, 60, 74, 68, 70, 68, 64, 71) },
    { positionLabel: 'LM',  firstName: 'Tiago',      lastName: 'Tomás',        stats: s(82, 70, 72, 64, 36, 34, 58, 71) },
    { positionLabel: 'RM',  firstName: 'Václav',     lastName: 'Cerný',        stats: s(80, 68, 74, 66, 38, 36, 58, 70) },
    { positionLabel: 'OM',  firstName: 'Salih',      lastName: 'Özcán',        stats: s(74, 66, 76, 70, 44, 42, 62, 71) },
    { positionLabel: 'ST',  firstName: 'Mohammed',   lastName: 'Daghín',       stats: s(78, 74, 68, 60, 38, 36, 66, 70) },
  ],

  // ═══════════════ Bremen (id: 16) ═══════════════
  16: [
    { positionLabel: 'TW',  firstName: 'Jiri',       lastName: 'Pavlénka',     stats: s(42, 10, 50, 54, 20, 24, 34, 78) },
    { positionLabel: 'LV',  firstName: 'Amos',       lastName: 'Piepér',       stats: s(74, 40, 68, 62, 76, 74, 66, 70) },
    { positionLabel: 'IV',  firstName: 'Marco',      lastName: 'Friedell',     stats: s(62, 22, 62, 48, 78, 76, 74, 70) },
    { positionLabel: 'IV',  firstName: 'Niklas',     lastName: 'Stárk',        stats: s(64, 24, 64, 50, 76, 74, 72, 69) },
    { positionLabel: 'RV',  firstName: 'Mitchell',   lastName: 'Weisér',       stats: s(80, 48, 72, 66, 72, 70, 62, 72) },
    { positionLabel: 'ZDM', firstName: 'Christian',  lastName: 'Groß',         stats: s(68, 56, 78, 72, 76, 74, 68, 72) },
    { positionLabel: 'LM',  firstName: 'Romano',     lastName: 'Schmid',       stats: s(82, 68, 76, 68, 42, 40, 60, 72) },
    { positionLabel: 'RM',  firstName: 'Leonardo',   lastName: 'Bittencóurt',  stats: s(76, 70, 80, 74, 40, 38, 62, 74) },
    { positionLabel: 'OM',  firstName: 'Marvin',     lastName: 'Duckschér',    stats: s(78, 74, 78, 72, 44, 42, 64, 76) },
    { positionLabel: 'ST',  firstName: 'Niclas',     lastName: 'Füllkrüg',     stats: s(72, 82, 70, 62, 40, 38, 76, 78) },
    { positionLabel: 'ST',  firstName: 'Rafael',     lastName: 'Borré',        stats: s(82, 76, 72, 64, 38, 36, 66, 74) },
    // Bench
    { positionLabel: 'TW',  firstName: 'Michael',    lastName: 'Zetterer',     stats: s(40, 10, 48, 52, 20, 22, 34, 72) },
    { positionLabel: 'LV',  firstName: 'Anthony',    lastName: 'Jung',         stats: s(76, 42, 68, 60, 72, 70, 62, 68) },
    { positionLabel: 'IV',  firstName: 'Olivier',    lastName: 'Dejónge',      stats: s(64, 22, 62, 48, 76, 74, 72, 68) },
    { positionLabel: 'RV',  firstName: 'Felix',      lastName: 'Agu',          stats: s(80, 46, 70, 64, 70, 68, 60, 70) },
    { positionLabel: 'ZDM', firstName: 'Senne',      lastName: 'Lynén',        stats: s(70, 58, 76, 70, 74, 72, 66, 71) },
    { positionLabel: 'ZM',  firstName: 'Mitchell',   lastName: 'Westphal',     stats: s(72, 62, 76, 70, 70, 68, 64, 71) },
    { positionLabel: 'ZM',  firstName: 'Justin',     lastName: 'Njínmah',      stats: s(80, 66, 72, 64, 60, 58, 60, 70) },
    { positionLabel: 'LM',  firstName: 'Skelly',     lastName: 'Alvero',       stats: s(78, 66, 72, 64, 40, 38, 58, 69) },
    { positionLabel: 'RM',  firstName: 'Oliver',     lastName: 'Burke',        stats: s(82, 70, 70, 62, 36, 34, 56, 70) },
    { positionLabel: 'OM',  firstName: 'Jens',       lastName: 'Stage',        stats: s(74, 68, 76, 70, 44, 42, 62, 70) },
    { positionLabel: 'ST',  firstName: 'Marvin',     lastName: 'Ducksch',      stats: s(74, 76, 70, 62, 38, 36, 66, 72) },
  ],

  // ═══════════════ St. Pauli (id: 17) ═══════════════
  17: [
    { positionLabel: 'TW',  firstName: 'Nikola',     lastName: 'Vasílj',       stats: s(40, 10, 48, 52, 18, 22, 32, 76) },
    { positionLabel: 'LV',  firstName: 'Leart',      lastName: 'Paquaráda',    stats: s(76, 40, 66, 60, 72, 70, 62, 68) },
    { positionLabel: 'IV',  firstName: 'Jakov',      lastName: 'Medíc',        stats: s(60, 20, 58, 44, 76, 74, 72, 68) },
    { positionLabel: 'IV',  firstName: 'Adam',       lastName: 'Dzwigala',     stats: s(58, 18, 56, 42, 74, 72, 70, 66) },
    { positionLabel: 'RV',  firstName: 'Manolis',    lastName: 'Saliakas',     stats: s(80, 46, 68, 62, 70, 68, 60, 68) },
    { positionLabel: 'ZDM', firstName: 'Marcel',     lastName: 'Hartel',       stats: s(72, 60, 76, 70, 72, 70, 64, 72) },
    { positionLabel: 'LM',  firstName: 'Oladapo',    lastName: 'Afoláyan',     stats: s(88, 68, 70, 62, 36, 34, 56, 70) },
    { positionLabel: 'RM',  firstName: 'Jackson',    lastName: 'Irvíne',       stats: s(74, 62, 72, 66, 46, 44, 62, 70) },
    { positionLabel: 'OM',  firstName: 'Carlo',      lastName: 'Boukhalfa',    stats: s(76, 66, 76, 70, 44, 42, 60, 72) },
    { positionLabel: 'ST',  firstName: 'Johannes',   lastName: 'Eggesteín',    stats: s(78, 76, 68, 60, 36, 34, 66, 72) },
    { positionLabel: 'ST',  firstName: 'Elias',      lastName: 'Sáad',         stats: s(80, 72, 66, 58, 34, 32, 62, 68) },
    // Bench
    { positionLabel: 'TW',  firstName: 'Sascha',     lastName: 'Burchert',     stats: s(36, 8, 44, 48, 16, 20, 30, 68) },
    { positionLabel: 'LV',  firstName: 'Philipp',    lastName: 'Treu',         stats: s(78, 42, 66, 58, 70, 68, 60, 66) },
    { positionLabel: 'IV',  firstName: 'Eric',       lastName: 'Smith',        stats: s(60, 20, 58, 42, 74, 72, 70, 66) },
    { positionLabel: 'RV',  firstName: 'David',      lastName: 'Nemeth',       stats: s(78, 42, 66, 58, 68, 66, 58, 66) },
    { positionLabel: 'ZDM', firstName: 'Robert',     lastName: 'Wagnér',       stats: s(68, 54, 72, 66, 72, 70, 64, 68) },
    { positionLabel: 'ZM',  firstName: 'Connor',     lastName: 'Métcalfe',     stats: s(72, 58, 72, 66, 68, 66, 62, 68) },
    { positionLabel: 'ZM',  firstName: 'Lukas',      lastName: 'Daschnér',     stats: s(70, 56, 70, 64, 70, 68, 64, 67) },
    { positionLabel: 'LM',  firstName: 'Adam',       lastName: 'Dzwigala II',  stats: s(76, 64, 68, 60, 38, 36, 56, 66) },
    { positionLabel: 'RM',  firstName: 'Andreas',    lastName: 'Albers',       stats: s(80, 66, 68, 60, 36, 34, 56, 67) },
    { positionLabel: 'OM',  firstName: 'Hauke',      lastName: 'Wahl',         stats: s(72, 64, 70, 64, 42, 40, 60, 67) },
    { positionLabel: 'ST',  firstName: 'Lars',       lastName: 'Ritzká',       stats: s(76, 70, 64, 56, 32, 30, 60, 66) },
  ],
}
