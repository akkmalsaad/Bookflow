import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useReducedMotion, withTiming } from 'react-native-reanimated';

import { SettingsDetailScreen, settingsDetailStyles } from '@/components/settings/SettingsDetailScreen';
import { SettingsIcon, SettingsSection } from '@/components/settings/SettingsList';
import { getSoftTokens } from '@/components/settings/tokens';
import { useSubscription } from '@/context/subscription-context';
import { getThemePalette, useTheme } from '@/context/theme-context';
import type { TranslationKey } from '@/lib/i18n';
import { FREE_LIMITS } from '@/lib/plan-limits';
import { useTranslation } from '@/lib/use-translation';
import { captureEvent } from '@/lib/analytics';

type FaqAction = { label: TranslationKey; href: Href };

type FaqItem = {
  id: string;
  question: TranslationKey;
  answer: TranslationKey;
  answerValues?: Record<string, string | number>;
  bullets?: TranslationKey[];
  action?: FaqAction;
};

type FaqSection = { title: TranslationKey; items: FaqItem[] };

export default function HelpScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);
  const { isPro } = useSubscription();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    captureEvent('help_support_opened');
  }, []);

  const sections: FaqSection[] = [
    {
      title: 'help.faq.section.gettingStarted',
      items: [
        { id: 'createBooking', question: 'help.faq.createBooking.q', answer: 'help.faq.createBooking.a' },
        { id: 'addCustomer', question: 'help.faq.addCustomer.q', answer: 'help.faq.addCustomer.a' },
      ],
    },
    {
      title: 'help.faq.section.bookings',
      items: [
        { id: 'bookingStatus', question: 'help.faq.bookingStatus.q', answer: 'help.faq.bookingStatus.a' },
        { id: 'editBooking', question: 'help.faq.editBooking.q', answer: 'help.faq.editBooking.a' },
      ],
    },
    {
      title: 'help.faq.section.invoices',
      items: [
        { id: 'createInvoice', question: 'help.faq.createInvoice.q', answer: 'help.faq.createInvoice.a' },
        { id: 'sendInvoice', question: 'help.faq.sendInvoice.q', answer: 'help.faq.sendInvoice.a' },
        { id: 'recordPayment', question: 'help.faq.recordPayment.q', answer: 'help.faq.recordPayment.a' },
      ],
    },
    {
      title: 'help.faq.section.pro',
      items: [
        {
          id: 'proFeatures',
          question: 'help.faq.proFeatures.q',
          answer: 'help.faq.proFeatures.a',
          // Read from the plan rules and the paywall's own benefit copy, so this never drifts from
          // what the subscription actually unlocks.
          answerValues: {
            customers: FREE_LIMITS.customers,
            bookings: FREE_LIMITS.bookingsPerMonth,
            invoices: FREE_LIMITS.invoicesPerMonth,
          },
          bullets: ['paywall.benefit3', 'paywall.benefit4', 'paywall.benefit5', 'help.faq.proFeatures.export'],
        },
        {
          id: 'manageSubscription',
          question: 'help.faq.manageSubscription.q',
          answer: 'help.faq.manageSubscription.a',
          action: { label: 'help.faq.manageSubscription.action', href: '/settings/plan' },
        },
      ],
    },
    {
      title: 'help.faq.section.account',
      items: [
        {
          id: 'privacy',
          question: 'help.faq.privacy.q',
          answer: 'help.faq.privacy.a',
          action: { label: 'help.faq.privacy.action', href: '/settings/privacy' },
        },
        {
          id: 'export',
          question: 'help.faq.export.q',
          answer: 'help.faq.export.a',
          // Same gate as the Settings row: free accounts see the paywall, which returns to export.
          action: {
            label: 'help.faq.export.action',
            href: isPro ? '/settings/export' : { pathname: '/paywall', params: { returnTo: '/settings/export' } },
          },
        },
      ],
    },
    {
      title: 'help.faq.section.troubleshooting',
      items: [
        {
          id: 'troubleshooting',
          question: 'help.faq.troubleshooting.q',
          answer: 'help.faq.troubleshooting.a',
          bullets: [
            'help.faq.troubleshooting.item1',
            'help.faq.troubleshooting.item2',
            'help.faq.troubleshooting.item3',
            'help.faq.troubleshooting.item4',
          ],
        },
      ],
    },
  ];

  return (
    <SettingsDetailScreen eyebrow={t('sub.support')} title={t('sub.help.title')} description={t('sub.help.description')}>
      {sections.map((section) => (
        <SettingsSection key={section.title} title={t(section.title)}>
          {section.items.map((item) => (
            <FaqRow
              key={item.id}
              question={t(item.question)}
              expanded={expandedId === item.id}
              onToggle={() => setExpandedId((current) => (current === item.id ? null : item.id))}>
              <Text style={[styles.answer, { color: palette.muter }]}>{t(item.answer, item.answerValues)}</Text>
              {item.bullets ? (
                <View style={styles.bullets}>
                  {item.bullets.map((bullet) => (
                    <View key={bullet} style={styles.bullet}>
                      <View style={[styles.bulletDot, { backgroundColor: palette.accent }]} />
                      <Text style={[styles.bulletText, { color: palette.muter }]}>{t(bullet)}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
              {item.action ? (
                <Pressable
                  accessibilityRole="link"
                  onPress={() => router.push(item.action!.href)}
                  hitSlop={6}
                  style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
                  <Text style={[styles.actionText, { color: palette.accent }]}>{t(item.action.label)}</Text>
                  <Ionicons name="arrow-forward" size={15} color={palette.accent} />
                </Pressable>
              ) : null}
            </FaqRow>
          ))}
        </SettingsSection>
      ))}

      <View style={[styles.contactCard, { backgroundColor: soft.surface, borderColor: soft.border, shadowColor: soft.shadow }]}>
        <SettingsIcon name="chatbubbles-outline" />
        <Text style={[styles.contactTitle, { color: palette.text }]}>{t('help.contact.title')}</Text>
        <Text style={[styles.contactBody, { color: palette.muter }]}>{t('help.contact.body')}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/settings/contact-support')}
          style={({ pressed }) => [
            settingsDetailStyles.primaryButton,
            styles.contactButton,
            { backgroundColor: palette.accent, shadowColor: palette.accent },
            pressed && styles.pressed,
          ]}>
          <Text style={settingsDetailStyles.primaryButtonText}>{t('help.contact.cta')}</Text>
        </Pressable>
      </View>
    </SettingsDetailScreen>
  );
}

function FaqRow({
  question,
  expanded,
  onToggle,
  children,
}: {
  question: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const reduced = useReducedMotion();
  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: withTiming(expanded ? '180deg' : '0deg', { duration: reduced ? 0 : 200 }) }],
  }));

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={onToggle}
        style={({ pressed }) => [styles.question, pressed && styles.pressed]}>
        <Text style={[styles.questionText, { color: palette.text }]}>{question}</Text>
        <Animated.View style={chevronStyle}>
          <Ionicons name="chevron-down" size={18} color={palette.muter} />
        </Animated.View>
      </Pressable>
      {expanded ? (
        <Animated.View entering={reduced ? undefined : FadeIn.duration(180)} style={styles.answerWrap}>
          {children}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  question: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  questionText: { flex: 1, fontSize: 14.5, fontWeight: '700', lineHeight: 20 },
  answerWrap: { paddingBottom: 16, paddingHorizontal: 16, marginTop: -4 },
  answer: { fontSize: 13.5, fontWeight: '500', lineHeight: 20 },
  bullets: { gap: 8, marginTop: 10 },
  bullet: { alignItems: 'flex-start', flexDirection: 'row', gap: 10 },
  bulletDot: { borderRadius: 3, height: 5, marginTop: 8, width: 5 },
  bulletText: { flex: 1, fontSize: 13.5, fontWeight: '600', lineHeight: 20 },
  action: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: 6, marginTop: 12 },
  actionText: { fontSize: 13.5, fontWeight: '800' },
  contactCard: {
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    elevation: 4,
    marginTop: 4,
    paddingHorizontal: 20,
    paddingVertical: 22,
    shadowOffset: { height: 7, width: 5 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
  },
  contactTitle: { fontSize: 17, fontWeight: '900', letterSpacing: -0.3, marginTop: 12 },
  contactBody: { fontSize: 13.5, fontWeight: '500', lineHeight: 20, marginTop: 6, textAlign: 'center' },
  contactButton: { alignSelf: 'stretch', marginTop: 18 },
  pressed: { opacity: 0.8 },
});
