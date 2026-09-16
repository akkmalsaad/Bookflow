import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';

import { SuccessFeedback } from '@/components/feedback/SuccessFeedback';
import {
  SettingsDetailScreen,
  SettingsInfoRow,
  SettingsNotice,
  settingsDetailStyles,
} from '@/components/settings/SettingsDetailScreen';
import { InvoiceSettingSheet, type InvoiceSettingField } from '@/components/settings/InvoiceSettingSheet';
import { SettingsRow, SettingsSection } from '@/components/settings/SettingsList';
import { paymentMethods } from '@/components/UpdatePaymentModal';
import { useAppData } from '@/context/app-data-context';
import { getThemePalette, useTheme } from '@/context/theme-context';
import { useSubscription } from '@/context/subscription-context';
import { getInvoiceTemplate } from '@/lib/invoice-design';
import { formatPaymentTerms, generateInvoiceNumber } from '@/lib/invoice-numbering';
import { useTranslation } from '@/lib/use-translation';

export default function InvoiceSettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isDarkMode } = useTheme();
  const { businessProfile, confirmWorkspaceSave, invoiceSettings, trashedInvoices, updateInvoiceSettings } = useAppData();
  const { isPro } = useSubscription();
  const palette = getThemePalette(isDarkMode);
  // The field stays set while the sheet slides away so its content doesn't blank mid-exit.
  const [editing, setEditing] = useState<InvoiceSettingField | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  // Held while the sheet slides away, then confirmed — see the sheet's onClosed hand-off.
  const [instructionsSaved, setInstructionsSaved] = useState(false);
  const [showInstructionsSuccess, setShowInstructionsSuccess] = useState(false);

  const openEditor = (field: InvoiceSettingField) => {
    setEditing(field);
    setSheetVisible(true);
  };

  const preview = generateInvoiceNumber(invoiceSettings.numberFormat, invoiceSettings.nextInvoiceSequence, new Date());
  const templateName = getInvoiceTemplate(invoiceSettings.design.templateId).name;
  const instructions = invoiceSettings.paymentInstructions.trim();

  return (
    <SettingsDetailScreen
      eyebrow={t('settings.section.business')}
      title={t('invset.title')}
      description={t('invset.description')}>
      <Text style={[settingsDetailStyles.groupLabel, { color: palette.muter, marginTop: 0 }]}>{t('invset.businessDetails')}</Text>
      <SettingsInfoRow label={t('invset.businessName')} value={businessProfile.name || t('invset.notSet')} />
      <SettingsInfoRow label={t('invset.ssm')} value={businessProfile.ssmRegistrationNo || t('invset.notSet')} />
      <SettingsInfoRow label={t('invset.phone')} value={businessProfile.phone || t('invset.notSet')} />
      <SettingsInfoRow label={t('invset.email')} value={businessProfile.email || t('invset.notSet')} />
      <SettingsInfoRow label={t('invset.address')} value={businessProfile.address || t('invset.notSet')} />

      <SettingsSection title={t('invset.invoiceDetails')}>
        <SettingsRow
          icon="pricetag-outline"
          title={t('invset.numberFormat')}
          subtitle={t('invset.preview', { format: invoiceSettings.numberFormat, preview })}
          onPress={() => openEditor('numberFormat')}
        />
        <SettingsRow
          icon="calendar-outline"
          title={t('invset.paymentTerms')}
          subtitle={formatPaymentTerms(invoiceSettings.paymentTermDays)}
          onPress={() => openEditor('paymentTerms')}
        />
      </SettingsSection>

      <SettingsSection title={t('invset.payment')}>
        <SettingsRow
          icon="card-outline"
          title={t('invset.paymentInstructions')}
          subtitle={instructions ? instructions.replace(/\s+/g, ' ') : 'Not set'}
          onPress={() => openEditor('paymentInstructions')}
        />
      </SettingsSection>
      <SettingsInfoRow label={t('invset.methods')} value={paymentMethods.join(' · ')} />

      <SettingsSection title={t('invset.appearance')}>
        <SettingsRow
          icon="color-palette-outline"
          title={t('invset.customisation')}
          subtitle={`${templateName} template${isPro ? '' : ' · Pro templates available'}`}
          proBadge
          onPress={() => router.push('/settings/invoice-customisation')}
        />
      </SettingsSection>

      <SettingsSection title={t('invset.dustbin')}>
        <SettingsRow
          icon="trash-outline"
          title={t('invset.dustbin.title')}
          subtitle={t('invset.dustbin.subtitle')}
          value={trashedInvoices.length ? String(trashedInvoices.length) : undefined}
          onPress={() => router.push('/settings/invoices/trash')}
        />
      </SettingsSection>

      <SettingsNotice
        title={t('invset.howApply')}
        body={t('invset.howApply.body')}
      />

      <InvoiceSettingSheet
        // Remount per field so each editor opens seeded from the saved value.
        key={editing ?? 'closed'}
        field={editing}
        visible={sheetVisible}
        settings={invoiceSettings}
        onClose={() => setSheetVisible(false)}
        onClosed={() => {
          setEditing(null);
          if (!instructionsSaved) return;
          setInstructionsSaved(false);
          // Confirmation only after the workspace save is acknowledged. A failed sync surfaces
          // through the existing sync banner and simply never shows the success card.
          void confirmWorkspaceSave().then(() => setShowInstructionsSuccess(true)).catch(() => {});
        }}
        onSave={(updates) => {
          updateInvoiceSettings(updates);
          if (updates.paymentInstructions) setInstructionsSaved(true);
          setSheetVisible(false);
        }}
      />

      <Modal visible={showInstructionsSuccess} transparent animationType="fade" onRequestClose={() => {}}>
        <View style={styles.successBackdrop}>
          <SuccessFeedback
            visible={showInstructionsSuccess}
            title={t('invset.instructionsAdded.title')}
            message={t('invset.instructionsAdded.body')}
            onComplete={() => setShowInstructionsSuccess(false)}
          />
        </View>
      </Modal>
    </SettingsDetailScreen>
  );
}

const styles = StyleSheet.create({
  /** The same dim every other BookFlow success state is presented over. */
  successBackdrop: {
    backgroundColor: 'rgba(15, 23, 42, 0.58)',
    flex: 1,
  },
});
