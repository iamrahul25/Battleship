import { create } from 'zustand';
import {
  canUseWeapon,
  type Coord,
  type FinishReason,
  getWeapon,
  isMultiplayerView,
  other,
  type PlacedShip,
  type PublicView,
  type ShotEvent,
  totalShips,
  viewEnemies,
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
  | { kind: 'gameOver'; youWon: boolean; reason: FinishReason; view: PublicView; revealFleet: PlacedShip[]; rank?: number };

export interface ActiveFx {
  id: number;
  event: ShotEvent;
  /** True when the local player fired (animation plays on the enemy board). */
  mine: boolean;
  /** Seat whose board the animation plays on. */
  against: number;
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
  /** Final place in 3+ player games. */
  rank: number | null;
}

/** Name of a seat for stamps and banners. */
function seatName(get: () => MatchState, seat: number): string {
  return get().meta?.seats.find((s) => s.seat === seat)?.name ?? `Player ${seat + 1}`;
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
  /** `name` is set in 3+ player games for other players' turns. */
  banner: { key: number; mine: boolean; name?: string } | null;
  stamp: { key: number; text: string } | null;
  coinFlip: { key: number; meFirst: boolean; firstName?: string } | null;
  emote: { key: number; id: EmoteId; fromMe: boolean } | null;
  closedReason: string | null;
  /** Enemy seat the local player is aiming at in 3+ player games. */
  targetPlayer: number | null;

  attach: (controller: GameController) => void;
  detach: () => void;
  /** Leave a 3+ player battle after being knocked out, recording the loss. */
  leaveAsSpectator: () => void;
  selectWeapon: (id: string) => void;
  selectTarget: (seat: number) => void;
  fire: (target: Coord, targetPlayer?: number) => void;
  dismissCoinFlip: () => void;
}

/** Keeps the aimed-at seat valid: falls back to the next enemy still afloat. */
function validTarget(view: PublicView, current: number | null): number | null {
  if (!isMultiplayerView(view)) return null;
  const enemies = viewEnemies(view);
  if (current !== null && enemies.some((e) => e.player === current)) return current;
  return enemies[0]?.player ?? null;
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
  targetPlayer: null,
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

    const multi = isMultiplayerView(view);
    if (view.phase === 'battle' && prev?.phase !== 'battle') {
      patch.battleStartedAt = Date.now();
      patch.coinFlip = { key: keySeq++, meFirst: view.activePlayer === view.viewer, firstName: multi ? seatName(get, view.activePlayer) : undefined };
      SoundManager.playMusic('battle');
    }
    if (view.phase === 'placement' && prev && prev.phase !== 'placement') {
      // Rematch started.
      Object.assign(patch, { result: null, showResult: false, battleStartedAt: null, selectedWeapon: 'standard', fx: null, targetPlayer: null });
    }
    if (view.phase === 'battle' && prev?.phase === 'battle' && prev.activePlayer !== view.activePlayer) {
      const mine = view.activePlayer === view.viewer;
      patch.banner = { key: keySeq++, mine, name: multi && !mine ? seatName(get, view.activePlayer) : undefined };
      if (mine) {
        playSound('turn');
        haptic('light');
      }
    }
    if (multi && prev?.phase === 'battle' && prev.players.length === view.players.length) {
      const knockedOut = view.players.filter((s) => s.out && !prev.players[s.player]?.out);
      if (knockedOut.length) {
        const text = knockedOut.some((s) => s.player === view.viewer)
          ? "YOU'RE OUT!"
          : `${seatName(get, knockedOut[0].player).toUpperCase()} IS OUT!`;
        patch.stamp = { key: keySeq++, text };
      }
    }
    if (view.phase === 'battle') {
      const enemyLow = multi ? viewEnemies(view).every((e) => e.info.shipsRemaining <= 1) : view.enemy.shipsRemaining <= 1;
      SoundManager.setIntensity(view.me.shipsRemaining <= 1 || enemyLow);
      const weapon = getWeapon(get().selectedWeapon);
      if (weapon && !canUseWeapon(view.me, weapon, view.rules)) patch.selectedWeapon = 'standard';
      patch.targetPlayer = validTarget(view, get().targetPlayer);
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
    const isTorpedo = event.weaponId === 'torpedo';
    // Multi-cell volleys: heavier sound, shake and staggered impacts.
    const isArtillery = event.weaponId === 'artillery' || event.weaponId === 'airstrike' || event.weaponId === 'barrage';
    const sunk = event.results.some((r) => r.result === 'sunk');
    const hit = sunk || event.results.some((r) => r.result === 'hit');
    const torpedoMs = Math.min(1100, Math.max(400, (event.path?.length ?? 1) * 90));
    const flightMs = isSonar ? 0 : reduced ? 220 : isTorpedo ? torpedoMs : event.weaponId === 'airstrike' ? 750 : isArtillery ? 650 : 450;
    const impactMs = isSonar ? 1000 : sunk ? 1250 : isArtillery ? 1000 : hit ? 650 : isTorpedo && !event.results.length ? 300 : 520;
    const id = fxId++;
    const against = event.against ?? other(event.by);
    const multi = isMultiplayerView(view);

    set({ fx: { id, event, mine, against, stage: flightMs ? 'flight' : 'impact', flightMs, impactMs }, awaiting: false });

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
        if (sunk) {
          const text = mine ? 'SHIP SUNK!' : against === view.viewer ? 'SHIP LOST!' : `${seatName(get, against).toUpperCase()} LOST A SHIP`;
          set({ stamp: { key: keySeq++, text } });
        }
        if (mine && hit) unlockBadges(['first_blood']);
        if (event.mineTriggered) {
          playSound('artillery');
          haptic('heavy');
          if (!reduced) set((st) => ({ shake: { key: st.shake.key + 1, intensity: 8 } }));
          const who = multi ? `${seatName(get, event.by).toUpperCase()} HIT A MINE` : 'ENEMY HIT A MINE';
          if (!sunk) set({ stamp: { key: keySeq++, text: mine ? 'MINE! TURN LOST' : who } });
        }
      }
      if (event.turnSkipped !== undefined) {
        // The mine penalty kept the turn with the shooter, so the usual turn-change banner never fires.
        const meNext = view.activePlayer === view.viewer;
        set({ banner: { key: keySeq++, mine: meNext, name: multi && !meNext ? seatName(get, view.activePlayer) : undefined } });
        if (view.activePlayer === view.viewer) playSound('turn');
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

  function buildSummary(view: PublicView, won: boolean, reason: FinishReason): MatchSummary {
    const s = get();
    const controller = s.controller;
    const sunkWithArtillery = view.log.some(
      (e) => e.by === view.viewer && e.weaponId === 'artillery' && e.results.some((r) => r.result === 'sunk'),
    );
    return {
      kind: controller?.kind ?? 'bot',
      difficulty: controller?.difficulty,
      mode: controller?.mode ?? 'advance',
      won,
      reason,
      shots: view.me.shotsFired,
      hits: view.me.hits,
      shipsSunk: view.me.shipsSunk ?? view.enemy.shipsLost.length,
      shipsLost: view.me.shipsLost.length,
      shipsTotal: totalShips(view.rules),
      powerUpsUsed: view.me.powerUpsUsed,
      sunkWithArtillery,
      durationMs: s.battleStartedAt ? Date.now() - s.battleStartedAt : 0,
      opponentName: isMultiplayerView(view) ? `${view.players.length}-player battle` : (s.meta?.opponent?.name ?? 'Opponent'),
    };
  }

  function runGameOver(item: Extract<FxItem, { kind: 'gameOver' }>) {
    applyView(item.view);
    const controller = get().controller;
    const view = item.view;
    const summary = buildSummary(view, item.youWon, item.reason);
    const rank = isMultiplayerView(view) ? (item.rank ?? view.standings?.find((x) => x.player === view.viewer)?.rank ?? null) : null;
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
        rank,
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
    leaveAsSpectator: () => {
      const view = get().view;
      const out = view?.players[view.viewer]?.out;
      if (view && out && view.phase !== 'finished' && !get().result) {
        useStatsStore.getState().record(buildSummary(view, false, out));
      }
      get().detach();
    },
    selectWeapon: (id) => set({ selectedWeapon: id }),
    selectTarget: (seat) => {
      const view = get().view;
      if (!view || validTarget(view, seat) !== seat) return;
      set({ targetPlayer: seat });
    },
    fire: (target, targetPlayer) => {
      const s = get();
      const view = s.view;
      if (!s.controller || !view || s.awaiting || s.fx || s.queue.length) return;
      if (view.phase !== 'battle' || view.activePlayer !== view.viewer) return;
      const seat = isMultiplayerView(view) ? (targetPlayer ?? s.targetPlayer ?? undefined) : undefined;
      set({ awaiting: true, ...(seat !== undefined ? { targetPlayer: seat } : {}) });
      if (s.selectedWeapon === 'standard') s.controller.fire(target, seat);
      else {
        s.controller.useWeapon(s.selectedWeapon, target, seat);
        set({ selectedWeapon: 'standard' });
      }
      // Safety valve so a lost message can never lock the board forever.
      later(5000, () => set({ awaiting: false }));
    },
    dismissCoinFlip: () => set({ coinFlip: null }),
  };
});