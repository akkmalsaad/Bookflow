import { Ionicons } from '@expo/vector-icons';
import { useId, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';

import { BottomSheetModal } from '@/components/BottomSheetModal';
import { getSoftTokens } from '@/components/settings/tokens';
import { getThemePalette, useTheme } from '@/context/theme-context';
import { INSIGHTS_PERIODS, type InsightsPeriod } from '@/lib/business-insights';
import type { TranslationKey } from '@/lib/i18n';
import { useTranslation } from '@/lib/use-translation';

export function ProBadge() {
  const { isDarkMode } = useTheme();
  return (
    <View style={[styles.proBadge, { backgroundColor: isDarkMode ? '#31245D' : '#EEE9FF' }]}>
      <Text style={[styles.proBadgeText, { color: isDarkMode ? '#C4B5FD' : '#6D28D9' }]}>PRO</Text>
    </View>
  );
}

export function WalletIllustration({ width = 146, height = 112 }: { width?: number; height?: number }) {
  const { t } = useTranslation();
  return (
    <Svg width={width} height={height} viewBox="0 0 180 138" accessibilityLabel={t('a11y.walletArt')}>
      <Defs>
        <LinearGradient id="walletBody" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#B7A5FF" />
          <Stop offset="0.55" stopColor="#8B6CF2" />
          <Stop offset="1" stopColor="#6846D9" />
        </LinearGradient>
        <LinearGradient id="walletFlap" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#D6CCFF" />
          <Stop offset="1" stopColor="#9075EF" />
        </LinearGradient>
        <LinearGradient id="note" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#F0ECFF" />
          <Stop offset="1" stopColor="#B9A8FB" />
        </LinearGradient>
      </Defs>
      <Path d="M37 116 C37 129 146 131 154 116" fill="#7253DA" opacity={0.13} />
      <G rotation="-10" origin="96,49">
        <Rect x="47" y="12" width="98" height="58" rx="7" fill="#9276F1" opacity={0.42} />
        <Rect x="54" y="18" width="98" height="58" rx="7" fill="url(#note)" />
        <Circle cx="103" cy="47" r="14" fill="#8E74EC" opacity={0.48} />
        <Path d="M65 31 H85 M122 62 H141" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" opacity={0.68} />
      </G>
      <G rotation="12" origin="131,55">
        <Rect x="104" y="26" width="61" height="77" rx="9" fill="#A98FF9" />
        <Rect x="113" y="38" width="25" height="7" rx="3.5" fill="#F4F1FF" opacity={0.85} />
        <Rect x="113" y="53" width="40" height="4" rx="2" fill="#E8E1FF" />
        <Rect x="113" y="62" width="31" height="4" rx="2" fill="#E8E1FF" />
      </G>
      <Path d="M28 55 C29 45 38 38 49 38 H111 C123 38 132 48 132 60 V111 C132 122 124 129 113 129 H45 C34 129 26 121 27 109 Z" fill="url(#walletBody)" />
      <Path d="M27 64 C45 70 75 66 91 57 C102 51 118 52 132 58 V86 C117 78 102 77 92 84 C73 96 45 98 27 92 Z" fill="url(#walletFlap)" opacity={0.96} />
      <Rect x="80" y="71" width="65" height="37" rx="17" fill="#7453DD" />
      <Rect x="82" y="73" width="59" height="31" rx="15" fill="#9B82EE" />
      <Circle cx="126" cy="88.5" r="5.2" fill="#F2EEFF" />
      <Path d="M41 49 C48 44 70 43 84 45" stroke="#E9E3FF" strokeWidth="3" strokeLinecap="round" opacity={0.46} />
    </Svg>
  );
}

export function GrowthChartIllustration({ width = 112, height = 76 }: { width?: number; height?: number }) {
  const { t } = useTranslation();
  const bars = [18, 29, 40, 54, 68];
  return (
    <Svg width={width} height={height} viewBox="0 0 116 78" accessibilityLabel={t('a11y.chartArt')}>
      <Defs>
        <LinearGradient id="growthBars" x1="0" y1="1" x2="0" y2="0">
          <Stop offset="0" stopColor="#C4B5FD" stopOpacity={0.55} />
          <Stop offset="1" stopColor="#8B5CF6" stopOpacity={0.92} />
        </LinearGradient>
      </Defs>
      {bars.map((bar, index) => (
        <Rect key={bar} x={8 + index * 20} y={72 - bar} width="12" height={bar} rx="5" fill="url(#growthBars)" />
      ))}
      <Path
        d="M10 52 C24 44 28 47 39 38 S56 35 67 25 S84 23 105 7"
        fill="none"
        stroke="#6D28D9"
        strokeWidth="2.7"
        strokeLinecap="round"
      />
      {[{ x: 10, y: 52 }, { x: 39, y: 38 }, { x: 67, y: 25 }, { x: 105, y: 7 }].map((point) => (
        <Circle key={`${point.x}-${point.y}`} cx={point.x} cy={point.y} r="3.8" fill="#FFFFFF" stroke="#6D28D9" strokeWidth="2.4" />
      ))}
    </Svg>
  );
}

export function Sparkline({
  data,
  color,
  width = 108,
  height = 42,
}: {
  data: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  const id = useId().replace(/:/g, '');
  const safeData = data.length ? data.map((value) => (Number.isFinite(value) ? value : 0)) : [0];
  const max = Math.max(...safeData);
  const min = Math.min(...safeData);
  const range = max - min || 1;
  const points = safeData.map((value, index) => ({
    x: safeData.length === 1 ? width / 2 : 3 + (index / (safeData.length - 1)) * (width - 6),
    y: 4 + (1 - (value - min) / range) * (height - 11),
  }));
  const line = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
  const area = `${line} L ${points.at(-1)?.x ?? width} ${height} L ${points[0].x} ${height} Z`;

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0.24} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Path d={area} fill={`url(#${id})`} />
      <Path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {points.length > 1 ? <Circle cx={points.at(-1)?.x} cy={points.at(-1)?.y} r="2.8" fill={color} /> : null}
    </Svg>
  );
}

export function IncomeExpenseDonut({
  income,
  expenses,
  profitLabel,
  incomeColor = '#31B55B',
  expenseColor = '#F43F5E',
}: {
  income: number;
  expenses: number;
  profitLabel: string;
  /** Passed in so the screen owning the donut decides its palette rather than this file. */
  incomeColor?: string;
  expenseColor?: string;
}) {
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const { t } = useTranslation();
  const total = Math.max(0, income) + Math.max(0, expenses);
  const expenseShare = total > 0 ? Math.max(0, expenses) / total : 0;
  // 148pt across with the ring's original 17pt stroke: the same weight of ring, around a centre
  // hole 111pt wide rather than 77pt. The old hole was narrower than the text box sitting in it,
  // which is what put long amounts against the ring.
  const size = 148;
  const center = size / 2;
  const radius = 64;
  const circumference = 2 * Math.PI * radius;

  return (
    <View style={styles.donutWrap}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle cx={center} cy={center} r={radius} fill="none" stroke={incomeColor} strokeWidth="17" />
        {expenseShare > 0 ? (
          <Circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={expenseColor}
            strokeWidth="17"
            strokeDasharray={`${circumference * expenseShare} ${circumference}`}
            strokeLinecap="butt"
            rotation="-90"
            origin={`${center}, ${center}`}
          />
        ) : null}
      </Svg>
      <View pointerEvents="none" style={styles.donutCenter}>
        <Text style={[styles.donutLabel, { color: palette.muter }]}>{t('insights.profit')}</Text>
        <Text
          style={[styles.donutValue, { color: palette.text }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          // A very long amount shrinks a little rather than running into the ring.
          minimumFontScale={0.75}>
          {profitLabel}
        </Text>
      </View>
    </View>
  );
}

export function InsightsPeriodSelector({
  value,
  onChange,
  variant = 'raised',
}: {
  value: InsightsPeriod;
  onChange: (period: InsightsPeriod) => void;
  /**
   * `raised` keeps the original soft-UI drop shadow. `flat` drops it for a plain bordered control —
   * opt-in, so only the screen that asks for it changes.
   */
  variant?: 'raised' | 'flat';
}) {
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const { t } = useTranslation();
  const soft = getSoftTokens(isDarkMode);
  const [open, setOpen] = useState(false);
  const flat = variant === 'flat';
  // The stored period id is unchanged; only its label follows the language.
  const label = t(`period.${value}` as TranslationKey);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Analytics period, ${label}`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.periodButton,
          { backgroundColor: soft.surface, borderColor: soft.border, shadowColor: soft.shadow },
          flat && styles.periodButtonFlat,
          pressed && styles.pressed,
        ]}>
        <Ionicons name="calendar-outline" size={flat ? 18 : 17} color={palette.text} />
        <Text style={[styles.periodButtonText, { color: palette.text }]} numberOfLines={1}>{label}</Text>
        <Ionicons name="chevron-down" size={15} color={palette.muter} />
      </Pressable>
      <BottomSheetModal visible={open} onClose={() => setOpen(false)} heightRatio={0.62}>
        <View style={styles.sheetHeader}>
          <View>
            <Text style={[styles.sheetEyebrow, { color: palette.accent }]}>{t('insights.period.eyebrow')}</Text>
            <Text style={[styles.sheetTitle, { color: palette.text }]}>{t('insights.period.title')}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={t('a11y.close')} hitSlop={8} onPress={() => setOpen(false)}>
            <Ionicons name="close" size={23} color={palette.text} />
          </Pressable>
        </View>
        <View style={styles.options}>
          {INSIGHTS_PERIODS.map((option) => {
            const selected = option.id === value;
            return (
              <Pressable
                key={option.id}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => {
                  onChange(option.id);
                  setOpen(false);
                }}
                style={({ pressed }) => [
                  styles.optionRow,
                  { backgroundColor: selected ? soft.accentSoft : soft.surface, borderColor: selected ? palette.accent : soft.border },
                  pressed && styles.pressed,
                ]}>
                <Text style={[styles.optionText, { color: selected ? palette.accent : palette.text }]}>{t(`period.${option.id}` as TranslationKey)}</Text>
                {selected ? <Ionicons name="checkmark-circle" size={21} color={palette.accent} /> : null}
              </Pressable>
            );
          })}
        </View>
        <View style={{ height: 24 }} />
      </BottomSheetModal>
    </>
  );
}

const styles = StyleSheet.create({
  proBadge: {
    alignItems: 'center',
    borderRadius: 8,
    justifyContent: 'center',
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  proBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.45,
  },
  pressed: { opacity: 0.78 },
  donutWrap: { alignItems: 'center', height: 148, justifyContent: 'center', width: 148 },
  // 94pt wide inside a 111pt hole, so the two lines clear the ring at their widest point. Left and
  // right alone keep the block centred: the wrap centres it vertically.
  donutCenter: { alignItems: 'center', left: 27, position: 'absolute', right: 27 },
  donutLabel: { fontSize: 10.5, fontWeight: '700', marginBottom: 2 },
  donutValue: { fontSize: 15, fontWeight: '900', maxWidth: 90 },
  periodButton: {
    alignItems: 'center',
    borderRadius: 15,
    borderWidth: 1,
    elevation: 2,
    flexDirection: 'row',
    minHeight: 44,
    paddingHorizontal: 12,
    shadowOffset: { width: 3, height: 5 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  periodButtonFlat: { elevation: 0, shadowOpacity: 0 },
  periodButtonText: { fontSize: 12.5, fontWeight: '800', marginHorizontal: 7, maxWidth: 98 },
  sheetHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 18,
    paddingTop: 4,
  },
  sheetEyebrow: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.7, marginBottom: 3, textTransform: 'uppercase' },
  sheetTitle: { fontSize: 20, fontWeight: '900', letterSpacing: -0.4 },
  options: { gap: 9 },
  optionRow: {
    alignItems: 'center',
    borderRadius: 17,
    borderWidth: 1.5,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: 16,
  },
  optionText: { fontSize: 14, fontWeight: '700' },
});
