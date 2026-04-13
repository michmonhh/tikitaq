/**
 * Ticker text templates for all game events.
 * Each event type has multiple variants — one is picked randomly.
 *
 * Placeholders:
 *   {player}    — the acting player's name
 *   {target}    — the target player's name (receiver, tackled player, keeper, etc.)
 *   {team}      — the team's short name
 *
 * To add a new language: add a new object to TICKER_LANGUAGES and
 * set the active language via setTickerLanguage().
 */

export interface TickerTextSet {
  pass_complete_ground: string[]
  pass_complete_high: string[]
  through_ball_complete: string[]
  pass_intercepted: string[]
  pass_lost: string[]
  pass_out_corner: string[]
  pass_out_throw: string[]
  offside: string[]
  shot_scored: string[]
  shot_saved: string[]
  shot_missed: string[]
  tackle_won: string[]
  tackle_lost: string[]
  move: string[]
  goal_kick: string[]
}

const TICKER_DE: TickerTextSet = {
  pass_complete_ground: [
    '{player} spielt den Ball flach zu {target}.',
    '{player} passt präzise auf {target}.',
    'Guter Flachpass von {player} — {target} nimmt an.',
    '{player} schickt den Ball rüber zu {target}.',
    '{target} bekommt das Zuspiel von {player}.',
    'Sauberer Pass! {player} findet {target}.',
    '{player} legt quer auf {target}.',
    '{player} mit dem Kurzpass zu {target}.',
    '{target} wird von {player} bedient.',
    'Feiner Flachpass — {player} zu {target}.',
  ],
  pass_complete_high: [
    '{player} chippt den Ball über die Abwehr zu {target}!',
    'Hoher Ball von {player} — {target} nimmt ihn runter!',
    '{player} schlägt einen langen Ball auf {target}.',
    'Starker Diagonalball! {player} findet {target}.',
    '{player} hebt den Ball über die Verteidiger zu {target}.',
    '{target} pflückt den hohen Ball von {player} aus der Luft.',
    'Traumpass! {player} spielt einen Heber auf {target}.',
    '{player} versucht den langen Ball — {target} ist zur Stelle!',
    'Präziser Flugball von {player} erreicht {target}.',
    '{player} mit dem Chipball — {target} kontrolliert perfekt.',
  ],
  through_ball_complete: [
    'Genialer Steilpass! {player} schickt {target} in die Tiefe!',
    '{player} spielt den Ball in den Raum — {target} startet durch!',
    'Traumpass von {player}! {target} läuft hinter die Kette!',
    '{player} hebelt die Abwehr aus — {target} ist frei!',
    'Was für ein Pass! {player} steckt durch auf {target}!',
    '{target} sprintet dem Steilpass von {player} hinterher!',
    '{player} mit dem Auge — Steilpass in die Gasse, {target} nimmt mit!',
    'Klasse! {player} spielt den Ball in die Schnittstelle für {target}!',
  ],
  pass_intercepted: [
    '{target} liest den Pass und fängt ab!',
    'Fehlpass von {player} — {target} schnappt sich den Ball!',
    '{target} antizipiert den Pass und geht dazwischen!',
    'Abgefangen! {target} unterbricht das Spiel von {player}.',
    '{player} versucht den Pass, aber {target} ist schneller!',
    'Ballverlust! {target} klaut {player} den Ball.',
    '{target} stiehlt {player} den Ball — Konterchance!',
    'Das war nichts! {target} fängt den Pass von {player} ab.',
    '{player} spielt ungenau — {target} ist zur Stelle.',
    'Starke Balleroberung von {target}!',
  ],
  pass_lost: [
    '{player} spielt den Pass ins Leere — Ball ist frei!',
    'Fehlpass von {player}! Der Ball kullert ins Niemandsland.',
    '{player} findet keinen Abnehmer — Ball liegt frei.',
    'Ungenaues Zuspiel von {player}. Der Ball ist herrenlos.',
    '{player} verspielt den Ball — lose Kugel!',
    'Der Pass von {player} geht ins Nichts.',
    '{player} verschätzt sich — der Ball liegt frei am Boden.',
    'Kein Mitspieler in der Nähe! {player} verliert den Ball.',
    '{player} passt daneben — Ball ohne Besitzer.',
    'Missglückter Pass von {player}, der Ball rollt weg.',
  ],
  pass_out_corner: [
    '{player} befördert den Ball ins Aus — Eckstoß!',
    'Der Ball geht über die Grundlinie! Ecke.',
    '{player} schlägt den Ball ins Toraus. Eckball!',
    'Eckstoß! {player}s Pass geht ins Seitenaus.',
    'Ball hinter der Grundlinie — Ecke für den Gegner.',
    'Der Ball rollt ins Toraus. Eckstoß!',
    '{player} klärt zur Ecke.',
    'Corner! Der Ball war zuletzt bei {player}.',
    '{player}s Flanke geht ins Aus — Eckball!',
    'Eckstoß nach Klärung von {player}.',
  ],
  pass_out_throw: [
    '{player} spielt den Ball ins Seitenaus — Einwurf.',
    'Ball über die Seitenlinie! Einwurf.',
    '{player}s Pass geht ins Aus. Einwurf für den Gegner.',
    'Einwurf! Der Ball war zuletzt bei {player}.',
    '{player} spielt den Ball über die Linie.',
    'Ball ins Seitenaus — Einwurf.',
    '{player} verzieht — Einwurf für die andere Mannschaft.',
    'Seitenaus! {player}s Pass war zu lang.',
    'Einwurf nach Fehlpass von {player}.',
    'Der Ball verlässt das Spielfeld. Einwurf.',
  ],
  offside: [
    '{player} steht im Abseits! Freistoß.',
    'Abseits! {player} war zu weit vorne.',
    'Die Fahne geht hoch — {player} steht im Abseits.',
    '{player} wird abseits erwischt. Freistoß.',
    'Abseitsentscheidung gegen {player}!',
    '{player} startet zu früh — Abseits!',
    'Abseitsstellung von {player}. Das Spiel wird unterbrochen.',
    '{player} stand im Abseits — der Angriff ist vorbei.',
    'Knapp, aber Abseits! {player} war einen Schritt zu weit.',
    'Der Linienrichter zeigt Abseits bei {player} an.',
  ],
  shot_scored: [
    '⚽ TOR! {player} trifft ins Netz!',
    '⚽ TOOOR! {player} schießt ein!',
    '⚽ Er macht ihn! {player} netzt ein!',
    '⚽ Traumtor von {player}! Der Ball zappelt im Netz!',
    '⚽ {player} trifft! Was für ein Treffer!',
    '⚽ TOR! {player} lässt dem Torwart keine Chance!',
    '⚽ Da ist das Tor! {player} schiebt ein!',
    '⚽ {player} vollendet eiskalt! Tor!',
    '⚽ Unhaltbar! {player} trifft zum Jubel der Fans!',
    '⚽ GOOOL! {player} mit dem entscheidenden Schuss!',
  ],
  shot_saved: [
    'Starke Parade! {target} hält den Schuss von {player}!',
    'Gehalten! {target} pariert den Versuch von {player}.',
    '{player} schießt — aber {target} ist zur Stelle!',
    'Glanzparade von {target}! {player} scheitert.',
    '{target} kratzt den Ball gerade noch weg!',
    'Klasse Reaktion! {target} wehrt {player}s Schuss ab.',
    '{player} zieht ab, aber {target} fischt den Ball!',
    'Großartige Parade! {target} hält {player}s Schuss.',
    '{target} streckt sich und pariert — {player} kann es nicht fassen.',
    'Sensationelle Rettung von {target} gegen {player}!',
  ],
  shot_missed: [
    '{player} schießt — knapp vorbei!',
    '{player} zieht ab, aber der Ball geht daneben.',
    'Drüber! {player}s Schuss geht über das Tor.',
    '{player} versucht sein Glück — weit vorbei!',
    '{player} feuert los — der Ball segelt am Tor vorbei.',
    'Knapp daneben! {player}s Versuch geht am Pfosten vorbei.',
    '{player} verzieht — Abstoß.',
    '{player} probiert es aus der Distanz — daneben!',
    'Der Schuss von {player} geht ins Toraus.',
    '{player} haut drauf, aber der Ball fliegt am Kasten vorbei.',
  ],
  tackle_won: [
    'Starker Zweikampf! {player} grätscht {target} den Ball ab!',
    '{player} gewinnt das Duell gegen {target}!',
    'Toller Einsatz! {player} erobert den Ball von {target}.',
    '{player} mit dem entscheidenden Tackling gegen {target}!',
    'Ballgewinn! {player} nimmt {target} die Kugel ab.',
    '{player} geht hart rein und holt sich den Ball von {target}.',
    'Sauberer Zweikampf — {player} lässt {target} stehen.',
    '{player} gewinnt das Laufduell gegen {target}!',
    'Klasse Defensivarbeit von {player} gegen {target}.',
    '{player} schnappt sich den Ball — {target} hat das Nachsehen.',
  ],
  tackle_lost: [
    '{player} behauptet den Ball gegen {target}!',
    '{target} kommt nicht an {player} vorbei!',
    '{player} ist zu stark — {target} prallt ab.',
    '{player} schüttelt {target} ab und zieht weiter!',
    'Körperduell gewonnen! {player} lässt {target} stehen.',
    '{player} dreht sich weg von {target} — Ball behauptet.',
    '{target} versucht den Zweikampf — {player} ist clever.',
    '{player} hält {target} auf Distanz.',
    '{player} mit der starken Ballbehauptung gegen {target}!',
    '{target} rutscht ab — {player} behält den Ball.',
  ],
  move: [
    '{player} rückt vor.',
    '{player} macht einen Lauf.',
    '{player} verschiebt seine Position.',
    '{player} sprintet los.',
    '{player} sucht den freien Raum.',
    '{player} bewegt sich in Stellung.',
    '{player} löst sich aus der Deckung.',
    '{player} bietet sich an.',
    '{player} macht sich breit.',
    '{player} startet durch.',
  ],
  goal_kick: [
    'Abstoß für {team}. {player} legt sich den Ball zurecht.',
    '{player} führt den Abstoß aus.',
    'Abstoß. {player} bringt den Ball wieder ins Spiel.',
    '{player} nimmt den Abstoß.',
    'Abstoß für {team} — {player} am Ball.',
    '{player} tritt den Abstoß.',
    'Der Abstoß wird von {player} ausgeführt.',
    '{player} schlägt den Ball vom Fünfmeterraum ab.',
    'Abstoß. {player} hat den Ball.',
    '{player} bringt den Ball per Abstoß zurück ins Spiel.',
  ],
}

const TICKER_EN: TickerTextSet = {
  pass_complete_ground: [
    '{player} slides it through to {target}.',
    'Neat pass from {player} finds {target}.',
    '{player} plays it short to {target}.',
    '{target} receives the ball from {player}.',
    'Quick exchange — {player} to {target}.',
    '{player} threads it to {target}.',
    'Tidy pass by {player}, {target} picks it up.',
    '{player} lays it off to {target}.',
    '{target} collects from {player}.',
    '{player} rolls it into the path of {target}.',
  ],
  pass_complete_high: [
    '{player} chips it over the defense to {target}!',
    'Lovely lofted ball from {player} — {target} brings it down!',
    '{player} launches a long ball to {target}.',
    'Superb diagonal! {player} picks out {target}.',
    '{player} floats one over the top to {target}.',
    '{target} plucks the high ball from {player} out of the air.',
    'Dream pass! {player} lobs it to {target}.',
    '{player} attempts the long ball — {target} is there!',
    'Pinpoint delivery from {player} reaches {target}.',
    '{player} with the chip — {target} controls it perfectly.',
  ],
  through_ball_complete: [
    'Brilliant through ball! {player} sends {target} in behind!',
    '{player} plays it into space — {target} is through on goal!',
    'Dream ball from {player}! {target} runs onto it behind the line!',
    '{player} splits the defense — {target} is free!',
    'What a pass! {player} threads it through for {target}!',
    '{target} sprints onto the through ball from {player}!',
    '{player} with vision — slips {target} in behind the back line!',
    'Superb! {player} plays the ball into the channel for {target}!',
  ],
  pass_intercepted: [
    '{target} reads the pass and picks it off!',
    'Loose pass from {player} — {target} intercepts!',
    '{target} anticipates and steps in!',
    'Intercepted! {target} cuts out {player}\'s pass.',
    '{player} tries the pass, but {target} is quicker!',
    'Turnover! {target} steals the ball from {player}.',
    '{target} nips in and takes the ball — counter on!',
    'Poor pass! {target} collects {player}\'s stray ball.',
    '{player} plays it loose — {target} pounces.',
    'Brilliant interception by {target}!',
  ],
  pass_lost: [
    '{player} plays a stray pass into open space.',
    'Misplaced pass from {player}! The ball runs free.',
    '{player} can\'t find a teammate — ball is loose.',
    'Wayward pass by {player}. Nobody there.',
    '{player} gives it away — loose ball!',
    '{player}\'s pass drifts into no man\'s land.',
    '{player} misjudges it — the ball trickles away.',
    'No one near! {player} wastes possession.',
    '{player} passes into thin air.',
    'Sloppy ball from {player}, rolling free.',
  ],
  pass_out_corner: [
    '{player}\'s pass goes behind for a corner!',
    'Ball over the goal line — corner kick!',
    '{player} puts it out for a corner.',
    'Corner! Last touch was {player}.',
    'Ball behind the byline — corner kick.',
    'It rolls out for a corner after {player}\'s clearance.',
    'Corner kick! {player} can\'t keep it in play.',
    '{player}\'s cross goes out — corner.',
    'Corner flag! Ball went out off {player}.',
    'Goal kick overruled — corner for the opponents.',
  ],
  pass_out_throw: [
    '{player}\'s pass goes out for a throw-in.',
    'Ball over the sideline — throw-in.',
    '{player} puts it into touch.',
    'Throw-in! Last touch was {player}.',
    '{player} plays it out of bounds.',
    'Out for a throw — {player}\'s pass was too heavy.',
    '{player} overhits it — throw-in.',
    'Sideline! {player}\'s ball drifts out.',
    'Throw-in after a mispass from {player}.',
    'The ball leaves the field. Throw-in.',
  ],
  offside: [
    '{player} is caught offside! Free kick.',
    'Offside! {player} was ahead of the last defender.',
    'Flag goes up — {player} is offside.',
    '{player} timed the run wrong. Offside.',
    'Offside call against {player}!',
    '{player} broke too early — offside.',
    '{player} was in an offside position. Play stopped.',
    '{player} caught offside — the attack breaks down.',
    'Close, but offside! {player} was a step too far.',
    'The linesman signals offside against {player}.',
  ],
  shot_scored: [
    '⚽ GOAL! {player} finds the back of the net!',
    '⚽ GOAAAL! {player} scores!',
    '⚽ He\'s done it! {player} buries it!',
    '⚽ Stunning strike from {player}! Goal!',
    '⚽ {player} scores! What a finish!',
    '⚽ GOAL! {player} gives the keeper no chance!',
    '⚽ It\'s in! {player} slots it home!',
    '⚽ {player} finishes ice cold! Goal!',
    '⚽ Unstoppable! {player} fires it in!',
    '⚽ GOOOL! {player} with the decisive strike!',
  ],
  shot_saved: [
    'What a save! {target} denies {player}!',
    'Saved! {target} keeps out {player}\'s effort.',
    '{player} shoots — but {target} is equal to it!',
    'Brilliant stop by {target}! {player} is denied.',
    '{target} claws the ball away just in time!',
    'Great reflexes! {target} parries {player}\'s shot.',
    '{player} fires — {target} dives and saves!',
    'Outstanding save! {target} tips {player}\'s shot away.',
    '{target} stretches and saves — {player} can\'t believe it.',
    'Sensational keeping from {target} to deny {player}!',
  ],
  shot_missed: [
    '{player} lets fly — but it\'s off target!',
    '{player} shoots, but it drifts wide.',
    'Over the bar! {player}\'s effort goes high.',
    '{player} tries his luck — well wide!',
    '{player} fires — the ball sails past the post.',
    'Just wide! {player}\'s shot shaves the woodwork.',
    '{player} blazes it over — goal kick.',
    '{player} tries from distance — off target!',
    '{player}\'s shot goes behind for a goal kick.',
    '{player} pulls the trigger, but it flies over.',
  ],
  tackle_won: [
    'Crunching tackle! {player} wins the ball from {target}!',
    '{player} comes out on top against {target}!',
    'Great challenge! {player} dispossesses {target}.',
    '{player} with a decisive tackle on {target}!',
    'Ball won! {player} takes it off {target}.',
    '{player} goes in hard and wins the ball from {target}.',
    'Clean tackle — {player} leaves {target} empty-handed.',
    '{player} wins the foot race against {target}!',
    'Superb defensive work by {player} on {target}.',
    '{player} snatches the ball — {target} left behind.',
  ],
  tackle_lost: [
    '{player} holds off {target} and keeps possession!',
    '{target} can\'t get past {player}!',
    '{player} is too strong — {target} bounces off.',
    '{player} shrugs off {target} and drives forward!',
    'Physical battle won! {player} stands firm against {target}.',
    '{player} turns away from {target} — ball retained.',
    '{target} goes for the tackle — {player} is too clever.',
    '{player} shields it from {target}.',
    '{player} with the brilliant hold-up play against {target}!',
    '{target} slides in but {player} keeps the ball.',
  ],
  move: [
    '{player} makes a run.',
    '{player} pushes forward.',
    '{player} shifts position.',
    '{player} sprints into space.',
    '{player} looks for room.',
    '{player} adjusts his position.',
    '{player} breaks free from the marker.',
    '{player} offers himself for a pass.',
    '{player} drifts wide.',
    '{player} surges ahead.',
  ],
  goal_kick: [
    'Goal kick for {team}. {player} places the ball.',
    '{player} takes the goal kick.',
    'Goal kick. {player} restarts play.',
    '{player} takes the kick from the six-yard box.',
    'Goal kick for {team} — {player} on the ball.',
    '{player} boots it from the back.',
    'The goal kick is taken by {player}.',
    '{player} launches it from the goal area.',
    'Goal kick. {player} has the ball.',
    '{player} brings the ball back into play.',
  ],
}

// --- Language management ---

export const TICKER_LANGUAGES: Record<string, TickerTextSet> = {
  en: TICKER_EN,
  de: TICKER_DE,
}

let currentLanguage: string = 'de'

export function setTickerLanguage(lang: string) {
  if (TICKER_LANGUAGES[lang]) currentLanguage = lang
}

export function getTickerLanguage(): string {
  return currentLanguage
}

function getTexts(): TickerTextSet {
  return TICKER_LANGUAGES[currentLanguage] ?? TICKER_EN
}

function pick(variants: string[]): string {
  return variants[Math.floor(Math.random() * variants.length)]
}

function fill(template: string, vars: Record<string, string>): string {
  let result = template
  for (const [key, val] of Object.entries(vars)) {
    result = result.replaceAll(`{${key}}`, val)
  }
  return result
}

// --- Public API ---

export function tickerPassGround(player: string, target: string): string {
  return fill(pick(getTexts().pass_complete_ground), { player, target })
}

export function tickerPassHigh(player: string, target: string): string {
  return fill(pick(getTexts().pass_complete_high), { player, target })
}

export function tickerThroughBall(player: string, target: string): string {
  return fill(pick(getTexts().through_ball_complete), { player, target })
}

export function tickerPassIntercepted(player: string, target: string): string {
  return fill(pick(getTexts().pass_intercepted), { player, target })
}

export function tickerPassLost(player: string): string {
  return fill(pick(getTexts().pass_lost), { player })
}

export function tickerPassOutCorner(player: string): string {
  return fill(pick(getTexts().pass_out_corner), { player })
}

export function tickerPassOutThrow(player: string): string {
  return fill(pick(getTexts().pass_out_throw), { player })
}

export function tickerOffside(player: string): string {
  return fill(pick(getTexts().offside), { player })
}

export function tickerGoal(player: string): string {
  return fill(pick(getTexts().shot_scored), { player })
}

export function tickerSave(player: string, target: string): string {
  return fill(pick(getTexts().shot_saved), { player, target })
}

export function tickerMiss(player: string): string {
  return fill(pick(getTexts().shot_missed), { player })
}

export function tickerTackleWon(player: string, target: string): string {
  return fill(pick(getTexts().tackle_won), { player, target })
}

export function tickerTackleLost(player: string, target: string): string {
  return fill(pick(getTexts().tackle_lost), { player, target })
}

export function tickerMove(player: string): string {
  return fill(pick(getTexts().move), { player })
}

export function tickerGoalKick(player: string, team: string): string {
  return fill(pick(getTexts().goal_kick), { player, team })
}
