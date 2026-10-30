import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { playSound } from '@/audio/SoundManager';
import { colors, fonts } from '@/theme';

/** Compact notice that slides in from the right edge, holds briefly, then slides back out and unmounts. */
export function SideNotice({ text, color, hold = 1100 }: { text: string; color: string; hold?: number }) {
  const [done, setDone] = useState(false);
  const x = useSharedValue(1);
  useEffect(() => {
    x.value = withSequence(
      withTiming(0, { duration: 180, easing: Easing.out(Easing.cubic) }),
      withDelay(
        hold,
        withTiming(1, { duration: 200, easing: Easing.in(Easing.cubic) }, (finished) => {
          if (finished) scheduleOnRN(setDone, true);
        }),
      ),
    );
  }, [x, hold]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value * 220 }], opacity: 1 - x.value }));
  if (done) return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.notice, { borderLeftColor: color }, style]}>
      <Text style={[styles.noticeText, { color }]}>{text}</Text>
    </Animated.View>
  );
}

/** "YOUR TURN" / "ENEMY TURN" side notice; `name` labels another player's turn in 3+ player games. */
export function TurnBanner({ mine, name }: { mine: boolean; name?: string }) {
  const label = mine ? 'YOUR TURN' : name ? `${name.toUpperCase()}'S TURN` : 'ENEMY TURN';
  return <SideNotice text={label} color={mine ? colors.radarGreen : colors.signalRed} hold={900} />;
}

/** Rubber-stamp text ("VICTORY", "DEFEAT"). */
export function Stamp({ stampKey, text, color = colors.signalRed, hold = 900, size = 40 }: { stampKey: number; text: string; color?: string; hold?: number; size?: number }) {
  const s = useSharedValue(0);
  useEffect(() => {
    s.value = 0;
    s.value = withSequence(withSpring(1, { damping: 9, stiffness: 220 }), withDelay(hold, withTiming(2, { duration: 250 })));
  }, [stampKey, s, hold]);
  const style = useAnimatedStyle(() => ({
    opacity: s.value <= 1 ? Math.min(1, s.value * 1.5) : 2 - s.value,
    transform: [{ scale: s.value <= 1 ? 2.2 - s.value * 1.2 : 1 }, { rotate: '-8deg' }],
  }));
  return (
    <View pointerEvents="none" style={styles.center}>
      <Animated.View style={[styles.stamp, { borderColor: color }, style]}>
        <Text style={[styles.stampText, { color, fontSize: size }]}>{text}</Text>
      </Animated.View>
    </View>
  );
}

/** Anchor coin flip announcing who fires first. */
export function CoinFlip({ meFirst, opponentName, onDone }: { meFirst: boolean; opponentName: string; onDone: () => void }) {
  const spin = useSharedValue(0);
  const fade = useSharedValue(1);
  useEffect(() => {
    playSound('click');
    spin.value = withTiming(6 + (meFirst ? 0 : 0.5), { duration: 1300, easing: Easing.out(Easing.cubic) }, () => {
      fade.value = withDelay(800, withTiming(0, { duration: 250 }, (done) => {
        if (done) scheduleOnRN(onDone);
      }));
    });
  }, [spin, fade, meFirst, onDone]);
  const coin = useAnimatedStyle(() => ({ transform: [{ perspective: 600 }, { rotateY: `${spin.value * 360}deg` }] }));
  const wrap = useAnimatedStyle(() => ({ opacity: fade.value }));
  const label = useAnimatedStyle(() => ({ opacity: spin.value >= 5.9 ? 1 : 0 }));
  return (
    <Animated.View style={[styles.overlay, wrap]} pointerEvents="none">
      <Animated.View style={[styles.coin, coin]}>
        <Text style={styles.coinGlyph}>⚓</Text>
      </Animated.View>
      <Animated.Text style={[styles.flipText, label]}>{meFirst ? 'YOU FIRE FIRST' : `${opponentName.toUpperCase()} FIRES FIRST`}</Animated.Text>
    </Animated.View>
  );
}

const EMOTE_TEXT: Record<string, string> = {
  salute: '🫡 Salute!',
  gg: '🤝 Good game',
  boom: '💥 Boom!',
  oops: '😬 Oops',
  nice: '👍 Nice shot',
  taunt: '😏 Missed me!',
};
export const emoteLabel = (id: string) => EMOTE_TEXT[id] ?? id;

export function EmoteBubble({ emoteKey, id, fromMe }: { emoteKey: number; id: string; fromMe: boolean }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = 0;
    t.value = withSequence(withSpring(1, { damping: 12 }), withDelay(1600, withTiming(0, { duration: 250 })));
  }, [emoteKey, t]);
  const style = useAnimatedStyle(() => ({ opacity: t.value, transform: [{ scale: 0.6 + t.value * 0.4 }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.emote, fromMe ? { bottom: 8, right: 8 } : { top: 8, right: 8 }, style]}>
      <Text style={styles.emoteText}>{emoteLabel(id)}</Text>
    </Animated.View>
  );
}

const fill = { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 } as const;

const styles = StyleSheet.create({
  center: { ...fill, alignItems: 'center', justifyContent: 'center', zIndex: 50 },
  notice: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(6,14,26,0.92)',
    borderLeftWidth: 3,
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 6,
  },
  noticeText: { fontFamily: fonts.heading, fontSize: 15, letterSpacing: 2 },
  stamp: { borderWidth: 4, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 4, backgroundColor: 'rgba(6,14,26,0.55)' },
  stampText: { fontFamily: fonts.heading, letterSpacing: 3 },
  overlay: { ...fill, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', zIndex: 80, gap: 24 },
  coin: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.brass,
    borderWidth: 6,
    borderColor: colors.brassDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinGlyph: { fontSize: 64, color: colors.navy900 },
  flipText: { fontFamily: fonts.heading, fontSize: 24, color: colors.steel100, letterSpacing: 2, textAlign: 'center' },
  emote: {
    position: 'absolute',
    zIndex: 60,
    backgroundColor: 'rgba(10,22,40,0.95)',
    borderWidth: 1.5,
    borderColor: colors.brass,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  emoteText: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.steel100 },
});
