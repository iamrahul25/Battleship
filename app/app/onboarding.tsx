import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInRight, FadeOutLeft } from 'react-native-reanimated';
import { NAME_MAX, NAME_MIN, sanitizeName } from '@shared/protocol';
import { Logo } from '@/components/art/Logo';
import { AvatarPicker } from '@/components/ui/AvatarPicker';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { Screen } from '@/components/ui/Screen';
import { ADVANCE } from '@/game/modes';
import { useProfileStore } from '@/stores/profile';
import { colors, fonts, text } from '@/theme';

const CARDS = [
  {
    icon: 'ferry' as const,
    title: 'Deploy your fleet',
    body: 'Drag your five ships onto the grid. Tap a ship to rotate it. Ships may not touch, not even diagonally.',
  },
  {
    icon: 'crosshairs-gps' as const,
    title: 'Hunt the enemy',
    body: 'Take turns firing at enemy waters. A hit earns you another shot. Sink every enemy ship to win.',
  },
  {
    icon: 'lightning-bolt' as const,
    title: 'Charge your power-ups',
    body: `In ${ADVANCE} mode, hits charge your meter. Spend it on Heavy Artillery (5-cell strike) or Sonar (counts ship cells in a 3×3 area).`,
  },
];

export default function Onboarding() {
  const profile = useProfileStore();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(profile.nickname);
  const [avatar, setAvatar] = useState(profile.avatarId);
  const clean = sanitizeName(name);

  const finish = () => {
    profile.setProfile({ nickname: clean ?? 'Sailor', avatarId: avatar, onboarded: true });
    router.replace('/home');
  };

  if (step === 0) {
    return (
      <Screen scroll>
        <View style={styles.header}>
          <Logo size={34} tagline={false} />
          <Text style={[text.body, styles.lead]}>Welcome aboard, sailor. Choose your call sign.</Text>
        </View>
        <Panel title="Call sign">
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Nickname"
            placeholderTextColor={colors.steel600}
            maxLength={NAME_MAX}
            autoCorrect={false}
            style={styles.input}
            accessibilityLabel="Nickname"
          />
          <Text style={[text.caption, { marginTop: 6, color: name && !clean ? colors.signalRed : colors.steel400 }]}>
            {NAME_MIN}–{NAME_MAX} characters
          </Text>
        </Panel>
        <Panel title="Portrait" style={{ marginTop: 14 }}>
          <AvatarPicker value={avatar} onChange={setAvatar} />
        </Panel>
        <Button title="Continue" onPress={() => setStep(1)} disabled={!clean} style={{ marginTop: 20 }} size="lg" />
      </Screen>
    );
  }

  const card = CARDS[step - 1];
  return (
    <Screen back={() => setStep(step - 1)} title="Briefing">
      <View style={styles.cardWrap}>
        <Animated.View key={step} entering={FadeInRight.duration(260)} exiting={FadeOutLeft.duration(200)} style={{ width: '100%' }}>
          <Panel accent="brass" style={styles.card}>
            <MaterialCommunityIcons name={card.icon} size={72} color={colors.brass} />
            <Text style={[text.title, styles.cardTitle]}>{card.title}</Text>
            <Text style={[text.body, styles.cardBody]}>{card.body}</Text>
          </Panel>
        </Animated.View>
        <View style={styles.dots}>
          {CARDS.map((_, i) => (
            <View key={i} style={[styles.dot, i === step - 1 && styles.dotActive]} />
          ))}
        </View>
      </View>
      <Button title={step < CARDS.length ? 'Next' : 'Set sail'} onPress={() => (step < CARDS.length ? setStep(step + 1) : finish())} size="lg" />
      <Button title="Skip" variant="ghost" onPress={finish} style={{ marginTop: 10 }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', marginVertical: 24 },
  lead: { marginTop: 12, color: colors.steel200, textAlign: 'center' },
  input: {
    fontFamily: fonts.bodyBold,
    fontSize: 20,
    color: colors.steel100,
    backgroundColor: colors.navy800,
    borderWidth: 1.5,
    borderColor: colors.steel600,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  cardWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { alignItems: 'center', paddingVertical: 36, paddingHorizontal: 24 },
  cardTitle: { marginTop: 16, textAlign: 'center' },
  cardBody: { marginTop: 12, textAlign: 'center', color: colors.steel200, lineHeight: 22 },
  dots: { flexDirection: 'row', gap: 8, marginTop: 20 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.steel600 },
  dotActive: { backgroundColor: colors.brass, width: 22 },
});
