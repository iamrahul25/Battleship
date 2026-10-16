/**
 * Bot difficulty simulation: `npm run bot-sim -- [games] [--arsenal]`.
 * Exits non-zero unless mean shots-to-win satisfy Hard < Medium < Easy.
 */
import { createRules, type Difficulty } from '../src/shared/engine';
import { runSimulation } from './simulate';

const args = process.argv.slice(2);
const games = Number(args.find((a) => /^\d+$/.test(a)) ?? 1000);
const arsenal = args.includes('--arsenal');
const rules = createRules({ powerUpsEnabled: arsenal, bonusShotOnHit: false });

const rows = (['easy', 'medium', 'hard'] as Difficulty[]).map((d) => {
  const start = performance.now();
  const r = runSimulation(d, games, rules);
  const ms = performance.now() - start;
  return {
    difficulty: d,
    games,
    meanShots: r.shots.mean.toFixed(1),
    medianShots: r.shots.median,
    meanTurns: r.turns.mean.toFixed(1),
    min: r.shots.min,
    max: r.shots.max,
    illegal: r.illegal,
    powerUps: r.powerUps,
    msPerTurn: (ms / (r.turns.mean * games)).toFixed(3),
  };
});

console.log(`Bot simulation (${arsenal ? 'Arsenal' : 'Classic'} rules, ${games} games each)`);
console.table(rows);

const [easy, medium, hard] = rows.map((r) => Number(arsenal ? r.meanTurns : r.meanShots));
const illegal = rows.some((r) => r.illegal > 0);
if (!(hard < medium && medium < easy) || illegal) {
  console.error('FAIL: expected Hard < Medium < Easy with no illegal moves');
  process.exit(1);
}
console.log('OK: Hard < Medium < Easy');
