import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from './AppIcon';
import { AppPressable } from './AppPressable';
import { AppText } from './AppText';

export function SheetScaffold({
  visible,
  title,
  subtitle,
  children,
  footer,
  onClose,
  dismissible = true,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  dismissible?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={dismissible ? onClose : () => undefined} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={styles.backdrop} onPress={dismissible ? onClose : undefined}>
          <Pressable style={[styles.sheet, { paddingBottom: Math.max(16, insets.bottom + 8) }]} onPress={(event) => event.stopPropagation()}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <View style={styles.titleCopy}>
                <AppText style={styles.title}>{title}</AppText>
                {subtitle ? <AppText style={styles.subtitle}>{subtitle}</AppText> : null}
              </View>
              {dismissible ? (
                <AppPressable style={styles.close} onPress={onClose} accessibilityLabel="关闭">
                  <AppIcon name="close" size={20} color="#6B7280" />
                </AppPressable>
              ) : null}
            </View>
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(17,24,39,0.32)' },
  sheet: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    maxHeight: '88%',
    paddingTop: 8,
    paddingHorizontal: 16,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    backgroundColor: '#FFFFFF',
  },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB' },
  header: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12 },
  titleCopy: { flex: 1, minWidth: 0 },
  title: { color: '#111827', fontSize: 19, lineHeight: 25, fontWeight: '800' },
  subtitle: { marginTop: 2, color: '#6B7280', fontSize: 12, lineHeight: 17 },
  close: { width: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: '#F3F4F6' },
  scroll: { flexShrink: 1 },
  content: { gap: 14, paddingTop: 4, paddingBottom: 12 },
  footer: { paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(17,24,39,0.06)' },
});
