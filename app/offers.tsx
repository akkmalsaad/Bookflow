import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomSheetModal } from '@/components/BottomSheetModal';
import { AddBookingModal } from '@/components/booking/AddBookingModal';
import { BookingFormActionSheet } from '@/components/booking/BookingFormActionSheet';
import { LinkReadyPanel } from '@/components/booking/LinkReadyPanel';
import { getBookingFormColors } from '@/components/booking/booking-form-styles';
import { InvoiceActionSheet, type InvoiceActionSheetItem } from '@/components/invoice/InvoiceActionSheet';
import { StatusPill } from '@/components/StatusPill';
import { FilterTabs } from '@/components/TrendRangeTabs';
import { getCurrencyFormatter, useAppData } from '@/context/app-data-context';
import { useSnackbar } from '@/context/snackbar-context';
import { getThemePalette, useTheme } from '@/context/theme-context';
import { captureEvent } from '@/lib/analytics';
import { canReviseOffer, getOfferTotals, isQuotationExpired, type BookingOffer } from '@/lib/booking-offers';
import type { TranslationKey } from '@/lib/i18n';
import { useResponsive } from '@/lib/responsive';
import { useTranslation } from '@/lib/use-translation';

type Filter = 'all' | 'quotation' | 'booking_form';

function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

const STATUS_TONE: Record<string, 'blue' | 'green' | 'amber' | 'red' | 'gray'> = {
  draft: 'gray',
  sent: 'blue',
  submitted: 'amber',
  accepted: 'green',
  declined: 'red',
  change_requested: 'amber',
  converted: 'green',
  revoked: 'gray',
  expired: 'gray',
};

/**
 * Quotations and booking forms in one list. The offer's own status (sent, submitted, accepted…) is
 * shown on its own; the booking it becomes keeps its job status, and payments stay on the invoice.
 */
export default function OffersScreen() {
  const router = useRouter();
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const colors = getBookingFormColors(isDarkMode, palette);
  const { readingStyle } = useResponsive();
  const { t, intlLocale } = useTranslation();
  const { showSnackbar } = useSnackbar();
  const { offers, customers, currency, packages, refreshOffers, shareOffer, revokeOffer, deleteOfferDraft, convertQuotation } = useAppData();
  const formatter = useMemo(() => getCurrencyFormatter(currency), [currency]);
  const [filter, setFilter] = useState<Filter>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [menuOffer, setMenuOffer] = useState<BookingOffer | null>(null);
  // "View request" on a booking form card opens its change request directly.
  const [formView, setFormView] = useState<'actions' | 'request'>('actions');
  const [composer, setComposer] = useState<{ offer?: BookingOffer } | null>(null);
  const [link, setLink] = useState<{ url: string; expiresAt: string; phone?: string; kind: BookingOffer['kind'] } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const today = localToday();

  const pull = useCallback(async (report: boolean) => {
    setRefreshing(report);
    try {
      await refreshOffers();
    } catch {
      if (report) showSnackbar({ message: t('of.refreshFailed'), tone: 'danger' });
    } finally {
      setRefreshing(false);
    }
  }, [refreshOffers, showSnackbar, t]);

  // Responses are checked whenever the list comes into view.
  useFocusEffect(useCallback(() => { pull(false); }, [pull]));

  const visible = offers.filter((offer) => filter === 'all' || offer.kind === filter);

  const formatDate = (value?: string) => {
    if (!value) return '';
    const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(intlLocale, { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
  };

  const statusLabel = (offer: BookingOffer): { key: string; label: string } => {
    if (isQuotationExpired(offer, today)) return { key: 'expired', label: t('of.status.expired') };
    if (offer.status === 'sent' && offer.kind === 'booking_form') return { key: 'sent', label: t('of.status.sentForm') };
    return { key: offer.status, label: t(`of.status.${offer.status}` as TranslationKey) };
  };

  const share = async (offer: BookingOffer) => {
    if (busyId) return;
    setBusyId(offer.id);
    try {
      const result = await shareOffer(offer.id);
      if (!result.ok) {
        showSnackbar({ message: result.error, tone: 'danger' });
        return;
      }
      captureEvent('offer_shared', { kind: offer.kind, version: offer.version });
      const customer = offer.customerId ? customers.find((item) => item.id === offer.customerId) : undefined;
      setLink({ url: result.url, expiresAt: result.expiresAt, phone: customer?.phone, kind: offer.kind });
    } finally {
      setBusyId(null);
    }
  };

  const convert = (offer: BookingOffer, allowConflict = false) => {
    const result = convertQuotation(offer.id, { allowConflict });
    if (result.ok) {
      captureEvent('quotation_converted', { conflict_override: allowConflict });
      showSnackbar({ message: t('of.convert.done') });
      return;
    }
    if (result.error === 'conflict') {
      Alert.alert(t('bm.conflict.title'), t('of.convert.conflict', { title: result.conflictTitle ?? '' }), [
        { text: t('of.cancel'), style: 'cancel' },
        { text: t('bm.conflict.override'), style: 'destructive', onPress: () => convert(offer, true) },
      ]);
      return;
    }
    if (result.error === 'limit' && result.limit && !result.limit.allowed) {
      router.push({ pathname: '/paywall', params: { reason: result.limit.kind, returnTo: '/offers' } });
      return;
    }
    showSnackbar({ message: result.error, tone: 'danger' });
  };

  const revoke = (offer: BookingOffer) => {
    Alert.alert(t('of.revoke'), t('of.revoke.confirm'), [
      { text: t('of.cancel'), style: 'cancel' },
      {
        text: t('of.revoke'),
        style: 'destructive',
        onPress: async () => {
          const result = await revokeOffer(offer.id);
          if (!result.ok) showSnackbar({ message: result.error ?? t('of.refreshFailed'), tone: 'danger' });
        },
      },
    ]);
  };

  const kindLabel = (offer: BookingOffer) => t(offer.kind === 'booking_form' ? 'of.label.booking_form' : 'of.label.quotation');
  const customerLabel = (offer: BookingOffer) => {
    const customer = offer.customerId ? customers.find((entry) => entry.id === offer.customerId) : undefined;
    return customer ? t('of.forCustomer', { name: customer.name }) : offer.response?.name ? t('of.forCustomer', { name: offer.response.name }) : t('of.anyCustomer');
  };

  // Booking forms open the shared BookingFormActionSheet below; this menu is for quotations.
  const menuItems: InvoiceActionSheetItem[] = menuOffer && menuOffer.kind !== 'booking_form'
    ? [
        ...(menuOffer.status !== 'revoked' && menuOffer.status !== 'declined'
          ? [{ key: 'share', icon: 'share-outline' as const, label: t('of.share'), onPress: () => { const offer = menuOffer; setMenuOffer(null); share(offer); } }]
          : []),
        ...(menuOffer.kind === 'quotation' && canReviseOffer(menuOffer)
          ? [{ key: 'revise', icon: 'create-outline' as const, label: t('of.revise'), onPress: () => { const offer = menuOffer; setMenuOffer(null); setComposer({ offer }); } }]
          : []),
        ...(menuOffer.kind === 'quotation' && menuOffer.status === 'accepted' && !menuOffer.bookingId
          ? [{ key: 'convert', icon: 'calendar-outline' as const, label: t('of.convert'), onPress: () => { const offer = menuOffer; setMenuOffer(null); convert(offer); } }]
          : []),
        ...(menuOffer.status === 'draft' && !menuOffer.sharedAt
          ? [{ key: 'delete', icon: 'trash-outline' as const, label: t('of.delete'), destructive: true, separatedAbove: true, onPress: () => { deleteOfferDraft(menuOffer.id); setMenuOffer(null); } }]
          : []),
        ...(menuOffer.sharedAt && menuOffer.status !== 'revoked' && menuOffer.status !== 'converted'
          ? [{ key: 'revoke', icon: 'close-circle-outline' as const, label: t('of.revoke'), destructive: true, separatedAbove: true, onPress: () => { const offer = menuOffer; setMenuOffer(null); revoke(offer); } }]
          : []),
      ]
    : [];

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]}>
      <View style={[styles.header, readingStyle]}>
        <Pressable
          hitSlop={8}
          onPress={() => router.back()}
          style={({ pressed }) => [styles.headerButton, { backgroundColor: palette.surface, borderColor: palette.border, opacity: pressed ? 0.7 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={t('notifications.back')}>
          <Ionicons name="arrow-back" size={22} color={palette.text} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.eyebrow, { color: '#142A3A' }]}>{t('of.eyebrow')}</Text>
          <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>{t('of.title')}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('of.newQuote')}
          disabled={!packages.length}
          onPress={() => setComposer({})}
          style={({ pressed }) => [styles.newButton, { backgroundColor: '#142A3A', shadowColor: palette.accent, opacity: pressed ? 0.8 : packages.length ? 1 : 0.5 }]}>
          <Ionicons name="add" size={18} color="#fff" />
        </Pressable>
      </View>

      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => pull(true)} tintColor={palette.accent} />}
        contentContainerStyle={[styles.list, readingStyle]}
        ListHeaderComponent={(
          <View style={styles.filters}>
            <FilterTabs
              value={filter}
              onChange={setFilter}
              options={[
                { key: 'all', label: t('of.filter.all') },
                { key: 'quotation', label: t('of.filter.quotes') },
                { key: 'booking_form', label: t('of.filter.forms') },
              ]}
              color={palette.accent}
              isDarkMode={isDarkMode}
            />
          </View>
        )}
        ListEmptyComponent={(
          <View style={[styles.emptyCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Ionicons name="pricetags-outline" size={30} color={palette.muter} />
            <Text style={[styles.emptyMessage, { color: palette.muter }]}>{t('of.empty')}</Text>
          </View>
        )}
        renderItem={({ item }) => {
          const status = statusLabel(item);
          const totals = getOfferTotals(item.details);
          const unshared = item.sharedVersion !== undefined && item.sharedVersion < item.version && item.status !== 'converted';
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${kindLabel(item)} ${item.number ?? ''} ${item.details.title}, ${status.label}`}
              accessibilityHint={t('bd.more')}
              disabled={busyId === item.id}
              onPress={() => {
                setFormView('actions');
                setMenuOffer(item);
              }}
              style={({ pressed }) => [styles.card, { backgroundColor: palette.surfaceAlt, borderColor: palette.border, opacity: pressed ? 0.85 : 1 }]}>
              <View style={styles.cardTop}>
                <View style={styles.cardCopy}>
                  <Text style={[styles.kind, { color: palette.accent }]}>
                    {kindLabel(item)}{item.number ? ` · ${item.number}` : ''}
                  </Text>
                  <Text style={[styles.cardTitle, { color: palette.text }]} numberOfLines={1}>{item.details.title}</Text>
                  <Text style={[styles.meta, { color: palette.muter }]} numberOfLines={1}>
                    {customerLabel(item)}
                  </Text>
                </View>
                <StatusPill label={status.label} tone={STATUS_TONE[status.key] ?? 'gray'} />
              </View>
              {item.createdAt ? (
                <View style={styles.row}>
                  <Ionicons name="create-outline" size={15} color={palette.muter} />
                  <Text style={[styles.rowText, { color: palette.text }]}>{t('of.created', { date: formatDate(item.createdAt) })}</Text>
                </View>
              ) : null}
              <View style={styles.row}>
                <Ionicons name="calendar-outline" size={15} color={palette.muter} />
                <Text style={[styles.rowText, { color: palette.text }]}>{t('of.event', { date: formatDate(item.details.date), time: `${item.details.startTime}–${item.details.endTime}` })}</Text>
              </View>
              <View style={styles.row}>
                <Ionicons name="cash-outline" size={15} color={palette.muter} />
                <Text style={[styles.rowText, styles.amount, { color: palette.text }]}>{formatter.format(totals.totalCents / 100)}</Text>
              </View>
              {item.validUntil ? <Text style={[styles.note, { color: palette.muter }]}>{t('of.validUntil', { date: formatDate(item.validUntil) })}</Text> : null}
              {item.submittedAt ? <Text style={[styles.note, { color: palette.muter }]}>{item.kind === 'quotation' && item.status === 'accepted' ? t('of.respondedVersion', { version: item.respondedVersion ?? item.version, date: formatDate(item.submittedAt) }) : t('of.submitted', { date: formatDate(item.submittedAt) })}</Text> : null}
              {item.changeRequest && item.status === 'change_requested' ? <Text style={[styles.note, { color: palette.text }]} numberOfLines={3}>{t('of.changeRequest', { message: item.changeRequest })}</Text> : null}
              {item.kind === 'booking_form' && item.status === 'change_requested' ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${t('of.request.view')}, ${item.details.title}`}
                  onPress={() => {
                    setFormView('request');
                    setMenuOffer(item);
                  }}
                  style={({ pressed }) => [styles.inlineAction, styles.inlineActionOutline, { borderColor: palette.accent, opacity: pressed ? 0.85 : 1 }]}>
                  <Text style={[styles.inlineActionText, { color: palette.accent }]}>{t('of.request.view')}</Text>
                </Pressable>
              ) : null}
              {unshared ? <Text style={[styles.note, { color: '#B26C00' }]}>{t('of.unshared')}</Text> : null}
              {item.kind === 'quotation' && item.status === 'accepted' && !item.bookingId ? (
                <Pressable accessibilityRole="button" onPress={() => convert(item)} style={({ pressed }) => [styles.inlineAction, { backgroundColor: palette.accent, opacity: pressed ? 0.85 : 1 }]}>
                  <Text style={styles.inlineActionText}>{t('of.convert')}</Text>
                </Pressable>
              ) : null}
            </Pressable>
          );
        }}
      />

      <InvoiceActionSheet
        visible={menuOffer !== null && menuOffer.kind !== 'booking_form'}
        onClose={() => setMenuOffer(null)}
        title={menuOffer ? `${kindLabel(menuOffer)}${menuOffer.number ? ` · ${menuOffer.number}` : ''}` : ''}
        subtitle={menuOffer?.details.title}
        items={menuItems}
      />

      <BookingFormActionSheet
        offer={menuOffer?.kind === 'booking_form' ? menuOffer : null}
        view={formView}
        onClose={() => {
          setMenuOffer(null);
          setFormView('actions');
        }}
      />

      <BottomSheetModal visible={link !== null} onClose={() => setLink(null)} heightRatio={0.8}>
        {link ? (
          <View style={styles.linkBody}>
            <LinkReadyPanel
              title={link.kind === 'quotation' ? t('of.kind.quotation') : t('bm.sendForm.title')}
              body={link.kind === 'quotation' ? t('bm.quote.notice') : t('bm.sendForm.body')}
              url={link.url}
              expiresAt={link.expiresAt}
              phone={link.phone}
              colors={colors}
              onDone={() => setLink(null)}
            />
          </View>
        ) : null}
      </BottomSheetModal>

      {composer ? (
        <AddBookingModal
          mode="quote"
          sourceOffer={composer.offer}
          selectedDate={composer.offer?.details.date ?? today}
          onClose={() => setComposer(null)}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 12 },
  headerButton: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, marginLeft: 12 },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 },
  title: { fontSize: 24, fontWeight: '800' },
  newButton: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center', shadowOpacity: 0.24, shadowRadius: 12, shadowOffset: { width: 4, height: 7 }, elevation: 5 },
  filters: { paddingTop: 18 },
  list: { paddingHorizontal: 20, paddingBottom: 28, gap: 12 },
  card: { borderWidth: 1, borderRadius: 22, padding: 16 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  cardCopy: { flex: 1 },
  kind: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 4 },
  cardTitle: { fontSize: 17, fontWeight: '700' },
  meta: { fontSize: 12, marginTop: 3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  rowText: { flex: 1, fontSize: 13, fontWeight: '600' },
  amount: { fontWeight: '800', fontSize: 14 },
  note: { fontSize: 12, lineHeight: 17, marginTop: 4 },
  inlineAction: { marginTop: 12, borderRadius: 14, paddingVertical: 11, alignItems: 'center' },
  inlineActionText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  inlineActionOutline: { backgroundColor: 'transparent', borderWidth: 1, minHeight: 44, justifyContent: 'center' },
  emptyCard: { borderWidth: 1, borderRadius: 20, padding: 24, alignItems: 'center', gap: 10 },
  emptyMessage: { fontSize: 13.5, lineHeight: 20, textAlign: 'center' },
  linkBody: { paddingBottom: 24 },
});
