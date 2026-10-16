import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radii, text } from '@/theme';

interface Props {
  children: ReactNode;
  title?: string;
  style?: StyleProp<ViewStyle>;
  accent?: 'steel' | 'brass' | 'red' | 'green';
}

const ACCENT = { steel: colors.steel600, brass: colors.brassDark, red: colors.signalRedDark, green: '#1F7A55' };

export function Panel({ children, title, style, accent = 'steel' }: Props) {
  return (
    <View style={[styles.panel, { borderColor: ACCENT[accent] }, style]}>
      {title ? <Text style={styles.title}>{title.toUpperCase()}</Text> : null}
      {children}
      <View style={[styles.rivet, { left: 6, top: 6 }]} />
      <View style={[styles.rivet, { right: 6, top: 6 }]} />
      <View style={[styles.rivet, { left: 6, bottom: 6 }]} />
      <View style={[styles.rivet, { right: 6, bottom: 6 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.panel,
    borderWidth: 1.5,
    borderRadius: radii.lg,
    padding: 16,
  },
  title: { ...text.label, marginBottom: 10 },
  rivet: { position: 'absolute', width: 5, height: 5, borderRadius: 3, backgroundColor: colors.steel600 },
});
