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
import { useAppData } from '@/context/app-data-context';
import { getThemePalette, useTheme } from '@/context/theme-context';
import { useSubscription } from '@/context/subscription-context';
import { getInvoiceTemplate } from '@/lib/invoice-design';
import { formatPaymentTerms, generateInvoiceNumber } from '@/lib/invoice-numbering';

export default function InvoiceSettingsScreen() {
  const router = useRouter();
  const { isDarkMode } = useTheme();
  const { businessProfile, invoiceSettings, trashedInvoices, updateInvoiceSettings } = useAppData();
  const { isPro } = useSubscription();
  const palette = getThemePalette(isDarkMode);
  const [editing, setEditing] = useState<InvoiceSettingField | null>(null);

  const preview = generateInvoiceNumber(invoiceSettings.numberFormat, invoiceSettings.nextInvoiceSequence, new Date());
  const templateName = getInvoiceTemplate(invoiceSettings.design.templateId).name;
  const instructions = invoiceSettings.paymentInstructions.trim();

  return (
    <SettingsDetailScreen
      eyebrow="Business"
      title="Invoice settings"
      description="What appears on the invoices you send to customers.">
      <Text style={[settingsDetailStyles.groupLabel, { color: palette.muter, marginTop: 0 }]}>Business details</Text>
      <SettingsInfoRow label="Business name" value={businessProfile.name || 'Not set'} />
      <SettingsInfoRow label="SSM registration no." value={businessProfile.ssmRegistrationNo || 'Not set'} />
      <SettingsInfoRow label="Phone" value={businessProfile.phone || 'Not set'} />
      <SettingsInfoRow label="Email" value={businessProfile.email || 'Not set'} />
      <SettingsInfoRow label="Address" value={businessProfile.address || 'Not set'} />

      <SettingsSection title="Invoice appearance">
        <SettingsRow
          icon="color-palette-outline"
          title="Invoice customisation"
          subtitle={`${templateName} template${isPro ? '' : ' · Pro templates available'}`}
          value="PRO"
          onPress={() => router.push('/settings/invoice-customisation')}
        />
      </SettingsSection>

      <SettingsSection title="Invoice configuration">
        <SettingsRow
          icon="pricetag-outline"
          title="Invoice number format"
          subtitle={`${invoiceSettings.numberFormat} · Preview: ${preview}`}
          onPress={() => setEditing('numberFormat')}
        />
        <SettingsRow
          icon="calendar-outline"
          title="Default payment terms"
          subtitle={formatPaymentTerms(invoiceSettings.paymentTermDays)}
          onPress={() => setEditing('paymentTerms')}
        />
        <SettingsRow
          icon="card-outline"
          title="Payment instructions"
          subtitle={instructions ? instructions.replace(/\s+/g, ' ') : 'Not set'}
          onPress={() => setEditing('paymentInstructions')}
        />
      </SettingsSection>

      <SettingsSection title="Deleted invoices">
        <SettingsRow
          icon="trash-outline"
          title="Dustbin"
          subtitle="View and restore deleted invoices"
          value={trashedInvoices.length ? String(trashedInvoices.length) : undefined}
          onPress={() => router.push('/settings/invoices/trash')}
        />
      </SettingsSection>

      <SettingsNotice
        title="Business details"
        body="Business name, registration number, phone, email and address are managed under Business Profile and automatically included on invoices. The invoice defaults above — numbering, payment terms and payment instructions — are configured here and applied to new invoices. Each invoice keeps the details it was created with, so changing anything here never rewrites an invoice you have already sent."
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
