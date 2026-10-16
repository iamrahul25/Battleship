import { createBot, createRng } from '@shared/engine';
import { LocalGameController } from '@/game/controllers/LocalGameController';
import { useAchievementsStore } from '../achievements';
import { useMatchStore } from '../match';
import { useStatsStore } from '../stats';

jest.mock('@/audio/SoundManager', () => ({
  playSound: jest.fn(),
  SoundManager: { playMusic: jest.fn(), setIntensity: jest.fn(), play: jest.fn() },
}));
jest.mock('@/platform/haptics', () => ({ haptic: jest.fn() }));
jest.mock('@/game/savedGame', () => ({
  saveGame: jest.fn(() => Promise.resolve()),
  clearSavedGame: jest.fn(() => Promise.resolve()),
  loadSavedGame: jest.fn(() => Promise.resolve(null)),
}));

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  useMatchStore.getState().detach();
  jest.useRealTimers();
});

function newGame() {
  const controller = new LocalGameController({
    difficulty: 'medium',
    mode: 'arsenal',
    bonusShotOnHit: true,
    allowTouching: false,
    offlineTimer: false,
    me: { name: 'Tester', avatarId: 'captain', wins: 0, losses: 0, connected: true },
    seed: 42,
  });
  useMatchStore.getState().attach(controller);
  controller.placeFleet(createBot('easy', controller.rules, createRng(7)).placeFleet());
  controller.ready();
  return controller;
}

describe('match store FX queue', () => {
  it('starts the battle with a coin flip and battle view', () => {
    newGame();
    const s = useMatchStore.getState();
    expect(s.view?.phase).toBe('battle');
    expect(s.coinFlip).not.toBeNull();
    expect(s.battleStartedAt).not.toBeNull();
  });

  it('locks input while a shot animates and applies the view at impact', () => {
    const c = newGame();
    const idleOnMyTurn = () => {
      const st = useMatchStore.getState();
      return st.view?.activePlayer === 0 && !st.fx && st.queue.length === 0;
    };
    for (let i = 0; i < 40 && !idleOnMyTurn(); i++) jest.advanceTimersByTime(250);
    expect(idleOnMyTurn()).toBe(true);
    const before = useMatchStore.getState().view!;
    useMatchStore.getState().fire({ x: 0, y: 0 });
    let s = useMatchStore.getState();
    expect(s.fx?.stage).toBe('flight');
    expect(s.view).toBe(before);

    // A second shot during the animation is ignored.
    const logLen = c.getState().log.length;
    useMatchStore.getState().fire({ x: 1, y: 0 });
    expect(c.getState().log.length).toBe(logLen);

    jest.advanceTimersByTime(s.fx!.flightMs);
    s = useMatchStore.getState();
    expect(s.fx?.stage).toBe('impact');
    expect(s.view!.log.length).toBe(before.log.length + 1);
  });

  it('plays a full game through to the result screen and records stats', () => {
    const c = newGame();
    const { width, height } = c.rules.grid;
    const targets: { x: number; y: number }[] = [];
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) targets.push({ x, y });

    for (let guard = 0; guard < 5000 && !useMatchStore.getState().showResult; guard++) {
      const s = useMatchStore.getState();
      const myTurn = s.view?.phase === 'battle' && s.view.activePlayer === s.view.viewer;
      if (myTurn && !s.fx && !s.awaiting && s.queue.length === 0) {
        const t = targets.shift();
        if (t) s.fire(t);
      } else {
        jest.advanceTimersByTime(250);
      }
    }

    const s = useMatchStore.getState();
    expect(s.showResult).toBe(true);
    expect(s.result).not.toBeNull();
    expect(s.result!.reason).toBe('sunk');
    expect(s.result!.summary.shots).toBeGreaterThan(0);
    expect(s.queue).toHaveLength(0);

    const stats = useStatsStore.getState();
    expect(stats.total.played).toBe(1);
    expect(stats.bot.medium.played).toBe(1);
    expect(useAchievementsStore.getState().unlocked).toHaveProperty('maiden_voyage');
  });
});
