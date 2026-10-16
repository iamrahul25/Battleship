import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AVATARS } from '@/art/avatars';
import { playSound } from '@/audio/SoundManager';
import { haptic } from '@/platform/haptics';
import { colors, fonts } from '@/theme';
import { Avatar } from './Avatar';

export function AvatarPicker({ value, onChange, size = 58 }: { value: string; onChange: (id: string) => void; size?: number }) {
  return (
    <View style={styles.grid}>
      {AVATARS.map((a) => {
        const active = a.id === value;
        return (
          <Pressable
            key={a.id}
            accessibilityRole="button"
            accessibilityLabel={a.name}
            accessibilityState={{ selected: active }}
            onPress={() => {
              playSound('click');
              haptic('selection');
              onChange(a.id);
            }}
            style={[styles.item, active && styles.active]}
          >
            <Avatar id={a.id} size={size} />
            <Text style={[styles.name, active && { color: colors.brass }]}>{a.name}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 },
  item: { alignItems: 'center', padding: 6, borderRadius: 12, borderWidth: 2, borderColor: 'transparent', width: 78 },
  active: { borderColor: colors.brass, backgroundColor: 'rgba(212,169,58,0.12)' },
  name: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.steel400, marginTop: 4 },
});
