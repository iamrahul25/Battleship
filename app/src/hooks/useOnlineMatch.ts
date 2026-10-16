import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { playSound } from '@/audio/SoundManager';
import { OnlineError, OnlineGameController, type OnlineJoin } from '@/game/controllers/OnlineGameController';
import { haptic } from '@/platform/haptics';
import { useMatchStore } from '@/stores/match';
import { toast } from '@/stores/ui';
import { currentProfilePayload } from './useServerStatus';

/**
 * Connects to a room on mount and moves to fleet placement once an opponent joins.
 * Leaving the screen before the match starts leaves the room.
 */
export function useOnlineMatch(join: OnlineJoin | null) {
  const [error, setError] = useState<OnlineError | null>(null);
  const [connecting, setConnecting] = useState(true);
  const started = useRef(false);
  const phase = useMatchStore((s) => s.meta?.phase);
  const controller = useMatchStore((s) => s.controller);
  const joinKey = join ? JSON.stringify(join) : '';

  useEffect(() => {
    if (!join) return;
    let cancelled = false;
    started.current = false;
    OnlineGameController.connect(join, currentProfilePayload())
      .then((c) => {
        if (cancelled) return c.dispose();
        useMatchStore.getState().attach(c);
        setConnecting(false);
      })
      .catch((err: OnlineError) => {
        if (cancelled) return;
        setConnecting(false);
        setError(err);
        toast(err.code === 'PROTOCOL_MISMATCH' ? 'Update required' : 'Could not join', err.message, 'error');
      });
    return () => {
      cancelled = true;
      if (!started.current) useMatchStore.getState().detach();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinKey]);

  useEffect(() => {
    if (controller?.kind === 'online' && phase === 'placement' && !started.current) {
      started.current = true;
      playSound('found');
      haptic('success');
      router.replace('/placement');
    }
  }, [controller, phase]);

  return { error, connecting, controller };
}
