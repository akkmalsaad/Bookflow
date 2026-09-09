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
import { useTranslation } from '@/lib/use-translation';

export default function CurrencyRegionScreen() {
  const { isDarkMode } = useTheme();
  const { currency, updateCurrency } = useAppData();
  const palette = getThemePalette(isDarkMode);
  const { t } = useTranslation();

  return (
    <SettingsDetailScreen
      eyebrow={t('sub.preferences')}
      title={t('sub.currency.title')}
      description={t('sub.currency.description')}>
      <Text style={[settingsDetailStyles.groupLabel, { color: palette.muter, marginTop: 0 }]}>{t('settings.currency')}</Text>
      {CURRENCY_OPTIONS.map((option) => (
        <SettingsOptionRow
          key={option.code}
          title={option.label}
          subtitle={option.code}
          selected={option.code === currency}
          onPress={() => updateCurrency(option.code)}
        />
      ))}

      <Text style={[settingsDetailStyles.groupLabel, { color: palette.muter }]}>{t('sub.currency.country')}</Text>
      <SettingsInfoRow label={t('sub.currency.country')} value={t('sub.currency.countryValue')} />
      <SettingsInfoRow label={t('sub.currency.dateFormat')} value="DD/MM/YYYY" />
      <SettingsInfoRow label={t('sub.currency.timeFormat')} value={t('sub.currency.timeValue')} />

      <Text style={[settingsDetailStyles.groupLabel, { color: palette.muter }]}>{t('sub.currency.taxYear')}</Text>
      <SettingsNotice
        title={t('sub.currency.notice.title')}
        body={t('sub.currency.notice.body')}
        items={[t('sub.currency.item1'), t('sub.currency.item2'), t('sub.currency.item3')]}
      />
    </SettingsDetailScreen>
  );
}
