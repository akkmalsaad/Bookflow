import { Text } from 'react-native';

import {
  SettingsDetailScreen,
  SettingsInfoRow,
  SettingsNotice,
  SettingsOptionRow,
  settingsDetailStyles,
} from '@/components/settings/SettingsDetailScreen';
import { CURRENCY_OPTIONS, useAppData } from '@/context/app-data-context';
import { getThemePalette, useTheme } from '@/context/theme-context';

export default function CurrencyRegionScreen() {
  const { isDarkMode } = useTheme();
  const { currency, updateCurrency } = useAppData();
  const palette = getThemePalette(isDarkMode);

  return (
    <SettingsDetailScreen
      eyebrow="Preferences"
      title="Currency & region"
      description="The currency applies to every amount in BookFlow — bookings, invoices, payments and the finance screens.">
      <Text style={[settingsDetailStyles.groupLabel, { color: palette.muter, marginTop: 0 }]}>Currency</Text>
      {CURRENCY_OPTIONS.map((option) => (
        <SettingsOptionRow
          key={option.code}
          title={option.label}
          subtitle={option.code}
          selected={option.code === currency}
          onPress={() => updateCurrency(option.code)}
        />
      ))}

      <Text style={[settingsDetailStyles.groupLabel, { color: palette.muter }]}>Region</Text>
      <SettingsInfoRow label="Country" value="Malaysia" />
      <SettingsInfoRow label="Date format" value="DD/MM/YYYY" />
      <SettingsInfoRow label="Time format" value="24-hour" />

      <Text style={[settingsDetailStyles.groupLabel, { color: palette.muter }]}>Tax & financial year</Text>
      <SettingsNotice
        title="Not configurable yet"
        body="BookFlow does not apply tax to invoices or track a financial year. Amounts are recorded exactly as you enter them. These will live here once they are built:"
        items={['Tax / SST rate and registration number', 'Financial year start month', 'Date and time format overrides']}
      />
    </SettingsDetailScreen>
  );
}
