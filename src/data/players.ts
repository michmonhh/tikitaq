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

// Team rosters: 11 players per team in formation order
// TW, LV, IV, IV, RV, ZDM, LM, RM, OM, ST, ST

export const TEAM_ROSTERS: Record<number, TeamRoster> = {
  // München (id: 0)
  0: [
    { positionLabel: 'TW', firstName: 'Manuel', lastName: 'Neuhaus', stats: s(55, 20, 65, 70, 30, 35, 50, 92) },
    { positionLabel: 'LV', firstName: 'Alfons', lastName: 'Dawes', stats: s(88, 55, 80, 72, 78, 76, 70, 78) },
    { positionLabel: 'IV', firstName: 'Dayoung', lastName: 'Upamecana', stats: s(72, 30, 65, 55, 87, 85, 82, 75) },
    { positionLabel: 'IV', firstName: 'Minjae', lastName: 'Kimura', stats: s(70, 28, 68, 50, 89, 88, 85, 76) },
    { positionLabel: 'RV', firstName: 'Joshua', lastName: 'Kimmler', stats: s(82, 60, 88, 82, 82, 80, 75, 80) },
    { positionLabel: 'ZDM', firstName: 'Leon', lastName: 'Goretski', stats: s(78, 72, 85, 78, 80, 78, 77, 82) },
    { positionLabel: 'LM', firstName: 'Kingsley', lastName: 'Comane', stats: s(94, 80, 78, 70, 40, 38, 65, 82) },
    { positionLabel: 'RM', firstName: 'Serge', lastName: 'Gnabert', stats: s(90, 78, 82, 72, 42, 40, 68, 80) },
    { positionLabel: 'OM', firstName: 'Jamal', lastName: 'Musialka', stats: s(85, 82, 90, 80, 45, 42, 72, 88) },
    { positionLabel: 'ST', firstName: 'Harry', lastName: 'Kaine', stats: s(72, 93, 82, 78, 45, 42, 78, 90) },
    { positionLabel: 'ST', firstName: 'Thomas', lastName: 'Mollér', stats: s(80, 85, 88, 75, 55, 50, 70, 85) },
  ],

  // Dortmund (id: 1)
  1: [
    { positionLabel: 'TW', firstName: 'Gregor', lastName: 'Kobelt', stats: s(50, 18, 60, 65, 28, 32, 45, 88) },
    { positionLabel: 'LV', firstName: 'Ramy', lastName: 'Bensakhr', stats: s(85, 50, 75, 68, 76, 74, 68, 74) },
    { positionLabel: 'IV', firstName: 'Niklas', lastName: 'Schlotzenburg', stats: s(65, 32, 68, 55, 84, 82, 80, 73) },
    { positionLabel: 'IV', firstName: 'Waldemar', lastName: 'Antonsson', stats: s(68, 30, 65, 52, 82, 80, 78, 72) },
    { positionLabel: 'RV', firstName: 'Julian', lastName: 'Reyersen', stats: s(84, 55, 78, 72, 74, 72, 66, 75) },
    { positionLabel: 'ZDM', firstName: 'Emre', lastName: 'Canbulut', stats: s(72, 62, 82, 75, 78, 76, 72, 76) },
    { positionLabel: 'LM', firstName: 'Karim', lastName: 'Adeyama', stats: s(95, 76, 72, 65, 35, 32, 58, 76) },
    { positionLabel: 'RM', firstName: 'Donyell', lastName: 'Mahlberg', stats: s(88, 78, 80, 72, 38, 35, 62, 78) },
    { positionLabel: 'OM', firstName: 'Marco', lastName: 'Braundt', stats: s(80, 80, 86, 78, 42, 40, 68, 82) },
    { positionLabel: 'ST', firstName: 'Sebastien', lastName: 'Hallström', stats: s(78, 86, 75, 70, 40, 38, 72, 82) },
    { positionLabel: 'ST', firstName: 'Youssuf', lastName: 'Moukhtar', stats: s(82, 82, 78, 68, 38, 36, 68, 78) },
  ],

  // Leipzig (id: 2)
  2: [
    { positionLabel: 'TW', firstName: 'Peter', lastName: 'Gulásci', stats: s(48, 16, 58, 62, 26, 30, 42, 85) },
    { positionLabel: 'LV', firstName: 'David', lastName: 'Ramussen', stats: s(82, 48, 74, 68, 78, 76, 66, 74) },
    { positionLabel: 'IV', firstName: 'Willi', lastName: 'Orbányi', stats: s(65, 28, 62, 50, 83, 82, 80, 72) },
    { positionLabel: 'IV', firstName: 'Mohammed', lastName: 'Simakane', stats: s(72, 30, 70, 55, 80, 78, 76, 73) },
    { positionLabel: 'RV', firstName: 'Lukas', lastName: 'Klostermayer', stats: s(80, 52, 76, 70, 76, 74, 65, 74) },
    { positionLabel: 'ZDM', firstName: 'Konrad', lastName: 'Leimaier', stats: s(76, 68, 84, 78, 80, 78, 72, 80) },
    { positionLabel: 'LM', firstName: 'Dominik', lastName: 'Szaboszlai', stats: s(84, 76, 82, 75, 45, 42, 64, 80) },
    { positionLabel: 'RM', firstName: 'Xaver', lastName: 'Simonsohn', stats: s(90, 80, 80, 70, 38, 35, 60, 82) },
    { positionLabel: 'OM', firstName: 'Dani', lastName: 'Olmeiro', stats: s(82, 78, 88, 80, 42, 40, 66, 84) },
    { positionLabel: 'ST', firstName: 'Loïs', lastName: 'Opendaal', stats: s(88, 84, 72, 65, 35, 32, 65, 80) },
    { positionLabel: 'ST', firstName: 'Benjamin', lastName: 'Sesskö', stats: s(92, 82, 70, 62, 38, 35, 70, 78) },
  ],

  // Leverkusen (id: 3)
  3: [
    { positionLabel: 'TW', firstName: 'Lukáš', lastName: 'Hrádecký', stats: s(45, 15, 55, 60, 25, 30, 40, 86) },
    { positionLabel: 'LV', firstName: 'Alejandro', lastName: 'Grimaldos', stats: s(85, 58, 82, 76, 72, 70, 65, 78) },
    { positionLabel: 'IV', firstName: 'Jonathan', lastName: 'Taah', stats: s(70, 30, 68, 55, 88, 86, 84, 76) },
    { positionLabel: 'IV', firstName: 'Edmond', lastName: 'Tapsobá', stats: s(72, 28, 65, 52, 86, 84, 82, 75) },
    { positionLabel: 'RV', firstName: 'Jeremie', lastName: 'Frimpöng', stats: s(94, 62, 76, 70, 70, 68, 64, 78) },
    { positionLabel: 'ZDM', firstName: 'Granit', lastName: 'Xhakiri', stats: s(68, 65, 85, 80, 82, 80, 76, 80) },
    { positionLabel: 'LM', firstName: 'Jonas', lastName: 'Hofmänn', stats: s(82, 74, 84, 78, 48, 45, 66, 80) },
    { positionLabel: 'RM', firstName: 'Florian', lastName: 'Wiertz', stats: s(88, 82, 86, 78, 42, 40, 64, 84) },
    { positionLabel: 'OM', firstName: 'Alex', lastName: 'Shíri', stats: s(80, 80, 88, 82, 45, 42, 68, 86) },
    { positionLabel: 'ST', firstName: 'Patrik', lastName: 'Schicker', stats: s(80, 88, 78, 72, 38, 35, 72, 85) },
    { positionLabel: 'ST', firstName: 'Victor', lastName: 'Bonifáce', stats: s(86, 86, 72, 65, 40, 38, 76, 82) },
  ],

  // Frankfurt (id: 4)
  4: [
    { positionLabel: 'TW', firstName: 'Kevin', lastName: 'Trappner', stats: s(48, 15, 55, 58, 25, 28, 40, 82) },
    { positionLabel: 'LV', firstName: 'Niko', lastName: 'Abrahám', stats: s(78, 45, 72, 65, 76, 74, 68, 72) },
    { positionLabel: 'IV', firstName: 'Robin', lastName: 'Kochmann', stats: s(68, 28, 65, 52, 80, 78, 76, 72) },
    { positionLabel: 'IV', firstName: 'Tuta', lastName: 'Ferreiro', stats: s(70, 26, 62, 50, 82, 80, 78, 73) },
    { positionLabel: 'RV', firstName: 'Aurelio', lastName: 'Bustamonte', stats: s(80, 50, 74, 68, 74, 72, 65, 73) },
    { positionLabel: 'ZDM', firstName: 'Sebastian', lastName: 'Ridé', stats: s(74, 65, 82, 76, 78, 76, 72, 76) },
    { positionLabel: 'LM', firstName: 'Ansgar', lastName: 'Knauf', stats: s(88, 72, 76, 68, 42, 40, 62, 76) },
    { positionLabel: 'RM', firstName: 'Jesper', lastName: 'Lindström', stats: s(85, 75, 80, 72, 40, 38, 64, 78) },
    { positionLabel: 'OM', firstName: 'Mario', lastName: 'Götsche', stats: s(76, 78, 85, 78, 45, 42, 68, 80) },
    { positionLabel: 'ST', firstName: 'Omar', lastName: 'Marmouche', stats: s(85, 82, 76, 68, 42, 40, 72, 80) },
    { positionLabel: 'ST', firstName: 'Hugo', lastName: 'Ekitiké', stats: s(90, 80, 72, 65, 35, 32, 66, 78) },
  ],

  // Stuttgart (id: 5)
  5: [
    { positionLabel: 'TW', firstName: 'Alexander', lastName: 'Nübeling', stats: s(46, 14, 54, 58, 24, 28, 38, 82) },
    { positionLabel: 'LV', firstName: 'Maximilian', lastName: 'Mittelstedt', stats: s(82, 48, 74, 68, 76, 74, 66, 73) },
    { positionLabel: 'IV', firstName: 'Anthony', lastName: 'Rouleau', stats: s(68, 28, 65, 52, 80, 78, 76, 72) },
    { positionLabel: 'IV', firstName: 'Hiroki', lastName: 'Itou', stats: s(66, 26, 62, 50, 78, 76, 75, 71) },
    { positionLabel: 'RV', firstName: 'Pascal', lastName: 'Stengel', stats: s(80, 50, 72, 66, 74, 72, 64, 72) },
    { positionLabel: 'ZDM', firstName: 'Atakan', lastName: 'Karazör', stats: s(72, 58, 80, 74, 78, 76, 70, 74) },
    { positionLabel: 'LM', firstName: 'Chris', lastName: 'Führung', stats: s(88, 74, 78, 70, 40, 38, 62, 76) },
    { positionLabel: 'RM', firstName: 'Enzo', lastName: 'Millión', stats: s(84, 72, 80, 74, 42, 40, 64, 76) },
    { positionLabel: 'OM', firstName: 'Angelo', lastName: 'Stiller', stats: s(74, 70, 84, 78, 52, 48, 68, 78) },
    { positionLabel: 'ST', firstName: 'Serhou', lastName: 'Guirassou', stats: s(80, 84, 74, 68, 40, 38, 74, 82) },
    { positionLabel: 'ST', firstName: 'Deniz', lastName: 'Undav', stats: s(76, 82, 78, 70, 42, 40, 70, 78) },
  ],

  // Hoffenheim (id: 6)
  6: [
    { positionLabel: 'TW', firstName: 'Oliver', lastName: 'Baumann', stats: s(44, 12, 52, 56, 22, 26, 36, 80) },
    { positionLabel: 'LV', firstName: 'Pavel', lastName: 'Kaderábek', stats: s(76, 42, 70, 64, 74, 72, 64, 70) },
    { positionLabel: 'IV', firstName: 'Ozan', lastName: 'Kabac', stats: s(64, 24, 62, 48, 78, 76, 74, 70) },
    { positionLabel: 'IV', firstName: 'Stanley', lastName: 'Nsoki', stats: s(66, 22, 58, 46, 76, 74, 72, 69) },
    { positionLabel: 'RV', firstName: 'Robert', lastName: 'Skovar', stats: s(78, 46, 70, 64, 72, 70, 62, 70) },
    { positionLabel: 'ZDM', firstName: 'Dennis', lastName: 'Geigér', stats: s(70, 58, 78, 72, 76, 74, 68, 72) },
    { positionLabel: 'LM', firstName: 'Christoph', lastName: 'Baumgardner', stats: s(82, 70, 76, 68, 42, 40, 60, 74) },
    { positionLabel: 'RM', firstName: 'Andrej', lastName: 'Kramáritch', stats: s(72, 78, 82, 74, 40, 38, 65, 78) },
    { positionLabel: 'OM', firstName: 'Tom', lastName: 'Bischoff', stats: s(76, 68, 80, 74, 48, 45, 64, 74) },
    { positionLabel: 'ST', firstName: 'Mergim', lastName: 'Berisha', stats: s(82, 78, 70, 62, 35, 32, 66, 74) },
    { positionLabel: 'ST', firstName: 'Wout', lastName: 'Weghorsten', stats: s(70, 80, 68, 60, 42, 40, 78, 76) },
  ],

  // Mainz (id: 7)
  7: [
    { positionLabel: 'TW', firstName: 'Robin', lastName: 'Zentnar', stats: s(42, 10, 50, 54, 20, 24, 35, 78) },
    { positionLabel: 'LV', firstName: 'Aaron', lastName: 'Martinsen', stats: s(78, 42, 68, 62, 74, 72, 64, 70) },
    { positionLabel: 'IV', firstName: 'Stefan', lastName: 'Belli', stats: s(62, 22, 60, 46, 76, 74, 72, 68) },
    { positionLabel: 'IV', firstName: 'Moritz', lastName: 'Hackett', stats: s(64, 24, 58, 48, 74, 72, 70, 67) },
    { positionLabel: 'RV', firstName: 'Silvan', lastName: 'Widmér', stats: s(80, 48, 70, 64, 72, 70, 62, 70) },
    { positionLabel: 'ZDM', firstName: 'Leandro', lastName: 'Barréiro', stats: s(72, 60, 78, 72, 76, 74, 68, 72) },
    { positionLabel: 'LM', firstName: 'Jae-sung', lastName: 'Lée', stats: s(78, 68, 80, 72, 48, 45, 62, 74) },
    { positionLabel: 'RM', firstName: 'Paul', lastName: 'Nebeling', stats: s(80, 70, 74, 66, 40, 38, 58, 72) },
    { positionLabel: 'OM', firstName: 'Nadiem', lastName: 'Amiri', stats: s(76, 72, 82, 76, 42, 40, 64, 76) },
    { positionLabel: 'ST', firstName: 'Karim', lastName: 'Onisiwó', stats: s(78, 76, 68, 60, 38, 35, 72, 74) },
    { positionLabel: 'ST', firstName: 'Ludovic', lastName: 'Ajorqué', stats: s(68, 78, 65, 58, 40, 38, 76, 74) },
  ],

  // Kiel (id: 8)
  8: [
    { positionLabel: 'TW', firstName: 'Thomas', lastName: 'Dahne', stats: s(40, 10, 48, 52, 20, 22, 34, 76) },
    { positionLabel: 'LV', firstName: 'Jan', lastName: 'Bercholter', stats: s(74, 38, 66, 60, 72, 70, 62, 68) },
    { positionLabel: 'IV', firstName: 'Simon', lastName: 'Lorénz', stats: s(60, 20, 58, 44, 74, 72, 70, 66) },
    { positionLabel: 'IV', firstName: 'Marco', lastName: 'Komenda', stats: s(62, 22, 56, 46, 72, 70, 68, 65) },
    { positionLabel: 'RV', firstName: 'Timo', lastName: 'Béckers', stats: s(78, 44, 68, 62, 70, 68, 60, 68) },
    { positionLabel: 'ZDM', firstName: 'Lewis', lastName: 'Holdtmann', stats: s(70, 55, 74, 68, 74, 72, 66, 70) },
    { positionLabel: 'LM', firstName: 'Fabian', lastName: 'Reesé', stats: s(80, 66, 72, 64, 40, 38, 58, 70) },
    { positionLabel: 'RM', firstName: 'Finn', lastName: 'Portélius', stats: s(78, 64, 70, 62, 42, 40, 56, 68) },
    { positionLabel: 'OM', firstName: 'Alexander', lastName: 'Mühling', stats: s(72, 68, 78, 72, 44, 42, 62, 72) },
    { positionLabel: 'ST', firstName: 'Benedikt', lastName: 'Piechotta', stats: s(76, 74, 66, 58, 35, 32, 64, 70) },
    { positionLabel: 'ST', firstName: 'Shuto', lastName: 'Machino', stats: s(82, 72, 68, 60, 34, 32, 60, 68) },
  ],

  // Gladbach (id: 9)
  9: [
    { positionLabel: 'TW', firstName: 'Jonas', lastName: 'Omlin', stats: s(44, 12, 52, 56, 22, 26, 36, 80) },
    { positionLabel: 'LV', firstName: 'Rami', lastName: 'Bensebaíni', stats: s(76, 45, 72, 66, 76, 74, 66, 72) },
    { positionLabel: 'IV', firstName: 'Ko', lastName: 'Itakúra', stats: s(66, 24, 64, 50, 80, 78, 76, 72) },
    { positionLabel: 'IV', firstName: 'Nico', lastName: 'Elvedín', stats: s(64, 28, 62, 48, 78, 76, 74, 71) },
    { positionLabel: 'RV', firstName: 'Joe', lastName: 'Scallý', stats: s(82, 48, 72, 66, 72, 70, 62, 72) },
    { positionLabel: 'ZDM', firstName: 'Christoph', lastName: 'Kramér', stats: s(70, 62, 80, 74, 76, 74, 68, 74) },
    { positionLabel: 'LM', firstName: 'Nathan', lastName: 'Ngoumóu', stats: s(90, 72, 74, 66, 38, 36, 58, 74) },
    { positionLabel: 'RM', firstName: 'Franck', lastName: 'Honoré', stats: s(82, 70, 78, 70, 42, 40, 62, 74) },
    { positionLabel: 'OM', firstName: 'Florian', lastName: 'Neuhauser', stats: s(76, 74, 84, 78, 44, 42, 66, 78) },
    { positionLabel: 'ST', firstName: 'Tim', lastName: 'Kleindiénst', stats: s(76, 80, 70, 62, 40, 38, 72, 76) },
    { positionLabel: 'ST', firstName: 'Alassane', lastName: 'Pleá', stats: s(80, 78, 76, 68, 38, 36, 66, 76) },
  ],

  // Berlin (id: 10)
  10: [
    { positionLabel: 'TW', firstName: 'Frederik', lastName: 'Rönne', stats: s(42, 10, 50, 54, 20, 24, 34, 78) },
    { positionLabel: 'LV', firstName: 'Robin', lastName: 'Gösens', stats: s(82, 52, 74, 68, 74, 72, 64, 74) },
    { positionLabel: 'IV', firstName: 'Diogo', lastName: 'Leíte', stats: s(64, 24, 62, 48, 78, 76, 74, 70) },
    { positionLabel: 'IV', firstName: 'Marc-Oliver', lastName: 'Kémpf', stats: s(62, 22, 60, 46, 76, 74, 72, 68) },
    { positionLabel: 'RV', firstName: 'Jonjoe', lastName: 'Kennédy', stats: s(78, 44, 70, 64, 72, 70, 62, 70) },
    { positionLabel: 'ZDM', firstName: 'Rani', lastName: 'Khedíra', stats: s(68, 58, 78, 72, 78, 76, 70, 74) },
    { positionLabel: 'LM', firstName: 'Kevin', lastName: 'Stögér', stats: s(74, 70, 82, 76, 44, 42, 64, 76) },
    { positionLabel: 'RM', firstName: 'Derry', lastName: 'Lukébakio', stats: s(88, 74, 72, 64, 36, 34, 58, 74) },
    { positionLabel: 'OM', firstName: 'Suat', lastName: 'Serdár', stats: s(72, 68, 80, 74, 48, 45, 66, 74) },
    { positionLabel: 'ST', firstName: 'Davie', lastName: 'Selke', stats: s(76, 76, 68, 60, 38, 36, 70, 72) },
    { positionLabel: 'ST', firstName: 'Jordan', lastName: 'Siebácheu', stats: s(82, 74, 66, 58, 36, 34, 66, 70) },
  ],

  // Heidenheim (id: 11)
  11: [
    { positionLabel: 'TW', firstName: 'Kevin', lastName: 'Müllér', stats: s(40, 10, 48, 52, 18, 22, 32, 76) },
    { positionLabel: 'LV', firstName: 'Omar', lastName: 'Traoré', stats: s(78, 42, 66, 60, 72, 70, 62, 68) },
    { positionLabel: 'IV', firstName: 'Patrick', lastName: 'Mainka', stats: s(60, 22, 58, 44, 76, 74, 72, 68) },
    { positionLabel: 'IV', firstName: 'Benedikt', lastName: 'Adams', stats: s(62, 20, 56, 44, 74, 72, 70, 67) },
    { positionLabel: 'RV', firstName: 'Marnon', lastName: 'Bushá', stats: s(80, 44, 68, 62, 70, 68, 60, 68) },
    { positionLabel: 'ZDM', firstName: 'Lennard', lastName: 'Maloney', stats: s(68, 55, 74, 68, 74, 72, 66, 70) },
    { positionLabel: 'LM', firstName: 'Jan-Niklas', lastName: 'Besté', stats: s(82, 66, 72, 64, 40, 38, 58, 70) },
    { positionLabel: 'RM', firstName: 'Eren', lastName: 'Dinkelí', stats: s(76, 64, 70, 62, 42, 40, 56, 68) },
    { positionLabel: 'OM', firstName: 'Paul', lastName: 'Wanner', stats: s(80, 72, 78, 72, 40, 38, 62, 74) },
    { positionLabel: 'ST', firstName: 'Tim', lastName: 'Kleindíenst', stats: s(74, 76, 66, 58, 38, 36, 70, 72) },
    { positionLabel: 'ST', firstName: 'Adrian', lastName: 'Becker', stats: s(78, 72, 64, 56, 34, 32, 64, 68) },
  ],

  // Augsburg (id: 12)
  12: [
    { positionLabel: 'TW', firstName: 'Rafal', lastName: 'Gikéwicz', stats: s(42, 10, 48, 52, 20, 22, 34, 78) },
    { positionLabel: 'LV', firstName: 'Mads', lastName: 'Pedersén', stats: s(76, 40, 66, 60, 74, 72, 64, 70) },
    { positionLabel: 'IV', firstName: 'Jeffrey', lastName: 'Gouwelééuw', stats: s(58, 20, 62, 46, 78, 76, 74, 70) },
    { positionLabel: 'IV', firstName: 'Maximilian', lastName: 'Bauer', stats: s(60, 22, 58, 44, 76, 74, 72, 68) },
    { positionLabel: 'RV', firstName: 'Robert', lastName: 'Gumney', stats: s(80, 46, 68, 62, 72, 70, 62, 70) },
    { positionLabel: 'ZDM', firstName: 'Elvis', lastName: 'Rexhbecai', stats: s(70, 56, 76, 70, 74, 72, 66, 72) },
    { positionLabel: 'LM', firstName: 'Ruben', lastName: 'Vargas', stats: s(84, 70, 74, 66, 38, 36, 58, 72) },
    { positionLabel: 'RM', firstName: 'Philip', lastName: 'Tiétz', stats: s(74, 72, 70, 62, 42, 40, 60, 70) },
    { positionLabel: 'OM', firstName: 'Arne', lastName: 'Engel', stats: s(76, 66, 78, 72, 46, 44, 64, 72) },
    { positionLabel: 'ST', firstName: 'Ermedin', lastName: 'Demírovic', stats: s(78, 78, 70, 62, 38, 36, 68, 74) },
    { positionLabel: 'ST', firstName: 'Dion', lastName: 'Beljo', stats: s(76, 76, 66, 58, 36, 34, 72, 72) },
  ],

  // Bochum (id: 13)
  13: [
    { positionLabel: 'TW', firstName: 'Manuel', lastName: 'Riemann', stats: s(38, 8, 46, 50, 18, 20, 32, 74) },
    { positionLabel: 'LV', firstName: 'Bernardo', lastName: 'Soarés', stats: s(72, 38, 64, 58, 70, 68, 60, 66) },
    { positionLabel: 'IV', firstName: 'Erhan', lastName: 'Masovíc', stats: s(58, 18, 56, 42, 74, 72, 70, 66) },
    { positionLabel: 'IV', firstName: 'Keven', lastName: 'Schlotterbéck', stats: s(60, 20, 58, 44, 72, 70, 68, 65) },
    { positionLabel: 'RV', firstName: 'Cristian', lastName: 'Gamboá', stats: s(76, 42, 66, 60, 70, 68, 60, 68) },
    { positionLabel: 'ZDM', firstName: 'Anthony', lastName: 'Losillá', stats: s(66, 52, 72, 66, 74, 72, 66, 68) },
    { positionLabel: 'LM', firstName: 'Kevin', lastName: 'Stögér', stats: s(72, 68, 76, 70, 42, 40, 60, 72) },
    { positionLabel: 'RM', firstName: 'Philipp', lastName: 'Hoffman', stats: s(76, 66, 72, 64, 40, 38, 56, 68) },
    { positionLabel: 'OM', firstName: 'Pierre', lastName: 'Holtmann', stats: s(80, 64, 74, 68, 38, 36, 58, 70) },
    { positionLabel: 'ST', firstName: 'Moritz', lastName: 'Bröschinski', stats: s(78, 72, 64, 56, 34, 32, 64, 68) },
    { positionLabel: 'ST', firstName: 'Gonçalo', lastName: 'Paciencia', stats: s(72, 74, 68, 60, 36, 34, 68, 70) },
  ],

  // Freiburg (id: 14)
  14: [
    { positionLabel: 'TW', firstName: 'Mark', lastName: 'Flekken', stats: s(44, 12, 52, 56, 22, 26, 36, 82) },
    { positionLabel: 'LV', firstName: 'Christian', lastName: 'Günter', stats: s(76, 42, 72, 66, 78, 76, 66, 74) },
    { positionLabel: 'IV', firstName: 'Philipp', lastName: 'Lienhárt', stats: s(64, 24, 66, 50, 80, 78, 76, 72) },
    { positionLabel: 'IV', firstName: 'Matthias', lastName: 'Gintér', stats: s(62, 26, 68, 52, 82, 80, 78, 74) },
    { positionLabel: 'RV', firstName: 'Lukas', lastName: 'Küblér', stats: s(80, 46, 70, 64, 76, 74, 64, 72) },
    { positionLabel: 'ZDM', firstName: 'Nicolas', lastName: 'Höfler', stats: s(68, 58, 80, 74, 80, 78, 70, 76) },
    { positionLabel: 'LM', firstName: 'Vincenzo', lastName: 'Grifo', stats: s(76, 76, 84, 80, 40, 38, 62, 80) },
    { positionLabel: 'RM', firstName: 'Daniel-Kofi', lastName: 'Kyereh', stats: s(82, 70, 76, 68, 44, 42, 60, 74) },
    { positionLabel: 'OM', firstName: 'Yannik', lastName: 'Kebel', stats: s(74, 72, 80, 76, 48, 46, 66, 76) },
    { positionLabel: 'ST', firstName: 'Michael', lastName: 'Gregeritsch', stats: s(74, 80, 72, 64, 38, 36, 72, 76) },
    { positionLabel: 'ST', firstName: 'Lucas', lastName: 'Höhler', stats: s(84, 78, 70, 62, 36, 34, 66, 74) },
  ],

  // Wolfsburg (id: 15)
  15: [
    { positionLabel: 'TW', firstName: 'Koen', lastName: 'Castéels', stats: s(44, 12, 54, 58, 22, 26, 36, 82) },
    { positionLabel: 'LV', firstName: 'Paulo', lastName: 'Otávio', stats: s(78, 44, 70, 64, 74, 72, 64, 72) },
    { positionLabel: 'IV', firstName: 'Maxence', lastName: 'Lacrouix', stats: s(64, 22, 62, 48, 78, 76, 74, 70) },
    { positionLabel: 'IV', firstName: 'Sebastien', lastName: 'Bornauw', stats: s(66, 24, 64, 50, 80, 78, 76, 72) },
    { positionLabel: 'RV', firstName: 'Ridle', lastName: 'Bakú', stats: s(84, 50, 74, 68, 72, 70, 62, 74) },
    { positionLabel: 'ZDM', firstName: 'Arnold', lastName: 'Maximilian', stats: s(70, 62, 82, 78, 76, 74, 68, 76) },
    { positionLabel: 'LM', firstName: 'Patrick', lastName: 'Wimmér', stats: s(82, 70, 76, 68, 44, 42, 60, 74) },
    { positionLabel: 'RM', firstName: 'Yannick', lastName: 'Geráhdt', stats: s(76, 68, 80, 74, 46, 44, 64, 74) },
    { positionLabel: 'OM', firstName: 'Mattias', lastName: 'Svanberg', stats: s(74, 68, 80, 74, 50, 48, 66, 74) },
    { positionLabel: 'ST', firstName: 'Lukas', lastName: 'Nmechá', stats: s(80, 78, 72, 64, 38, 36, 68, 74) },
    { positionLabel: 'ST', firstName: 'Jonas', lastName: 'Wínd', stats: s(76, 80, 70, 62, 40, 38, 74, 76) },
  ],

  // Bremen (id: 16)
  16: [
    { positionLabel: 'TW', firstName: 'Jiri', lastName: 'Pavlénka', stats: s(42, 10, 50, 54, 20, 24, 34, 78) },
    { positionLabel: 'LV', firstName: 'Amos', lastName: 'Piepér', stats: s(74, 40, 68, 62, 76, 74, 66, 70) },
    { positionLabel: 'IV', firstName: 'Marco', lastName: 'Friedell', stats: s(62, 22, 62, 48, 78, 76, 74, 70) },
    { positionLabel: 'IV', firstName: 'Niklas', lastName: 'Stárk', stats: s(64, 24, 64, 50, 76, 74, 72, 69) },
    { positionLabel: 'RV', firstName: 'Mitchell', lastName: 'Weisér', stats: s(80, 48, 72, 66, 72, 70, 62, 72) },
    { positionLabel: 'ZDM', firstName: 'Christian', lastName: 'Groß', stats: s(68, 56, 78, 72, 76, 74, 68, 72) },
    { positionLabel: 'LM', firstName: 'Romano', lastName: 'Schmid', stats: s(82, 68, 76, 68, 42, 40, 60, 72) },
    { positionLabel: 'RM', firstName: 'Leonardo', lastName: 'Bittencóurt', stats: s(76, 70, 80, 74, 40, 38, 62, 74) },
    { positionLabel: 'OM', firstName: 'Marvin', lastName: 'Duckschér', stats: s(78, 74, 78, 72, 44, 42, 64, 76) },
    { positionLabel: 'ST', firstName: 'Niclas', lastName: 'Füllkrüg', stats: s(72, 82, 70, 62, 40, 38, 76, 78) },
    { positionLabel: 'ST', firstName: 'Rafael', lastName: 'Borré', stats: s(82, 76, 72, 64, 38, 36, 66, 74) },
  ],

  // St. Pauli (id: 17)
  17: [
    { positionLabel: 'TW', firstName: 'Nikola', lastName: 'Vasílj', stats: s(40, 10, 48, 52, 18, 22, 32, 76) },
    { positionLabel: 'LV', firstName: 'Leart', lastName: 'Paquaráda', stats: s(76, 40, 66, 60, 72, 70, 62, 68) },
    { positionLabel: 'IV', firstName: 'Jakov', lastName: 'Medíc', stats: s(60, 20, 58, 44, 76, 74, 72, 68) },
    { positionLabel: 'IV', firstName: 'Adam', lastName: 'Dzwigala', stats: s(58, 18, 56, 42, 74, 72, 70, 66) },
    { positionLabel: 'RV', firstName: 'Manolis', lastName: 'Saliakas', stats: s(80, 46, 68, 62, 70, 68, 60, 68) },
    { positionLabel: 'ZDM', firstName: 'Marcel', lastName: 'Hartel', stats: s(72, 60, 76, 70, 72, 70, 64, 72) },
    { positionLabel: 'LM', firstName: 'Oladapo', lastName: 'Afoláyan', stats: s(88, 68, 70, 62, 36, 34, 56, 70) },
    { positionLabel: 'RM', firstName: 'Jackson', lastName: 'Irvíne', stats: s(74, 62, 72, 66, 46, 44, 62, 70) },
    { positionLabel: 'OM', firstName: 'Carlo', lastName: 'Boukhalfa', stats: s(76, 66, 76, 70, 44, 42, 60, 72) },
    { positionLabel: 'ST', firstName: 'Johannes', lastName: 'Eggesteín', stats: s(78, 76, 68, 60, 36, 34, 66, 72) },
    { positionLabel: 'ST', firstName: 'Elias', lastName: 'Sáad', stats: s(80, 72, 66, 58, 34, 32, 62, 68) },
  ],
}
