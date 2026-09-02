import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { InvoicePreview } from '@/components/invoice-design/InvoicePreview';
import { TemplateCard } from '@/components/invoice-design/TemplateCard';
import { SettingsDetailScreen, settingsDetailStyles } from '@/components/settings/SettingsDetailScreen';
import { getSoftTokens } from '@/components/settings/tokens';
import { useAppData, type BusinessProfile } from '@/context/app-data-context';
import { useSnackbar } from '@/context/snackbar-context';
import { useSubscription } from '@/context/subscription-context';
import { getThemePalette, useTheme } from '@/context/theme-context';
import {
  ACCENT_PRESETS,
  buildInvoiceRenderData,
  DEFAULT_INVOICE_DESIGN,
  INVOICE_TEMPLATES,
  isValidAccentColor,
  normalizeBankDetails,
  normalizeHexColor,
  type InvoiceBankDetails,
  type InvoiceDesign,
  type InvoiceVisibility,
} from '@/lib/invoice-design';
import { SAMPLE_INVOICE, SAMPLE_CUSTOMER, SAMPLE_PAYMENTS } from '@/lib/invoice-design/sample';

const MAX_TERMS = 1200;
const MAX_INSTRUCTIONS = 500;
const MAX_THANK_YOU = 140;
const MAX_PREFIX = 12;

const VISIBILITY_ROWS: { key: keyof InvoiceVisibility; label: string; hint: string }[] = [
  { key: 'businessAddress', label: 'Business address', hint: 'Your address in the From block' },
  { key: 'clientAddress', label: 'Client address', hint: 'The address in the Bill to block' },
  { key: 'dueDate', label: 'Due date', hint: 'The payment due date row' },
  { key: 'paymentStatus', label: 'Payment status', hint: 'The status badge on the invoice' },
  { key: 'paymentInformation', label: 'Payment information', hint: 'Bank and DuitNow details' },
  { key: 'paymentInstructions', label: 'Payment instructions', hint: 'Your how-to-pay note' },
  { key: 'terms', label: 'Terms & conditions', hint: 'The terms panel' },
  { key: 'thankYou', label: 'Thank you message', hint: 'Your footer message' },
  { key: 'bookflowBranding', label: 'BookFlow branding', hint: 'The "Created with BookFlow" line' },
];

export default function InvoiceCustomisationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);
  const { showSnackbar } = useSnackbar();
  const { isPro } = useSubscription();
  const { businessProfile, invoiceSettings, currency, updateBusinessProfile, updateInvoiceSettings } = useAppData();

  // Everything is edited locally and written once, so changing a colour or a toggle never touches
  // Supabase. The save queue in the app data context persists the workspace on Save changes.
  const [profile, setProfile] = useState<BusinessProfile>(() => ({
    ...businessProfile,
    website: businessProfile.website ?? '',
    paymentDetails: normalizeBankDetails(businessProfile.paymentDetails),
  }));
  const [design, setDesign] = useState<InvoiceDesign>(() => ({
    ...invoiceSettings.design,
    visibility: { ...invoiceSettings.design.visibility },
  }));
  const [paymentInstructions, setPaymentInstructions] = useState(invoiceSettings.paymentInstructions);
  const [terms, setTerms] = useState(invoiceSettings.termsAndConditions);
  const [customAccent, setCustomAccent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const bank = normalizeBankDetails(profile.paymentDetails);
  const setBank = (updates: Partial<InvoiceBankDetails>) =>
    setProfile((current) => ({ ...current, paymentDetails: { ...normalizeBankDetails(current.paymentDetails), ...updates } }));

  /** One gate for every Pro control on this screen: the RevenueCat entitlement, nothing else. */
  const requirePro = () => {
    if (isPro) return true;
    router.push('/paywall');
    return false;
  };

  const preview = useMemo(
    () =>
      buildInvoiceRenderData({
        invoice: SAMPLE_INVOICE,
        customer: SAMPLE_CUSTOMER,
        payments: SAMPLE_PAYMENTS,
        currency,
        design,
        business: {
          name: profile.name,
          registrationNumber: profile.ssmRegistrationNo,
          phone: profile.phone,
          email: profile.email,
          website: profile.website ?? '',
          address: profile.address,
          logoUrl: isPro ? profile.logoUrl ?? null : null,
        },
        paymentDetails: bank,
        paymentInstructions,
        termsAndConditions: terms,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [design, profile, bank.bankName, bank.accountHolder, bank.accountNumber, bank.duitNowId, paymentInstructions, terms, currency, isPro],
  );

  const handleSave = async () => {
    if (isSaving) return;

    const accent = normalizeHexColor(design.accentColor);
    if (!accent) {
      Alert.alert('Check the accent colour', 'Enter a colour as a hex value, for example #173B6C.');
      return;
    }

    setIsSaving(true);
    try {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      updateBusinessProfile({ ...profile, paymentDetails: bank });
      // Pro-only values are re-gated at the moment of writing, so a lapsed subscription cannot
      // leave premium settings behind by way of an already-open screen.
      updateInvoiceSettings({
        paymentInstructions,
        termsAndConditions: terms,
        design: isPro
          ? { ...design, accentColor: accent }
          : {
              ...DEFAULT_INVOICE_DESIGN,
              visibility: { ...DEFAULT_INVOICE_DESIGN.visibility },
              invoicePrefix: '',
            },
      });
      showSnackbar({ message: 'Invoice settings saved', tone: 'success' });
    } catch (error) {
      if (__DEV__) console.error('[invoice-customisation] save failed', error);
      Alert.alert('Unable to save', 'Your invoice settings could not be saved. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    Alert.alert(
      'Reset invoice design?',
      'This returns the Standard template, BookFlow’s accent colour and the default visibility settings. Your invoices and their history are not affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () =>
            setDesign({ ...DEFAULT_INVOICE_DESIGN, visibility: { ...DEFAULT_INVOICE_DESIGN.visibility } }),
        },
      ],
    );
  };

  const field = (
    label: string,
    value: string,
    onChangeText: (text: string) => void,
    options: { placeholder?: string; multiline?: boolean; maxLength?: number; keyboardType?: 'default' | 'email-address' | 'phone-pad' } = {},
  ) => (
    <View style={styles.field} key={label}>
      <Text style={[styles.fieldLabel, { color: palette.muter }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={options.placeholder}
        placeholderTextColor={palette.muter}
        multiline={options.multiline}
        maxLength={options.maxLength}
        keyboardType={options.keyboardType ?? 'default'}
        autoCapitalize={options.keyboardType === 'email-address' ? 'none' : 'sentences'}
        style={[
          styles.input,
          options.multiline && styles.inputMultiline,
          { backgroundColor: soft.inset, borderColor: soft.border, color: palette.text },
        ]}
      />
    </View>
  );

  return (
    <SettingsDetailScreen
      eyebrow="Business"
      title="Invoice customisation"
      description="How your invoices look to customers, in the app, on their link and in the PDF."
      footer={
        <View style={styles.footerRow}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setShowPreview(true)}
            style={({ pressed }) => [
              styles.previewButton,
              { backgroundColor: soft.inset, borderColor: soft.border },
              pressed && styles.pressed,
            ]}>
            <Ionicons name="eye-outline" size={19} color={palette.text} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: isSaving, busy: isSaving }}
            disabled={isSaving}
            onPress={handleSave}
            style={({ pressed }) => [
              settingsDetailStyles.primaryButton,
              styles.saveButton,
              { backgroundColor: palette.accent, shadowColor: palette.accent },
              (pressed || isSaving) && styles.pressed,
            ]}>
            {isSaving ? <ActivityIndicator color="#FFFFFF" size="small" /> : null}
            <Text style={settingsDetailStyles.primaryButtonText}>{isSaving ? 'Saving…' : 'Save changes'}</Text>
          </Pressable>
        </View>
      }>
      <Text style={[settingsDetailStyles.groupLabel, { color: palette.muter, marginTop: 0 }]}>Business identity</Text>
      <View style={[styles.card, { backgroundColor: soft.surface, borderColor: soft.border }]}>
        {field('Business name', profile.name, (text) => setProfile((c) => ({ ...c, name: text })), { placeholder: 'Your business' })}
        {field('Registration / SSM number', profile.ssmRegistrationNo, (text) => setProfile((c) => ({ ...c, ssmRegistrationNo: text })))}
        {field('Phone', profile.phone, (text) => setProfile((c) => ({ ...c, phone: text })), { keyboardType: 'phone-pad' })}
        {field('Email', profile.email, (text) => setProfile((c) => ({ ...c, email: text })), { keyboardType: 'email-address' })}
        {field('Website / social', profile.website ?? '', (text) => setProfile((c) => ({ ...c, website: text })), { placeholder: 'yourstudio.my' })}
        {field('Business address', profile.address, (text) => setProfile((c) => ({ ...c, address: text })), { multiline: true })}
      </View>

      <ProRow
        icon="image-outline"
        title="Business logo"
        subtitle={
          isPro
            ? profile.logoUrl
              ? 'Shown on your invoices. Manage it in Business profile.'
              : 'Add a logo in Business profile to show it on invoices.'
            : 'Show your own logo on every invoice.'
        }
        locked={!isPro}
        onPress={() => (isPro ? router.push('/(tabs)/settings') : router.push('/paywall'))}
      />

      <Text style={[settingsDetailStyles.groupLabel, { color: palette.muter }]}>Choose template</Text>
      {INVOICE_TEMPLATES.map((template) => (
        <TemplateCard
          key={template.id}
          template={template}
          accentColor={design.accentColor}
          selected={design.templateId === template.id}
          locked={template.pro && !isPro}
          onPress={() => {
            if (template.pro && !requirePro()) return;
            setDesign((current) => ({ ...current, templateId: template.id }));
          }}
        />
      ))}

      <Text style={[settingsDetailStyles.groupLabel, { color: palette.muter }]}>Accent colour</Text>
      <View style={[styles.card, { backgroundColor: soft.surface, borderColor: soft.border }]}>
        <View style={styles.swatchRow}>
          {ACCENT_PRESETS.map((preset) => {
            const selected = normalizeHexColor(design.accentColor) === preset.value.toLowerCase();
            return (
              <Pressable
                key={preset.id}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={preset.label}
                onPress={() => {
                  if (!requirePro()) return;
                  setDesign((current) => ({ ...current, accentColor: preset.value }));
                }}
                style={({ pressed }) => [styles.swatch, { backgroundColor: preset.value }, selected && { borderColor: palette.text }, pressed && styles.pressed]}>
                {selected ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}
                {!isPro ? <Ionicons name="lock-closed" size={11} color="#FFFFFF" style={styles.swatchLock} /> : null}
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.fieldLabel, { color: palette.muter, marginTop: 14 }]}>Custom colour</Text>
        <View style={styles.customRow}>
          <TextInput
            value={customAccent}
            onChangeText={setCustomAccent}
            placeholder="#173B6C"
            placeholderTextColor={palette.muter}
            autoCapitalize="none"
            maxLength={7}
            style={[styles.input, styles.customInput, { backgroundColor: soft.inset, borderColor: soft.border, color: palette.text }]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Apply custom colour"
            onPress={() => {
              if (!requirePro()) return;
              if (!isValidAccentColor(customAccent)) {
                Alert.alert('Check the colour', 'Enter a hex colour such as #173B6C.');
                return;
              }
              setDesign((current) => ({ ...current, accentColor: normalizeHexColor(customAccent) ?? current.accentColor }));
              setCustomAccent('');
            }}
            style={({ pressed }) => [styles.applyButton, { backgroundColor: palette.accent }, pressed && styles.pressed]}>
            <Text style={styles.applyText}>Apply</Text>
          </Pressable>
        </View>
        <Text style={[styles.hint, { color: palette.muter }]}>
          Text on your accent is chosen automatically so it always stays readable.
        </Text>
      </View>

      <Text style={[settingsDetailStyles.groupLabel, { color: palette.muter }]}>Invoice numbering</Text>
      <View style={[styles.card, { backgroundColor: soft.surface, borderColor: soft.border }]}>
        <View style={styles.proFieldHeader}>
          <Text style={[styles.fieldLabel, { color: palette.muter, marginBottom: 0 }]}>Invoice prefix</Text>
          <ProPill locked={!isPro} />
        </View>
        <Pressable disabled={isPro} onPress={() => requirePro()}>
          <TextInput
            value={design.invoicePrefix}
            onChangeText={(text) => setDesign((current) => ({ ...current, invoicePrefix: text }))}
            editable={isPro}
            placeholder="INV-"
            placeholderTextColor={palette.muter}
            autoCapitalize="characters"
            maxLength={MAX_PREFIX}
            style={[styles.input, { backgroundColor: soft.inset, borderColor: soft.border, color: palette.text }, !isPro && styles.disabled]}
          />
        </Pressable>
        <Text style={[styles.hint, { color: palette.muter }]}>
          Applies to invoices you create from now on. Numbers already issued never change.
        </Text>
      </View>

      <Text style={[settingsDetailStyles.groupLabel, { color: palette.muter }]}>Payment information</Text>
      <View style={[styles.card, { backgroundColor: soft.surface, borderColor: soft.border }]}>
        {field('Bank name', bank.bankName, (text) => setBank({ bankName: text }), { placeholder: 'Maybank' })}
        {field('Account holder', bank.accountHolder, (text) => setBank({ accountHolder: text }))}
        {field('Account number', bank.accountNumber, (text) => setBank({ accountNumber: text }))}
        {field('DuitNow ID', bank.duitNowId, (text) => setBank({ duitNowId: text }), { placeholder: 'Optional' })}
        <Text style={[styles.hint, { color: palette.muter }]}>Empty rows are left off the invoice entirely.</Text>
      </View>

      <Text style={[settingsDetailStyles.groupLabel, { color: palette.muter }]}>Notes on the invoice</Text>
      <View style={[styles.card, { backgroundColor: soft.surface, borderColor: soft.border }]}>
        {field('Payment instructions', paymentInstructions, setPaymentInstructions, {
          multiline: true,
          maxLength: MAX_INSTRUCTIONS,
          placeholder: 'Please make payment by the due date shown above. Use your invoice number as the payment reference.',
        })}
        {field('Terms & conditions', terms, setTerms, {
          multiline: true,
          maxLength: MAX_TERMS,
          placeholder: 'Deposit payments are non-refundable.',
        })}
        <View style={styles.proFieldHeader}>
          <Text style={[styles.fieldLabel, { color: palette.muter, marginBottom: 0 }]}>Thank you message</Text>
          <ProPill locked={!isPro} />
        </View>
        <Pressable disabled={isPro} onPress={() => requirePro()}>
          <TextInput
            value={design.thankYouMessage}
            onChangeText={(text) => setDesign((current) => ({ ...current, thankYouMessage: text }))}
            editable={isPro}
            placeholder="Thank you for your business."
            placeholderTextColor={palette.muter}
            maxLength={MAX_THANK_YOU}
            style={[styles.input, { backgroundColor: soft.inset, borderColor: soft.border, color: palette.text }, !isPro && styles.disabled]}
          />
        </Pressable>
      </View>

      <View style={styles.sectionHeaderRow}>
        <Text style={[settingsDetailStyles.groupLabel, { color: palette.muter }]}>Invoice sections</Text>
        <ProPill locked={!isPro} />
      </View>
      <View style={[styles.card, { backgroundColor: soft.surface, borderColor: soft.border }]}>
        {VISIBILITY_ROWS.map((item, index) => (
          <View
            key={item.key}
            style={[styles.toggleRow, index < VISIBILITY_ROWS.length - 1 && { borderBottomColor: soft.divider, borderBottomWidth: 1 }]}>
            <View style={styles.toggleCopy}>
              <Text style={[styles.toggleLabel, { color: palette.text }]}>{item.label}</Text>
              <Text style={[styles.toggleHint, { color: palette.muter }]}>{item.hint}</Text>
            </View>
            <Switch
              value={design.visibility[item.key]}
              disabled={!isPro}
              onValueChange={(next) => {
                if (!requirePro()) return;
                setDesign((current) => ({ ...current, visibility: { ...current.visibility, [item.key]: next } }));
              }}
              trackColor={{ true: palette.accent, false: soft.divider }}
            />
          </View>
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={handleReset}
        style={({ pressed }) => [styles.resetButton, pressed && styles.pressed]}>
        <Ionicons name="refresh-outline" size={17} color={palette.danger} />
        <Text style={[styles.resetText, { color: palette.danger }]}>Reset to default</Text>
      </Pressable>

      <Modal visible={showPreview} animationType="slide" onRequestClose={() => setShowPreview(false)}>
        <View style={[styles.previewScreen, { backgroundColor: palette.background }]}>
          <View style={[styles.previewHeader, { paddingTop: insets.top + 8 }]}>
            <Text style={[styles.previewTitle, { color: palette.text }]}>Preview</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close preview"
              hitSlop={10}
              style={({ pressed }) => [styles.previewCloseButton, pressed && styles.pressed]}
              onPress={() => setShowPreview(false)}>
              <Ionicons name="close" size={25} color={palette.text} />
            </Pressable>
          </View>
          <ScrollView
            style={styles.previewScroll}
            contentContainerStyle={[styles.previewContent, { paddingBottom: insets.bottom + 40 }]}
            showsVerticalScrollIndicator={false}>
            <InvoicePreview data={preview} />
            <Text style={[styles.previewNote, { color: palette.muter }]}>
              Sample data. Your customers see this layout with their own invoice details.
            </Text>
          </ScrollView>
        </View>
      </Modal>
    </SettingsDetailScreen>
  );
}

function ProPill({ locked }: { locked: boolean }) {
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);

  return (
    <View style={[styles.proPill, { backgroundColor: soft.accentSoft }]}>
      {locked ? <Ionicons name="lock-closed-outline" size={11} color={palette.accent} /> : null}
      <Text style={[styles.proPillText, { color: palette.accent }]}>PRO</Text>
    </View>
  );
}

function ProRow({
  icon,
  title,
  subtitle,
  locked,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle: string;
  locked: boolean;
  onPress: () => void;
}) {
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        styles.proRow,
        { backgroundColor: soft.surface, borderColor: soft.border },
        pressed && styles.pressed,
      ]}>
      <View style={[styles.proIcon, { backgroundColor: soft.accentSoft }]}>
        <Ionicons name={icon} size={19} color={palette.accent} />
      </View>
      <View style={styles.proCopy}>
        <View style={styles.proTitleRow}>
          <Text style={[styles.proTitle, { color: palette.text }]}>{title}</Text>
          <ProPill locked={locked} />
        </View>
        <Text style={[styles.toggleHint, { color: palette.muter }]}>{subtitle}</Text>
      </View>
      <Ionicons name={locked ? 'lock-closed-outline' : 'chevron-forward'} size={17} color={palette.muter} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, borderWidth: 1, marginBottom: 4, paddingHorizontal: 16, paddingVertical: 14 },
  field: { marginBottom: 12 },
  fieldLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5, marginBottom: 7, textTransform: 'uppercase' },
  input: { borderRadius: 14, borderWidth: 1, fontSize: 14, fontWeight: '600', minHeight: 46, paddingHorizontal: 14, paddingVertical: 12 },
  inputMultiline: { minHeight: 84, textAlignVertical: 'top' },
  disabled: { opacity: 0.55 },
  hint: { fontSize: 11.5, lineHeight: 16, marginTop: 8 },

  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: { alignItems: 'center', borderColor: 'rgba(0,0,0,0.12)', borderRadius: 12, borderWidth: 2, height: 42, justifyContent: 'center', width: 42 },
  swatchLock: { position: 'absolute', bottom: 3, right: 3, opacity: 0.9 },
  customRow: { flexDirection: 'row', gap: 10 },
  customInput: { flex: 1 },
  applyButton: { alignItems: 'center', borderRadius: 14, justifyContent: 'center', minHeight: 46, paddingHorizontal: 18 },
  applyText: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '800' },

  proFieldHeader: { alignItems: 'center', flexDirection: 'row', gap: 8, marginBottom: 7 },
  proPill: { alignItems: 'center', borderRadius: 7, flexDirection: 'row', gap: 3, paddingHorizontal: 6, paddingVertical: 2 },
  proPillText: { fontSize: 8.5, fontWeight: '900', letterSpacing: 0.4 },
  sectionHeaderRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },

  proRow: { alignItems: 'center', flexDirection: 'row', gap: 12, marginTop: 10 },
  proIcon: { alignItems: 'center', borderRadius: 12, height: 38, justifyContent: 'center', width: 38 },
  proCopy: { flex: 1, minWidth: 0 },
  proTitleRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  proTitle: { fontSize: 14.5, fontWeight: '700' },

  toggleRow: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 54, paddingVertical: 6 },
  toggleCopy: { flex: 1, minWidth: 0 },
  toggleLabel: { fontSize: 14, fontWeight: '600' },
  toggleHint: { fontSize: 11.5, lineHeight: 16, marginTop: 2 },

  resetButton: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 22, paddingVertical: 12 },
  resetText: { fontSize: 14, fontWeight: '700' },

  footerRow: { flexDirection: 'row', gap: 10 },
  previewButton: { alignItems: 'center', borderRadius: 17, borderWidth: 1, justifyContent: 'center', minHeight: 52, width: 56 },
  saveButton: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 9, justifyContent: 'center' },

  previewScreen: { flex: 1 },
  previewHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 10, paddingHorizontal: 14 },
  previewTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  previewCloseButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44, zIndex: 2 },
  previewScroll: { flex: 1 },
  previewContent: { paddingHorizontal: 14 },
  previewNote: { fontSize: 11.5, lineHeight: 16, marginTop: 16, textAlign: 'center' },

  pressed: { opacity: 0.8 },
});
