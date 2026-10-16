import { Modal, StyleSheet, Text, View } from 'react-native';
import { colors, text } from '@/theme';
import { Button } from './Button';
import { Panel } from './Panel';

interface Props {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** Extra actions rendered above confirm/cancel (e.g. pause menu). */
  children?: React.ReactNode;
}

export function ConfirmDialog({ visible, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', destructive, onConfirm, onCancel, children }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Panel style={styles.panel} accent={destructive ? 'red' : 'brass'}>
          <Text style={[text.title, styles.title]}>{title}</Text>
          {message ? <Text style={[text.body, styles.message]}>{message}</Text> : null}
          <View style={styles.actions}>
            {children}
            <Button title={confirmLabel} variant={destructive ? 'primary' : 'brass'} onPress={onConfirm} />
            <Button title={cancelLabel} variant="ghost" onPress={onCancel} />
          </View>
        </Panel>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: 24 },
  panel: { width: '100%', maxWidth: 420, padding: 24 },
  title: { textAlign: 'center', fontSize: 22 },
  message: { textAlign: 'center', marginTop: 10, color: colors.steel200 },
  actions: { marginTop: 22, gap: 10 },
});
