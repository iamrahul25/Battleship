import {
  applyAction,
  botViewFromPublic,
  createBot,
  createGame,
  createRng,
  createRules,
  type Difficulty,
  getPublicView,
  randomFleet,
  type RuleSet,
} from '../src/shared/engine';

export interface SimResult {
  shots: number;
  turns: number;
  illegal: number;
  powerUps: number;
}

/**
 * Bot (player 0) vs a passive random fleet (player 1, who only ever misses into
 * an empty spot it never runs out of). Counts shots to sink the whole fleet.
 */
export function simulateGame(difficulty: Difficulty, seed: number, rules: RuleSet = createRules({ powerUpsEnabled: false, bonusShotOnHit: false })): SimResult {
  const rng = createRng(seed);
  const bot = createBot(difficulty, rules, createRng(seed ^ 0x9e3779b9));
  let state = createGame(rules, seed);
  state = applyAction(state, { type: 'PLACE_FLEET', player: 0, ships: bot.placeFleet() }).state;
  state = applyAction(state, { type: 'PLACE_FLEET', player: 1, ships: randomFleet(rules, rng) }).state;
  state = applyAction(state, { type: 'READY', player: 0 }).state;
  state = applyAction(state, { type: 'READY', player: 1 }).state;

  let illegal = 0;
  let turns = 0;
  let powerUps = 0;
  while (state.phase === 'battle' && turns < 1000) {
    if (state.activePlayer === 1) {
      // Passive opponent: skip its turn by handing the move straight back.
      state = { ...state, activePlayer: 0 };
      continue;
    }
    turns++;
    const action = bot.chooseAction(botViewFromPublic(getPublicView(state, 0)));
    const res =
      action.type === 'FIRE'
        ? applyAction(state, { type: 'FIRE', player: 0, target: action.target })
        : applyAction(state, { type: 'USE_WEAPON', player: 0, weaponId: action.weaponId, target: action.target });
    if (res.error) {
      illegal++;
      if (illegal > 5) break;
      continue;
    }
    if (action.type === 'USE_WEAPON') powerUps++;
    state = res.state;
  }
  return { shots: state.players[0].shotsFired, turns, illegal, powerUps };
}

export function summarize(values: number[]) {
  const sorted = values.slice().sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const median = sorted[Math.floor(sorted.length / 2)];
  return { mean, median, min: sorted[0], max: sorted[sorted.length - 1] };
}

export function runSimulation(difficulty: Difficulty, games: number, rules?: RuleSet) {
  const results = Array.from({ length: games }, (_, i) => simulateGame(difficulty, i + 1, rules));
  return {
    difficulty,
    games,
    shots: summarize(results.map((r) => r.shots)),
    turns: summarize(results.map((r) => r.turns)),
    illegal: results.reduce((a, r) => a + r.illegal, 0),
    powerUps: results.reduce((a, r) => a + r.powerUps, 0),
  };
}
