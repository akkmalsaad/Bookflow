import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { type AppPalette, getThemePalette, useTheme } from '@/context/theme-context';

type IconName = ComponentProps<typeof Ionicons>['name'];

export function AuthScreen({
  children,
  eyebrow,
  subtitle,
  title,
}: {
  children: ReactNode;
  eyebrow: string;
  subtitle: string;
  title: string;
}) {
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoider}>
        <ScrollView
          bounces={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            <View style={styles.brandRow}>
              <View
                style={[
                  styles.logoWrap,
                  {
                    backgroundColor: palette.surface,
                    borderColor: palette.border,
                    shadowColor: isDarkMode ? '#020617' : '#94A3B8',
                  },
                ]}>
                <Image source={require('@/assets/images/bookflow-logo.png')} style={styles.logo} resizeMode="contain" />
              </View>
              <Text style={[styles.wordmark, { color: palette.text }]}>Bookflow</Text>
            </View>

            <View style={styles.heading}>
              <Text style={[styles.eyebrow, { color: palette.accent }]}>{eyebrow}</Text>
              <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
              <Text style={[styles.subtitle, { color: palette.muter }]}>{subtitle}</Text>
            </View>

            <View
              style={[
                styles.card,
                {
                  backgroundColor: palette.surface,
                  borderColor: isDarkMode ? palette.border : 'rgba(255,255,255,0.96)',
                  shadowColor: isDarkMode ? '#020617' : '#A7B4C8',
                },
              ]}>
              {children}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function AuthField({
  icon,
  label,
  secureTextEntry,
  ...inputProps
}: TextInputProps & { icon: IconName; label: string }) {
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const [isHidden, setIsHidden] = useState(Boolean(secureTextEntry));

  return (
    <View style={styles.fieldGroup}>
      <Text style={[styles.fieldLabel, { color: palette.muter }]}>{label}</Text>
      <View
        style={[
          styles.inputWrap,
          { backgroundColor: isDarkMode ? palette.surfaceAlt : '#F7F9FD', borderColor: palette.border },
        ]}>
        <Ionicons name={icon} size={19} color={palette.muter} />
        <TextInput
          {...inputProps}
          placeholderTextColor={isDarkMode ? '#64748B' : '#9CA3AF'}
          secureTextEntry={secureTextEntry ? isHidden : false}
          selectionColor={palette.accent}
          style={[styles.input, { color: palette.text }]}
        />
        {secureTextEntry ? (
          <Pressable
            accessibilityLabel={isHidden ? 'Show password' : 'Hide password'}
            hitSlop={10}
            onPress={() => setIsHidden((current) => !current)}>
            <Ionicons name={isHidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={palette.muter} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function PrimaryAuthButton({
  disabled,
  label,
  loadingLabel,
  onPress,
  pending,
}: {
  disabled?: boolean;
  label: string;
  loadingLabel?: string;
  onPress: () => void;
  pending?: boolean;
}) {
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || pending}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        {
          backgroundColor: palette.accent,
          opacity: disabled || pending ? 0.55 : pressed ? 0.88 : 1,
          shadowColor: palette.accent,
        },
      ]}>
      <Text style={styles.primaryButtonText}>{pending ? loadingLabel ?? 'Please wait…' : label}</Text>
      {!pending ? <Ionicons name="arrow-forward" size={18} color="#FFFFFF" /> : null}
    </Pressable>
  );
}

export function SocialButtons({ onPress }: { onPress: (provider: 'apple' | 'google') => void }) {
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);

  return (
    <View style={styles.socialRow}>
      {(['apple', 'google'] as const).map((provider) => (
        <Pressable
          key={provider}
          accessibilityLabel={`Continue with ${provider === 'apple' ? 'Apple' : 'Google'}`}
          accessibilityRole="button"
          onPress={() => onPress(provider)}
          style={({ pressed }) => [
            styles.socialButton,
            {
              backgroundColor: isDarkMode ? palette.surfaceAlt : '#FFFFFF',
              borderColor: palette.border,
              opacity: pressed ? 0.7 : 1,
            },
          ]}>
          <Ionicons name={provider === 'apple' ? 'logo-apple' : 'logo-google'} size={21} color={palette.text} />
          <Text style={[styles.socialButtonText, { color: palette.text }]}>
            {provider === 'apple' ? 'Apple' : 'Google'}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function AuthDivider({ label = 'or continue with' }: { label?: string }) {
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);

  return (
    <View style={styles.dividerRow}>
      <View style={[styles.dividerLine, { backgroundColor: palette.border }]} />
      <Text style={[styles.dividerText, { color: palette.muter }]}>{label}</Text>
      <View style={[styles.dividerLine, { backgroundColor: palette.border }]} />
    </View>
  );
}

export function AuthModal({
  children,
  icon = 'sparkles-outline',
  onClose,
  subtitle,
  title,
  visible,
}: {
  children: ReactNode;
  icon?: IconName;
  onClose: () => void;
  subtitle?: string;
  title: string;
  visible: boolean;
}) {
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalBackdrop}>
        <SafeAreaView
          edges={['left', 'right', 'bottom']}
          style={[
            styles.modalCard,
            { backgroundColor: palette.surface, borderColor: palette.border, shadowColor: '#020617' },
          ]}>
          <View style={styles.modalTopRow}>
            <View style={[styles.modalIcon, { backgroundColor: palette.iconWrap }]}>
              <Ionicons name={icon} size={23} color={palette.accent} />
            </View>
            <Pressable
              accessibilityLabel="Close modal"
              hitSlop={8}
              onPress={onClose}
              style={[styles.modalClose, { backgroundColor: isDarkMode ? palette.surfaceAlt : '#F1F5F9' }]}>
              <Ionicons name="close" size={21} color={palette.text} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={[styles.modalTitle, { color: palette.text }]}>{title}</Text>
            {subtitle ? <Text style={[styles.modalSubtitle, { color: palette.muter }]}>{subtitle}</Text> : null}
            <View style={styles.modalBody}>{children}</View>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function ModalActions({
  primaryLabel,
  primaryOnPress,
  secondaryLabel,
  secondaryOnPress,
}: {
  primaryLabel: string;
  primaryOnPress: () => void;
  secondaryLabel?: string;
  secondaryOnPress?: () => void;
}) {
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);

  return (
    <View style={styles.modalActions}>
      {secondaryLabel && secondaryOnPress ? (
        <Pressable
          onPress={secondaryOnPress}
          style={[styles.modalSecondary, { backgroundColor: palette.surfaceAlt, borderColor: palette.border }]}>
          <Text style={[styles.modalSecondaryText, { color: palette.text }]}>{secondaryLabel}</Text>
        </Pressable>
      ) : null}
      <Pressable onPress={primaryOnPress} style={[styles.modalPrimary, { backgroundColor: palette.accent }]}>
        <Text style={styles.modalPrimaryText}>{primaryLabel}</Text>
      </Pressable>
    </View>
  );
}

export function InlineMessage({ children, tone = 'danger' }: { children: ReactNode; tone?: 'danger' | 'muted' }) {
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);

  return <Text style={[styles.inlineMessage, { color: tone === 'danger' ? palette.danger : palette.muter }]}>{children}</Text>;
}

export function getAuthPalette(isDarkMode: boolean): AppPalette {
  return getThemePalette(isDarkMode);
}

const styles = StyleSheet.create({
  screen: { flex: 1, overflow: 'hidden' },
  keyboardAvoider: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 20, paddingVertical: 20 },
  content: { alignSelf: 'center', justifyContent: 'center', maxWidth: 520, width: '100%', flexGrow: 1 },
  brandRow: { alignItems: 'center', flexDirection: 'row', marginBottom: 28 },
  logoWrap: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    elevation: 5,
    height: 52,
    justifyContent: 'center',
    shadowOffset: { height: 7, width: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    width: 52,
  },
  logo: { height: 42, width: 42 },
  wordmark: { fontSize: 21, fontWeight: '900', letterSpacing: -0.4, marginLeft: 12 },
  heading: { marginBottom: 22 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 8, textTransform: 'uppercase' },
  title: { fontSize: 31, fontWeight: '900', letterSpacing: -1, lineHeight: 36 },
  subtitle: { fontSize: 14, fontWeight: '500', lineHeight: 21, marginTop: 9, maxWidth: 430 },
  card: {
    borderRadius: 30,
    borderWidth: 1,
    elevation: 8,
    padding: 22,
    shadowOffset: { height: 12, width: 7 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
  },
  socialRow: { flexDirection: 'row', gap: 10 },
  socialButton: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'center',
    minHeight: 50,
  },
  socialButtonText: { fontSize: 14, fontWeight: '800' },
  dividerRow: { alignItems: 'center', flexDirection: 'row', gap: 10, marginVertical: 20 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerText: { fontSize: 11, fontWeight: '700' },
  fieldGroup: { marginBottom: 15 },
  fieldLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.55, marginBottom: 8, textTransform: 'uppercase' },
  inputWrap: { alignItems: 'center', borderRadius: 16, borderWidth: 1, flexDirection: 'row', minHeight: 54, paddingHorizontal: 15 },
  input: { flex: 1, fontSize: 15, fontWeight: '600', marginLeft: 10, minHeight: 50, paddingVertical: 0 },
  primaryButton: {
    alignItems: 'center',
    borderRadius: 17,
    elevation: 5,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 54,
    shadowOffset: { height: 8, width: 4 },
    shadowOpacity: 0.24,
    shadowRadius: 12,
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  modalBackdrop: { backgroundColor: 'rgba(15,23,42,0.62)', flex: 1, justifyContent: 'flex-end' },
  modalCard: {
    alignSelf: 'center',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderWidth: 1,
    maxHeight: '90%',
    maxWidth: 620,
    padding: 22,
    paddingBottom: 18,
    shadowOffset: { height: -8, width: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    width: '100%',
  },
  modalTopRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  modalIcon: { alignItems: 'center', borderRadius: 16, height: 48, justifyContent: 'center', width: 48 },
  modalClose: { alignItems: 'center', borderRadius: 14, height: 42, justifyContent: 'center', width: 42 },
  modalTitle: { fontSize: 23, fontWeight: '900', letterSpacing: -0.55 },
  modalSubtitle: { fontSize: 14, fontWeight: '500', lineHeight: 20, marginTop: 7 },
  modalBody: { marginTop: 18 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  modalPrimary: { alignItems: 'center', borderRadius: 16, flex: 1, justifyContent: 'center', minHeight: 50, paddingHorizontal: 15 },
  modalPrimaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  modalSecondary: { alignItems: 'center', borderRadius: 16, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 50, paddingHorizontal: 15 },
  modalSecondaryText: { fontSize: 14, fontWeight: '800' },
  inlineMessage: { fontSize: 12, fontWeight: '700', lineHeight: 17, marginBottom: 12 },
});
