import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { getSoftTokens } from '@/components/settings/tokens';
import { getThemePalette, useTheme } from '@/context/theme-context';
import { resolveInvoiceTokens, type InvoiceTemplate } from '@/lib/invoice-design';

/**
 * A miniature of each layout, drawn from the same accent the real invoice uses.
 *
 * Deliberately abstract rather than a scaled-down invoice: at this size real text is unreadable, so
 * the thumbnail communicates the one thing that distinguishes the templates — where the weight sits
 * on the page.
 */
function Thumbnail({ template, accentColor }: { template: InvoiceTemplate; accentColor: string }) {
  const tokens = resolveInvoiceTokens(accentColor, template.id);
  const bar = (width: number | string, color: string, height = 3) => ({
    width: width as number,
    height,
    borderRadius: 1.5,
    backgroundColor: color,
  });

  const rows = (
    <View style={styles.thumbRows}>
      {[1, 2, 3].map((index) => (
        <View key={index} style={styles.thumbRow}>
          <View style={bar('56%' as unknown as number, tokens.border)} />
          <View style={bar('22%' as unknown as number, tokens.border)} />
        </View>
      ))}
    </View>
  );

  if (template.id === 'bold') {
    return (
      <View style={[styles.thumb, { backgroundColor: '#FFFFFF' }]}>
        <View style={[styles.thumbBanner, { backgroundColor: tokens.accent }]}>
          <View style={bar(28, tokens.accentText, 4)} />
          <View style={[bar(18, tokens.accentText), { opacity: 0.6, marginTop: 3 }]} />
        </View>
        <View style={styles.thumbBody}>
          <View style={[bar('100%' as unknown as number, tokens.text, 5), { marginBottom: 5 }]} />
          {rows}
          <View style={[styles.thumbTotal, { backgroundColor: tokens.accent }]} />
        </View>
      </View>
    );
  }

  if (template.id === 'elegant') {
    return (
      <View style={[styles.thumb, styles.thumbCentre, { backgroundColor: '#FFFFFF' }]}>
        <View style={[bar(40, tokens.text, 4), { alignSelf: 'center' }]} />
        <View style={[bar(14, tokens.accent, 1), { alignSelf: 'center', marginVertical: 5 }]} />
        <View style={[bar(22, tokens.accent), { alignSelf: 'center', marginBottom: 8 }]} />
        {rows}
        <View style={[styles.thumbTotal, { borderColor: tokens.accent, borderWidth: 1, backgroundColor: 'transparent' }]} />
      </View>
    );
  }

  if (template.id === 'minimal') {
    return (
      <View style={[styles.thumb, { backgroundColor: '#FFFFFF' }]}>
        <View style={styles.thumbHead}>
          <View style={bar(34, tokens.text, 4)} />
          <View style={bar(20, tokens.muted)} />
        </View>
        <View style={[bar('100%' as unknown as number, tokens.text, 1), { marginTop: 12, marginBottom: 6 }]} />
        {rows}
        <View style={[bar('100%' as unknown as number, tokens.text, 2), { marginTop: 9 }]} />
        <View style={[bar(30, tokens.text, 6), { alignSelf: 'flex-end', marginTop: 4 }]} />
      </View>
    );
  }

  if (template.id === 'compact') {
    return (
      <View style={[styles.thumb, { backgroundColor: '#FFFFFF' }]}>
        <View style={styles.thumbHead}>
          <View style={bar(26, tokens.accent, 5)} />
          <View style={bar(18, tokens.muted)} />
        </View>
        <View style={[styles.thumbRow, { marginTop: 6 }]}>
          <View style={bar('46%' as unknown as number, tokens.border)} />
          <View style={bar('46%' as unknown as number, tokens.border)} />
        </View>
        <View style={[bar('100%' as unknown as number, tokens.accentSoft, 5), { marginTop: 6, marginBottom: 4 }]} />
        {rows}
        <View style={[styles.thumbTotal, { backgroundColor: tokens.accent, height: 9, marginTop: 5 }]} />
      </View>
    );
  }

  // Standard and Modern share the split masthead; Modern carries the accent rule on top.
  return (
    <View style={[styles.thumb, { backgroundColor: '#FFFFFF' }]}>
      {template.id === 'modern' ? (
        <View style={[styles.thumbTopRule, { backgroundColor: tokens.accent }]} />
      ) : null}
      <View style={styles.thumbHead}>
        <View style={bar(30, tokens.accent, 7)} />
        <View style={bar(20, tokens.muted)} />
      </View>
      <View style={[bar('100%' as unknown as number, tokens.accentSoft, 5), { marginTop: 10, marginBottom: 5 }]} />
      {rows}
      <View style={[styles.thumbTotal, { backgroundColor: tokens.accent }]} />
    </View>
  );
}

export function TemplateCard({
  template,
  accentColor,
  selected,
  locked,
  onPress,
}: {
  template: InvoiceTemplate;
  accentColor: string;
  selected: boolean;
  locked: boolean;
  onPress: () => void;
}) {
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: false }}
      accessibilityLabel={`${template.name} template${locked ? ', Pro' : ''}`}
      accessibilityHint={locked ? 'Opens BookFlow Pro' : template.description}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: selected ? soft.accentSoft : soft.surface,
          borderColor: selected ? palette.accent : soft.border,
        },
        pressed && styles.pressed,
      ]}>
      <Thumbnail template={template} accentColor={accentColor} />
      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <Text style={[styles.name, { color: palette.text }]} numberOfLines={1}>
            {template.name}
          </Text>
          {locked ? <Ionicons name="lock-closed-outline" size={14} color={palette.muter} /> : null}
          {template.pro ? (
            <View style={[styles.badge, { backgroundColor: soft.accentSoft, borderColor: `${palette.accent}55` }]}>
              <Text style={[styles.badgeText, { color: palette.accent }]}>PRO</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.description, { color: palette.muter }]} numberOfLines={2}>
          {template.description}
        </Text>
        <Text style={[styles.bestFor, { color: palette.muter }]} numberOfLines={1}>
          {template.bestFor}
        </Text>
      </View>
      {selected ? (
        <Ionicons name="checkmark-circle" size={21} color={palette.accent} style={styles.check} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1.5,
    flexDirection: 'row',
    gap: 14,
    marginBottom: 10,
    padding: 12,
  },
  thumb: {
    borderColor: 'rgba(17, 24, 39, 0.08)',
    borderRadius: 6,
    borderWidth: 1,
    height: 82,
    overflow: 'hidden',
    padding: 8,
    width: 62,
  },
  thumbCentre: { paddingTop: 10 },
  thumbTopRule: { height: 3, marginHorizontal: -8, marginTop: -8, marginBottom: 7 },
  thumbBanner: { marginHorizontal: -8, marginTop: -8, paddingHorizontal: 8, paddingVertical: 8 },
  thumbBody: { paddingTop: 7 },
  thumbHead: { flexDirection: 'row', justifyContent: 'space-between' },
  thumbRows: { gap: 4 },
  thumbRow: { flexDirection: 'row', gap: 4, justifyContent: 'space-between' },
  thumbTotal: { borderRadius: 2, height: 10, marginTop: 7, width: '58%' },
  copy: { flex: 1, minWidth: 0 },
  titleRow: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  name: { flexShrink: 1, fontSize: 14.5, fontWeight: '800' },
  badge: { borderRadius: 7, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 1 },
  badgeText: { fontSize: 8.5, fontWeight: '900', letterSpacing: 0.4 },
  description: { fontSize: 11.5, lineHeight: 16, marginTop: 3 },
  bestFor: { fontSize: 10.5, fontStyle: 'italic', marginTop: 3, opacity: 0.85 },
  check: { marginLeft: 2 },
  pressed: { opacity: 0.8 },
});
