import { SettingsDetailScreen, SettingsNotice } from '@/components/settings/SettingsDetailScreen';

export default function PaymentSettingsScreen() {
  return (
    <SettingsDetailScreen
      eyebrow="Business"
      title="Payment settings"
      description="Defaults for deposits and how customers pay you.">
      <SettingsNotice
        title="Not configurable yet"
        body="Deposits and payments are entered per invoice — you set the deposit amount when you record it, and the payment method is picked from a fixed list (Cash, Bank transfer, Card, E-wallet). Nothing here changes how any existing amount is calculated. These are planned:"
        items={[
          'Default deposit percentage or amount',
          'Bank account information',
          'DuitNow payment details',
          'Default payment instructions',
          'Default payment status behaviour',
        ]}
      />
    </SettingsDetailScreen>
  );
}
