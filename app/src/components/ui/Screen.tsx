import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { playSound } from '@/audio/SoundManager';
import { colors, text } from '@/theme';

interface Props {
  children: ReactNode;
  title?: string;
  /** Show a back arrow; custom handler or router.back(). */
  back?: boolean | (() => void);
  right?: ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  /** Max content width so web layouts stay phone-shaped. */
  maxWidth?: number;
}

export function Screen({ children, title, back, right, scroll, contentStyle, maxWidth = 560 }: Props) {
  const insets = useSafeAreaInsets();
  const onBack = () => {
    playSound('click');
    if (typeof back === 'function') back();
    else if (router.canGoBack()) router.back();
    else router.replace('/home');
  };
  const header =
    title || back ? (
      <View style={styles.header}>
        {back ? (
          <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back" style={styles.back}>
            <Ionicons name="chevron-back" size={26} color={colors.steel100} />
          </Pressable>
        ) : (
          <View style={styles.back} />
        )}
        <Text style={styles.title} numberOfLines={1}>
          {title?.toUpperCase()}
        </Text>
        <View style={styles.right}>{right}</View>
      </View>
    ) : null;

  const inner = (
    <View style={[styles.content, { maxWidth }, contentStyle]}>
      {header}
      {children}
    </View>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {inner}
        </ScrollView>
      ) : (
        inner
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.navy900 },
  scroll: { flexGrow: 1, alignItems: 'center' },
  content: { flex: 1, width: '100%', alignSelf: 'center', paddingHorizontal: 16, paddingBottom: 16 },
  header: { flexDirection: 'row', alignItems: 'center', height: 56 },
  back: { width: 44, height: 44, alignItems: 'flex-start', justifyContent: 'center' },
  title: { ...text.title, flex: 1, textAlign: 'center', fontSize: 22 },
  right: { minWidth: 44, alignItems: 'flex-end' },
});
