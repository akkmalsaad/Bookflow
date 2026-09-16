import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import BookFlowLoading from '@/components/feedback/BookFlowLoading';
import { useLoadingTransition } from '@/components/feedback/useLoadingTransition';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { SuccessFeedback } from '@/components/feedback/SuccessFeedback';
import { SettingsDetailScreen, settingsDetailStyles } from '@/components/settings/SettingsDetailScreen';
import { getSoftTokens } from '@/components/settings/tokens';
import { useAppData } from '@/context/app-data-context';
import { useSubscription } from '@/context/subscription-context';
import { getThemePalette, useTheme } from '@/context/theme-context';
import { useTranslation } from '@/lib/use-translation';
import {
  buildReportData,
  exportReport,
  formatRangeLabel,
  getExportFileName,
  getRangeBounds,
  isValidDateKey,
  REPORT_FORMATS,
  REPORT_RANGES,
  REPORT_TYPES,
  type ReportFormat,
  type ReportRange,
  type ReportType,
} from '@/lib/reports';

export default function ExportScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isDarkMode } = useTheme();
  const { isLoadingSubscription, isPro } = useSubscription();
  const loading = isLoadingSubscription || !isPro;
  const loadingTransition = useLoadingTransition(loading);
  const { businessProfile, financeEntries, bookings, invoices, payments, customers, currency } = useAppData();
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);

  const [range, setRange] = useState<ReportRange>('this-month');
  const [customStart, setCustomStart] = useState(getRangeBounds('this-month').start);
  const [customEnd, setCustomEnd] = useState(getRangeBounds('this-month').end);
  const [reportType, setReportType] = useState<ReportType>('complete');
  const [format, setFormat] = useState<ReportFormat>('pdf');
  const [isExporting, setIsExporting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const bounds = getRangeBounds(range, { start: customStart, end: customEnd });
  const reportData = useMemo(
    () =>
      buildReportData({
        type: reportType,
        bounds,
        businessProfile,
        // Same entitlement gate the invoice PDF uses: custom branding is a Pro feature.
        allowBusinessLogo: isPro,
        currency,
        financeEntries,
        bookings,
        invoices,
        payments,
        customers,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      reportType,
      bounds.start,
      bounds.end,
      businessProfile,
      isPro,
      currency,
      financeEntries,
      bookings,
      invoices,
      payments,
      customers,
    ],
  );

  // Export is a Pro feature. The entry rows already route Free users to the paywall; this covers
  // every other way in, and an entitlement that lapses while the screen is open.
  useEffect(() => {
    if (isLoadingSubscription || isPro) return;
    router.replace({ pathname: '/paywall', params: { returnTo: '/settings/export' } });
  }, [isLoadingSubscription, isPro, router]);

  if (loadingTransition.visible) {
    return (
      <SettingsDetailScreen eyebrow={t('settings.section.data')} title={t('export.title')}>
        <View style={styles.gate}>
          <BookFlowLoading key={loadingTransition.cycle} loading={loading} />
        </View>
      </SettingsDetailScreen>
    );
  }

  // A detail report with nothing to list would be a page of column headings. The complete report
  // still carries a useful summary — revenue, outstanding, invoice counts — so it stays available.
  const hasNothingToExport = reportData.recordCount === 0 && reportType !== 'complete';
  const outputName = getExportFileName(reportData, format);

  const handleExport = async () => {
    if (isExporting || hasNothingToExport) return;

    if (range === 'custom' && (!isValidDateKey(customStart) || !isValidDateKey(customEnd))) {
      Alert.alert(t('export.checkDates'), t('export.checkDates.format'));
      return;
    }

    if (range === 'custom' && customStart > customEnd) {
      Alert.alert(t('export.checkDates'), t('export.checkDates.order'));
      return;
    }

    setIsExporting(true);
    try {
      // Yield once so the button repaints as "Generating report…" before the document is built. The
      // build itself is synchronous string and byte work; without this the spinner would only
      // appear after it finished.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      // Resolves once the file exists and the native save/share sheet has been dismissed, so the
      // confirmation never sits behind that sheet. Expo cannot report whether the user saved or
      // cancelled, which is why this says the report was generated and nothing more.
      await exportReport({ data: reportData, format });
      setShowSuccess(true);
    } catch (error) {
      if (__DEV__) {
        console.error('[export] report generation failed', error);
      }
      // Native module and availability failures carry a sentence worth showing; anything else is a
      // stack trace the person exporting a report cannot act on.
      const message =
        error instanceof Error && /right now|not available|pop-ups/i.test(error.message)
          ? error.message
          : t('export.failed.body');
      Alert.alert(t('export.failed'), message);
    } finally {
      setIsExporting(false);
    }
  };

  const chip = (selected: boolean) => [
    styles.chip,
    { backgroundColor: soft.surface, borderColor: selected ? palette.accent : soft.border },
  ];

  return (
    <SettingsDetailScreen
      eyebrow={t('settings.section.data')}
      title={t('export.title')}
      description={t('export.description')}
      footer={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isExporting ? t('export.generatingLabel') : t('export.button')}
          accessibilityState={{ disabled: isExporting || hasNothingToExport, busy: isExporting }}
          disabled={isExporting || hasNothingToExport}
          onPress={handleExport}
          style={({ pressed }) => [
            settingsDetailStyles.primaryButton,
            styles.exportButton,
            { backgroundColor: palette.accent, shadowColor: palette.accent },
            (pressed || isExporting) && styles.pressed,
            hasNothingToExport && styles.disabled,
          ]}>
          {isExporting ? <ActivityIndicator color="#FFFFFF" size="small" /> : null}
          <Text style={settingsDetailStyles.primaryButtonText}>
            {isExporting ? t('export.generating') : t('export.button')}
          </Text>
        </Pressable>
      }>
      <Text style={[settingsDetailStyles.groupLabel, { color: palette.muter, marginTop: 0 }]}>{t('export.dateRange')}</Text>
      <View style={styles.chipRow}>
        {REPORT_RANGES.map((option) => {
          const selected = option.id === range;
          return (
            <Pressable
              key={option.id}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={option.label}
              onPress={() => setRange(option.id)}
              style={({ pressed }) => [...chip(selected), pressed && styles.pressed]}>
              <Text style={[styles.chipText, { color: selected ? palette.accent : palette.text }]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {range === 'custom' ? (
        <View style={styles.customRow}>
          <View style={styles.customField}>
            <Text style={[styles.customLabel, { color: palette.muter }]}>From</Text>
            <TextInput
              value={customStart}
              onChangeText={setCustomStart}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={palette.muter}
              autoCapitalize="none"
              accessibilityLabel={t('export.startDate')}
              style={[styles.input, { backgroundColor: soft.inset, borderColor: soft.border, color: palette.text }]}
            />
          </View>
          <View style={styles.customField}>
            <Text style={[styles.customLabel, { color: palette.muter }]}>To</Text>
            <TextInput
              value={customEnd}
              onChangeText={setCustomEnd}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={palette.muter}
              autoCapitalize="none"
              accessibilityLabel={t('export.endDate')}
              style={[styles.input, { backgroundColor: soft.inset, borderColor: soft.border, color: palette.text }]}
            />
          </View>
        </View>
      ) : (
        <Text style={[styles.rangeHint, { color: palette.muter }]}>{formatRangeLabel(bounds)}</Text>
      )}

      <Text style={[settingsDetailStyles.groupLabel, { color: palette.muter }]}>{t('export.reportType')}</Text>
      {REPORT_TYPES.map((option) => {
        const selected = option.id === reportType;
        return (
          <Pressable
            key={option.id}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            accessibilityHint={option.description}
            onPress={() => setReportType(option.id)}
            style={({ pressed }) => [
              styles.typeRow,
              {
                backgroundColor: selected ? soft.accentSoft : soft.surface,
                borderColor: selected ? palette.accent : soft.border,
              },
              pressed && styles.pressed,
            ]}>
            <View style={styles.typeCopy}>
              <View style={styles.typeTitleRow}>
                <Text style={[styles.typeTitle, { color: palette.text }]}>{option.label}</Text>
                {option.recommended ? (
                  <View style={[styles.badge, { backgroundColor: soft.accentSoft, borderColor: `${palette.accent}55` }]}>
                    <Text style={[styles.badgeText, { color: palette.accent }]}>{t('export.recommended')}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.typeDescription, { color: palette.muter }]}>{option.description}</Text>
            </View>
            {selected ? <Ionicons name="checkmark-circle" size={21} color={palette.accent} /> : null}
          </Pressable>
        );
      })}

      <Text style={[settingsDetailStyles.groupLabel, { color: palette.muter }]}>{t('export.format')}</Text>
      <View style={styles.chipRow}>
        {REPORT_FORMATS.map((option) => {
          const selected = option.id === format;
          return (
            <Pressable
              key={option.id}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={option.label}
              accessibilityHint={option.hint}
              onPress={() => setFormat(option.id)}
              style={({ pressed }) => [...chip(selected), styles.formatChip, pressed && styles.pressed]}>
              <Text style={[styles.chipText, { color: selected ? palette.accent : palette.text }]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.outcome, { backgroundColor: soft.inset, borderColor: soft.border }]}>
        <Ionicons
          name={hasNothingToExport ? 'alert-circle-outline' : 'document-text-outline'}
          size={19}
          color={hasNothingToExport ? palette.warning : palette.muter}
        />
        <View style={styles.outcomeCopy}>
          <Text style={[styles.outcomeTitle, { color: palette.text }]} numberOfLines={2}>
            {hasNothingToExport ? t('export.noRecords') : outputName}
          </Text>
          <Text style={[styles.outcomeHint, { color: palette.muter }]}>
            {hasNothingToExport
              ? t('export.chooseAnother')
              : reportData.recordCount === 1
                ? t('export.records.one')
                : t('export.records', { count: reportData.recordCount })}
          </Text>
        </View>
      </View>

      <Modal visible={showSuccess} transparent animationType="fade" onRequestClose={() => {}}>
        <View style={styles.successBackdrop}>
          <SuccessFeedback
            visible={showSuccess}
            title={t('export.saved')}
            message={t('export.saved.body')}
            onComplete={() => setShowSuccess(false)}
          />
        </View>
      </Modal>
    </SettingsDetailScreen>
  );
}

const styles = StyleSheet.create({
  gate: {
    height: 360,
  },
  /** The same dim every other BookFlow success state is presented over. */
  successBackdrop: {
    backgroundColor: 'rgba(15, 23, 42, 0.58)',
    flex: 1,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  chip: {
    borderRadius: 15,
    borderWidth: 1.5,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 16,
  },
  formatChip: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  chipText: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  customRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  customField: {
    flex: 1,
  },
  customLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.55,
    marginBottom: 7,
    textTransform: 'uppercase',
  },
  input: {
    borderRadius: 16,
    borderWidth: 1,
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rangeHint: {
    fontSize: 12.5,
    fontWeight: '600',
    marginTop: 10,
  },
  typeRow: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1.5,
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
    minHeight: 62,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  typeCopy: {
    flex: 1,
  },
  typeTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  badge: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  typeDescription: {
    fontSize: 12.5,
    fontWeight: '500',
    marginTop: 3,
  },
  outcome: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 11,
    marginTop: 18,
    padding: 14,
  },
  outcomeCopy: {
    flex: 1,
    minWidth: 0,
  },
  outcomeTitle: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  outcomeHint: {
    fontSize: 11.5,
    fontWeight: '500',
    marginTop: 3,
  },
  exportButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.8,
  },
});
