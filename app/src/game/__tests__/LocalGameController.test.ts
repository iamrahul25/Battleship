import { createBot, createRng, type Difficulty, rulesForMode } from '@shared/engine';
import { LocalGameController, type LocalGameOptions } from '../controllers/LocalGameController';
import type { ControllerEvent } from '../controllers/types';

const options = (over: Partial<LocalGameOptions> = {}): LocalGameOptions => ({
  difficulty: 'easy',
  mode: 'arsenal',
  bonusShotOnHit: true,
  allowTouching: false,
  offlineTimer: false,
  me: { name: 'Tester', avatarId: 'captain', wins: 0, losses: 0, connected: true },
  seed: 1234,
  ...over,
});

function placeHumanFleet(c: LocalGameController, seed = 99) {
  const helper = createBot('easy', c.rules, createRng(seed));
  c.placeFleet(helper.placeFleet());
  c.ready();
}

/** Plays a whole game with the human firing row by row; returns all emitted events. */
function playOut(c: LocalGameController) {
  const events: ControllerEvent[] = [];
  c.subscribe((e) => events.push(e));
  placeHumanFleet(c);
  const { width, height } = c.rules.grid;
  const targets: { x: number; y: number }[] = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) targets.push({ x, y });

  let guard = 0;
  while (c.getState().phase === 'battle' && guard++ < 1000) {
    if (c.getState().activePlayer === 0) {
      const t = targets.shift();
      if (!t) break;
      c.fire(t);
    } else {
      jest.advanceTimersByTime(5000);
    }
  }
  return events;
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('LocalGameController', () => {
  it('starts in placement with the bot already ready', () => {
    const c = new LocalGameController(options());
    const view = c.getView();
    expect(view.phase).toBe('placement');
    expect(view.enemy.ready).toBe(true);
    expect(c.getMeta().opponent?.isBot).toBe(true);
    c.dispose();
  });

  it('moves to battle once the human readies', () => {
    const c = new LocalGameController(options());
    placeHumanFleet(c);
    expect(c.getView().phase).toBe('battle');
    c.dispose();
  });

  it.each<Difficulty>(['easy', 'medium', 'hard'])('plays a full game against the %s bot', (difficulty) => {
    const c = new LocalGameController(options({ difficulty }));
    const events = playOut(c);
    const over = events.find((e) => e.type === 'gameOver');
    expect(c.getState().phase).toBe('finished');
    expect(over).toBeDefined();
    if (over?.type === 'gameOver') {
      expect(over.reason).toBe('sunk');
      expect(over.revealFleet).toHaveLength(c.rules.fleet.reduce((n, f) => n + f.count, 0));
    }
    expect(events.some((e) => e.type === 'shot' && e.event.by === 1)).toBe(true);
    c.dispose();
  });

  it('reports engine errors without changing state', () => {
    const c = new LocalGameController(options());
    const errors: string[] = [];
    c.subscribe((e) => e.type === 'error' && errors.push(e.code));
    c.fire({ x: 0, y: 0 });
    expect(errors).toHaveLength(1);
    expect(c.getView().phase).toBe('placement');
    c.dispose();
  });

  it('does not let the bot move while paused', () => {
    const c = new LocalGameController(options());
    placeHumanFleet(c);
    // Find a miss so the turn passes to the bot.
    for (let i = 0; i < 100 && c.getState().activePlayer === 0; i++) c.fire({ x: i % 10, y: Math.floor(i / 10) });
    expect(c.getState().activePlayer).toBe(1);
    c.pause();
    const before = c.getState().log.length;
    jest.advanceTimersByTime(20_000);
    expect(c.getState().log.length).toBe(before);
    c.resume();
    jest.advanceTimersByTime(5000);
    expect(c.getState().log.length).toBeGreaterThan(before);
    c.dispose();
  });

  it('auto-fires for the human when the offline timer runs out', () => {
    const c = new LocalGameController(options({ offlineTimer: true }));
    placeHumanFleet(c);
    expect(c.getMeta().deadline).not.toBeNull();
    jest.advanceTimersByTime((c.rules.turnTimeMs ?? 0) + 1000);
    expect(c.getState().log.some((e) => e.by === 0 && e.auto)).toBe(true);
    c.dispose();
  });

  it('round-trips a saved game', () => {
    const c = new LocalGameController(options());
    expect(c.serialize()).toBeNull();
    placeHumanFleet(c);
    c.fire({ x: 4, y: 4 });
    const saved = c.serialize();
    expect(saved).not.toBeNull();
    c.dispose();

    const restored = LocalGameController.fromSave(JSON.parse(JSON.stringify(saved)));
    expect(restored.getView()).toEqual(c.getView());
    expect(restored.rules).toEqual(c.rules);
    restored.dispose();
  });

  it('rematch starts a fresh placement', () => {
    const c = new LocalGameController(options());
    playOut(c);
    c.rematch();
    expect(c.getView().phase).toBe('placement');
    expect(c.getView().enemy.ready).toBe(true);
    c.dispose();
  });

  it('builds classic rules without power-ups', () => {
    const c = new LocalGameController(options({ mode: 'classic' }));
    expect(c.rules).toEqual(rulesForMode('classic', { bonusShotOnHit: true, allowTouching: false, turnTimeMs: null }));
    c.dispose();
  });
});
