import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, text } from '@/theme';
import { type MatchInfo, RulesGuide } from './RulesGuide';

interface Props {
  visible: boolean;
  match: MatchInfo;
  /** Shown under the title, e.g. whether the game is paused. */
  note?: string;
  onClose: () => void;
}

/** Full-screen rules reference that can be opened mid-battle. */
export function RulesSheet({ visible, match, note, onClose }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.backdrop, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }]}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.side} />
            <Text style={styles.title}>RULES & INFO</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close rules" style={styles.side} testID="rules-close">
              <Ionicons name="close" size={26} color={colors.steel100} />
            </Pressable>
          </View>
          {note ? <Text style={styles.note}>{note}</Text> : null}
          <ScrollView contentContainerStyle={styles.content}>
            <RulesGuide match={match} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, alignItems: 'center', paddingHorizontal: 12 },
  sheet: {
    flex: 1,
    width: '100%',
    maxWidth: 560,
    backgroundColor: colors.navy900,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.steel600,
    overflow: 'hidden',
  },
  header: { flexDirection: 'row', alignItems: 'center', height: 52, paddingHorizontal: 12 },
  side: { width: 44, height: 44, alignItems: 'flex-end', justifyContent: 'center' },
  title: { ...text.title, flex: 1, textAlign: 'center', fontSize: 20 },
  note: { ...text.caption, textAlign: 'center', marginBottom: 8, paddingHorizontal: 16 },
  content: { paddingHorizontal: 14, paddingBottom: 20 },
});
