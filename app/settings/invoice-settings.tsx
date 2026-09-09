import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

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
import { getInvoiceTemplate, normalizeBankDetails } from '@/lib/invoice-design';
import { formatPaymentTerms, generateInvoiceNumber } from '@/lib/invoice-numbering';
import { useTranslation } from '@/lib/use-translation';

export default function InvoiceSettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isDarkMode } = useTheme();
  const { businessProfile, invoiceSettings, trashedInvoices, updateInvoiceSettings } = useAppData();
  const { isPro } = useSubscription();
  const palette = getThemePalette(isDarkMode);
  const [editing, setEditing] = useState<InvoiceSettingField | null>(null);

  const preview = generateInvoiceNumber(invoiceSettings.numberFormat, invoiceSettings.nextInvoiceSequence, new Date());
  const templateName = getInvoiceTemplate(invoiceSettings.design.templateId).name;
  const instructions = invoiceSettings.paymentInstructions.trim();

  // Bank and DuitNow details live on the business profile and are edited on the customisation
  // screen, which is also what prints them. This row summarises them so Payment is a complete
  // picture without becoming a second place that owns the values.
  const bank = normalizeBankDetails(businessProfile.paymentDetails);
  const bankSummary = [bank.bankName, bank.accountNumber].map((value) => value.trim()).filter(Boolean).join(' · ');
  const duitNowSummary = bank.duitNowId.trim() ? `DuitNow ${bank.duitNowId.trim()}` : '';
  const paymentDetailsSubtitle =
    [bankSummary, duitNowSummary].filter(Boolean).join(' · ') || 'Add your bank or DuitNow details';

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
          onPress={() => setEditing('numberFormat')}
        />
        <SettingsRow
          icon="calendar-outline"
          title={t('invset.paymentTerms')}
          subtitle={formatPaymentTerms(invoiceSettings.paymentTermDays)}
          onPress={() => setEditing('paymentTerms')}
        />
        <SettingsRow
          icon="document-text-outline"
          title={t('invset.prefixNotes')}
          subtitle={t('invset.prefixNotes.subtitle')}
          onPress={() => router.push('/settings/invoice-customisation')}
        />
      </SettingsSection>

      <SettingsSection title={t('invset.payment')}>
        <SettingsRow
          icon="card-outline"
          title={t('invset.paymentInstructions')}
          subtitle={instructions ? instructions.replace(/\s+/g, ' ') : 'Not set'}
          onPress={() => setEditing('paymentInstructions')}
        />
        <SettingsRow
          icon="business-outline"
          title={t('invset.bankDetails')}
          subtitle={paymentDetailsSubtitle}
          onPress={() => router.push('/settings/invoice-customisation')}
        />
      </SettingsSection>
      <SettingsInfoRow label={t('invset.methods')} value={paymentMethods.join(' · ')} />

      <SettingsSection title={t('invset.appearance')}>
        <SettingsRow
          icon="color-palette-outline"
          title={t('invset.customisation')}
          subtitle={`${templateName} template${isPro ? '' : ' · Pro templates available'}`}
          value="PRO"
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
        settings={invoiceSettings}
        onClose={() => setEditing(null)}
        onSave={(updates) => {
          updateInvoiceSettings(updates);
          setEditing(null);
        }}
      />
    </SettingsDetailScreen>
  );
}
