import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { checkServer } from '@/game/controllers/OnlineGameController';
import { useProfileStore } from '@/stores/profile';
import { useStatsStore } from '@/stores/stats';
import { useUiStore } from '@/stores/ui';

/** Polls the server health endpoint while the screen is focused. */
export function useServerStatus(intervalMs = 5000) {
  const online = useUiStore((s) => s.serverOnline);
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      const run = () =>
        checkServer().then((ok) => {
          if (alive) useUiStore.getState().setServerOnline(ok);
        });
      run();
      const id = setInterval(run, intervalMs);
      return () => {
        alive = false;
        clearInterval(id);
      };
    }, [intervalMs]),
  );
  return online;
}

export function currentProfilePayload() {
  const p = useProfileStore.getState();
  const s = useStatsStore.getState();
  return { playerId: p.playerId, name: p.nickname || 'Sailor', avatarId: p.avatarId, wins: s.online.won, losses: s.online.lost };
}
