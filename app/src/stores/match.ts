import { create } from 'zustand';
import {
  canUseWeapon,
  type Coord,
  type FinishReason,
  getWeapon,
  type Orientation,
  type PlacedShip,
  type PublicView,
  type ShotEvent,
  totalShips,
} from '@shared/engine';
import type { EmoteId } from '@shared/protocol';
import { playSound, SoundManager } from '@/audio/SoundManager';
import type { ControllerEvent, ControllerMeta, GameController } from '@/game/controllers/types';
import { LocalGameController } from '@/game/controllers/LocalGameController';
import { earnedAchievements, type MatchSummary, medalFor, type MedalTier, achievementById } from '@/game/progression';
import { clearSavedGame, saveGame } from '@/game/savedGame';
import { haptic } from '@/platform/haptics';
import { useAchievementsStore } from './achievements';
import { useSettingsStore } from './settings';
import { useStatsStore } from './stats';
import { useUiStore } from './ui';

export type FxItem =
  | { kind: 'view'; view: PublicView }
  | { kind: 'shot'; event: ShotEvent; view: PublicView }
  | { kind: 'gameOver'; youWon: boolean; reason: FinishReason; view: PublicView; revealFleet: PlacedShip[] };

export interface ActiveFx {
  id: number;
  event: ShotEvent;
  /** True when the local player fired (animation plays on the enemy board). */
  mine: boolean;
  stage: 'flight' | 'impact';
  flightMs: number;
  impactMs: number;
}

export interface MatchResult {
  youWon: boolean;
  reason: FinishReason;
  summary: MatchSummary;
  revealFleet: PlacedShip[];
  view: PublicView;
  medal: MedalTier | null;
  newBadges: string[];
}

interface MatchState {
  controller: GameController | null;
  view: PublicView | null;
  meta: ControllerMeta | null;
  queue: FxItem[];
  fx: ActiveFx | null;
  /** A shot was sent and we're waiting for the result (prevents double-firing). */
  awaiting: boolean;
  selectedWeapon: string;
  battleStartedAt: number | null;
  result: MatchResult | null;
  /** Flips true a beat after game over so the final explosion is visible before navigating. */
  showResult: boolean;
  shake: { key: number; intensity: number };
  banner: { key: number; mine: boolean } | null;
  stamp: { key: number; text: string } | null;
  coinFlip: { key: number; meFirst: boolean } | null;
  emote: { key: number; id: EmoteId; fromMe: boolean } | null;
  closedReason: string | null;

  attach: (controller: GameController) => void;
  detach: () => void;
  selectWeapon: (id: string) => void;
  fire: (target: Coord, orientation?: Orientation) => void;
  dismissCoinFlip: () => void;
}

const initial = {
  controller: null,
  view: null,
  meta: null,
  queue: [],
  fx: null,
  awaiting: false,
  selectedWeapon: 'standard',
  battleStartedAt: null,
  result: null,
  showResult: false,
  shake: { key: 0, intensity: 0 },
  banner: null,
  stamp: null,
  coinFlip: null,
  emote: null,
  closedReason: null,
};

let unsubscribe: (() => void) | null = null;
let fxTimers: ReturnType<typeof setTimeout>[] = [];
let fxId = 1;
let keySeq = 1;

export const useMatchStore = create<MatchState>()((set, get) => {
  const later = (ms: number, fn: () => void) => {
    const t = setTimeout(fn, ms);
    fxTimers.push(t);
  };

  function applyView(view: PublicView) {
    const prev = get().view;
    const patch: Partial<MatchState> = { view };

    if (view.phase === 'battle' && prev?.phase !== 'battle') {
      patch.battleStartedAt = Date.now();
      patch.coinFlip = { key: keySeq++, meFirst: view.activePlayer === view.viewer };
      SoundManager.playMusic('battle');
    }
    if (view.phase === 'placement' && prev && prev.phase !== 'placement') {
      // Rematch started.
      Object.assign(patch, { result: null, showResult: false, battleStartedAt: null, selectedWeapon: 'standard', fx: null });
    }
    if (view.phase === 'battle' && prev?.phase === 'battle' && prev.activePlayer !== view.activePlayer) {
      const mine = view.activePlayer === view.viewer;
      patch.banner = { key: keySeq++, mine };
      if (mine) {
        playSound('turn');
        haptic('light');
      }
    }
    if (view.phase === 'battle') {
      SoundManager.setIntensity(view.me.shipsRemaining <= 1 || view.enemy.shipsRemaining <= 1);
      const weapon = getWeapon(get().selectedWeapon);
      if (weapon && !canUseWeapon(view.me, weapon, view.rules)) patch.selectedWeapon = 'standard';
    }
    set(patch);
  }

  function pump() {
    const s = get();
    if (s.fx || s.queue.length === 0) return;
    const [item, ...rest] = s.queue;
    set({ queue: rest });
    if (item.kind === 'view') {
      applyView(item.view);
      pump();
    } else if (item.kind === 'shot') runShot(item.event, item.view);
    else runGameOver(item);
  }

  function runShot(event: ShotEvent, view: PublicView) {
    const reduced = useSettingsStore.getState().reducedMotion;
    const mine = event.by === view.viewer;
    const isSonar = event.weaponId === 'sonar';
    const isArtillery = event.weaponId === 'artillery';
    const sunk = event.results.some((r) => r.result === 'sunk');
    const hit = sunk || event.results.some((r) => r.result === 'hit');
    const flightMs = isSonar ? 0 : reduced ? 220 : isArtillery ? 650 : 450;
    const impactMs = isSonar ? 1000 : sunk ? 1250 : isArtillery ? 1000 : hit ? 650 : 520;
    const id = fxId++;

    set({ fx: { id, event, mine, stage: flightMs ? 'flight' : 'impact', flightMs, impactMs }, awaiting: false });

    if (isSonar) playSound('sonar');
    else if (isArtillery) playSound('artillery');
    else playSound('fire');

    const impact = () => {
      applyView(view);
      set((st) => (st.fx?.id === id ? { fx: { ...st.fx, stage: 'impact' } } : {}));
      if (!isSonar) {
        if (sunk) playSound('sunk');
        else if (hit) playSound('hit');
        else playSound('miss');
        haptic(sunk || isArtillery ? 'heavy' : hit ? 'medium' : 'light');
        if (!reduced && (hit || isArtillery)) {
          set((st) => ({ shake: { key: st.shake.key + 1, intensity: sunk ? 10 : isArtillery ? 9 : 4 } }));
        }
        if (sunk) set({ stamp: { key: keySeq++, text: mine ? 'SHIP SUNK!' : 'SHIP LOST!' } });
        if (mine && hit) unlockBadges(['first_blood']);
      }
      const controller = get().controller;
      if (controller instanceof LocalGameController && view.phase === 'battle') {
        const saved = controller.serialize();
        if (saved) void saveGame(saved);
      }
      later(impactMs, () => {
        set((st) => (st.fx?.id === id ? { fx: null } : {}));
        pump();
      });
    };
    if (flightMs) later(flightMs, impact);
    else impact();
  }

  function unlockBadges(ids: string[]) {
    const fresh = useAchievementsStore.getState().unlock(ids);
    for (const badgeId of fresh) {
      const def = achievementById(badgeId);
      if (!def) continue;
      useUiStore.getState().showToast({ kind: 'badge', title: 'Medal unlocked', message: def.name, badgeId });
      playSound('badge');
    }
    return fresh;
  }

  function runGameOver(item: Extract<FxItem, { kind: 'gameOver' }>) {
    applyView(item.view);
    const s = get();
    const controller = s.controller;
    const view = item.view;
    const sunkWithArtillery = view.log.some(
      (e) => e.by === view.viewer && e.weaponId === 'artillery' && e.results.some((r) => r.result === 'sunk'),
    );
    const summary: MatchSummary = {
      kind: controller?.kind ?? 'bot',
      difficulty: controller?.difficulty,
      mode: controller?.mode ?? 'arsenal',
      won: item.youWon,
      reason: item.reason,
      shots: view.me.shotsFired,
      hits: view.me.hits,
      shipsSunk: view.enemy.shipsLost.length,
      shipsLost: view.me.shipsLost.length,
      shipsTotal: totalShips(view.rules),
      powerUpsUsed: view.me.powerUpsUsed,
      sunkWithArtillery,
      durationMs: s.battleStartedAt ? Date.now() - s.battleStartedAt : 0,
      opponentName: s.meta?.opponent?.name ?? 'Opponent',
    };
    const stats = useStatsStore.getState().record(summary);
    const newBadges = unlockBadges(earnedAchievements(summary, stats));
    if (controller?.kind === 'bot') void clearSavedGame();
    SoundManager.setIntensity(false);
    set({
      result: {
        youWon: item.youWon,
        reason: item.reason,
        summary,
        revealFleet: item.revealFleet,
        view,
        medal: item.youWon || summary.shots > 0 ? medalFor(summary.shots, summary.hits) : null,
        newBadges,
      },
      awaiting: false,
    });
    later(item.reason === 'sunk' ? 1400 : 300, () => set({ showResult: true }));
  }

  function onEvent(e: ControllerEvent) {
    switch (e.type) {
      case 'view':
        set((st) => ({ queue: [...st.queue, { kind: 'view', view: e.view }], awaiting: false }));
        return pump();
      case 'shot':
        set((st) => ({ queue: [...st.queue, { kind: 'shot', event: e.event, view: e.view }] }));
        return pump();
      case 'gameOver':
        set((st) => ({ queue: [...st.queue, { kind: 'gameOver', ...e }] }));
        return pump();
      case 'meta':
        return set({ meta: e.meta });
      case 'error':
        set({ awaiting: false });
        playSound('invalid');
        useUiStore.getState().showToast({ kind: 'error', title: e.message });
        return;
      case 'emote':
        return set({ emote: { key: keySeq++, id: e.id, fromMe: e.fromMe } });
      case 'closed':
        return set({ closedReason: e.reason });
    }
  }

  return {
    ...initial,
    attach: (controller) => {
      get().detach();
      unsubscribe = controller.subscribe(onEvent);
      const view = controller.getView();
      set({ ...initial, controller, meta: controller.getMeta(), view });
      if (view?.phase === 'battle') {
        set({ battleStartedAt: Date.now() });
        SoundManager.playMusic('battle');
      }
    },
    detach: () => {
      unsubscribe?.();
      unsubscribe = null;
      fxTimers.forEach(clearTimeout);
      fxTimers = [];
      get().controller?.dispose();
      set({ ...initial });
    },
    selectWeapon: (id) => set({ selectedWeapon: id }),
    fire: (target, orientation) => {
      const s = get();
      const view = s.view;
      if (!s.controller || !view || s.awaiting || s.fx || s.queue.length) return;
      if (view.phase !== 'battle' || view.activePlayer !== view.viewer) return;
      set({ awaiting: true });
      if (s.selectedWeapon === 'standard') s.controller.fire(target);
      else {
        s.controller.useWeapon(s.selectedWeapon, target, orientation);
        set({ selectedWeapon: 'standard' });
      }
      // Safety valve so a lost message can never lock the board forever.
      later(5000, () => set({ awaiting: false }));
    },
    dismissCoinFlip: () => set({ coinFlip: null }),
  };
});
