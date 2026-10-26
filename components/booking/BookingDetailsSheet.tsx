import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheetModal } from '@/components/BottomSheetModal';
import { DatePickerField } from '@/components/DatePickerField';
import { BookingMoneySummary } from '@/components/booking/BookingMoneySummary';
import { JobStatusPill } from '@/components/booking/JobStatusPill';
import { bookingFormStyles as f, getBookingFormColors } from '@/components/booking/booking-form-styles';
import { formatTime } from '@/components/booking/EventTimePicker';
import { modalScrollProps } from '@/components/modal-keyboard';
import { getCurrencyFormatter, useAppData, type Booking } from '@/context/app-data-context';
import { getThemePalette, useTheme } from '@/context/theme-context';
import { captureEvent } from '@/lib/analytics';
import {
  FULFILMENT_STATUS_ORDER,
  getDeliveryState,
  normalizeDeliveryLink,
  type FulfilmentStatus,
} from '@/lib/booking-fulfilment';
import {
  calculateBookingTotals,
  describeQuantity,
  getBookingBasePrice,
  getBookingDepositTerms,
  normalizeCharges,
} from '@/lib/booking-pricing';
import { getInvoicePaymentSummary } from '@/lib/invoice-payments';
import { getBookingFinancialSummary } from '@/lib/job-financials';
import { useTranslation } from '@/lib/use-translation';

type Props = {
  bookingId: string | null;
  visible: boolean;
  onClose: () => void;
  onClosed?: () => void;
  onChangeStatus: (booking: Booking) => void;
  /**
   * Called once a delivery status save has been confirmed by the server, with the booking and the
   * status that was saved. The screen closes the sheet and shows its success confirmation after the
   * sheet has gone.
   */
  onStatusSaved: (saved: { bookingId: string; status: FulfilmentStatus }) => void;
};

/** Notes the app writes itself when a booking is saved without any; they are not the owner's. */
const PLACEHOLDER_NOTES = new Set(['New booking created from quick add.', 'Booking created from an invoice.']);

/**
 * The line the app writes as the first paragraph of a booking made from a booking form or an
 * accepted quotation (see `buildBookingFromOffer`). It is a record, not the owner's note, so it is
 * shown read-only and kept exactly as stored whenever the notes beneath it are edited.
 */
const SYSTEM_NOTE_LINE = /^(?:Submitted through the booking form on (?:\d{4}-\d{2}-\d{2})?\. Terms \S* accepted\.|Created from accepted quotation [^\n]*\(version \d+\)\.)$/;
const TERMS_ID = /\. Terms \S* accepted\.$/;

/** Splits stored notes into the app's read-only line (if any) and the owner's editable notes. */
function splitBookingNotes(stored: string | undefined) {
  const notes = (stored ?? '').trim();
  const breakAt = notes.indexOf('\n\n');
  const first = breakAt === -1 ? notes : notes.slice(0, breakAt);
  const systemLine = SYSTEM_NOTE_LINE.test(first) ? first : '';
  const editable = systemLine ? notes.slice(first.length).trim() : notes;
  return { systemLine, editable: PLACEHOLDER_NOTES.has(editable) ? '' : editable };
}

function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * Booking details: the booking's notes, the agreed breakdown, the job's money and delivery
 * tracking. Opened from a Schedule card; a standard BookFlow bottom sheet, so it looks and moves
 * like every other sheet in the app.
 */
export function BookingDetailsSheet({ bookingId, visible, onClose, onClosed, onChangeStatus, onStatusSaved }: Props) {
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const colors = getBookingFormColors(isDarkMode, palette);
  const { softInset, softBorder, softSurface, accentSoft } = colors;
  const insets = useSafeAreaInsets();
  const { t, intlLocale } = useTranslation();
  const {
    bookings, customers, invoices, payments, financeEntries, currency,
    setBookingFulfilment, setBookingNotes, confirmWorkspaceSave,
  } = useAppData();
  const formatter = useMemo(() => getCurrencyFormatter(currency), [currency]);
  const booking = bookings.find((item) => item.id === bookingId) ?? null;
  const customer = booking ? customers.find((item) => item.id === booking.customerId) ?? null : null;

  const [deliveryStatus, setDeliveryStatus] = useState<FulfilmentStatus>('not_started');
  const [promisedDate, setPromisedDate] = useState('');
  const [deliveryLink, setDeliveryLink] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [deliveryError, setDeliveryError] = useState('');
  const [trackingOpen, setTrackingOpen] = useState(false);
  const [savingDelivery, setSavingDelivery] = useState(false);
  // Blocks a second tap before `savingDelivery` has re-rendered the button.
  const savingDeliveryRef = useRef(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [notesError, setNotesError] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const savingNotesRef = useRef(false);

  // Each opening starts from the booking as it is stored.
  useEffect(() => {
    if (!visible || !booking) return;
    setEditingNotes(false);
    setNotesDraft('');
    setNotesError('');
    setDeliveryError('');
    setDeliveryStatus(booking.fulfilment?.status ?? 'not_started');
    setPromisedDate(booking.fulfilment?.promisedDate ?? '');
    setDeliveryLink(booking.fulfilment?.deliveryLink ?? '');
    setDeliveryNotes(booking.fulfilment?.internalNotes ?? '');
    setTrackingOpen(Boolean(booking.fulfilment));
    // Only when the sheet opens or switches booking — not on every save while it is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, booking?.id]);

  const linkedInvoices = useMemo(
    () => (booking ? invoices.filter((invoice) => invoice.bookingId === booking.id) : []),
    [booking, invoices],
  );
  const paidCents = linkedInvoices.reduce((sum, invoice) => sum + Math.round(getInvoicePaymentSummary(invoice, payments).amountPaid * 100), 0);
  const charges = booking ? normalizeCharges(booking.charges) : [];
  const totals = booking
    ? calculateBookingTotals({ basePrice: getBookingBasePrice(booking), charges, deposit: getBookingDepositTerms(booking), paidCents })
    : null;
  const money = booking ? getBookingFinancialSummary(booking, invoices, payments, financeEntries) : null;
  const deliveryState = booking ? getDeliveryState(booking, localToday()) : 'none';

  const formatDate = (value?: string) => {
    if (!value) return '';
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(intlLocale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(date);
  };
  const timeRange = booking
    ? [booking.startTime ?? booking.time, booking.endTime].filter(Boolean).map((value) => formatTime(value as string)).join(' – ')
    : '';

  /**
   * Saves the delivery status and fields onto this booking only (its job status, invoices and
   * payments are untouched), and reports success once the workspace save has actually landed. The
   * screen then closes the sheet and shows the shared success confirmation once it has gone.
   */
  const saveDelivery = async () => {
    if (!booking || savingDeliveryRef.current) return;
    const link = deliveryLink.trim();
    const normalizedLink = link ? normalizeDeliveryLink(link) : undefined;
    if (link && !normalizedLink) {
      setDeliveryError(t('bd.delivery.linkInvalid'));
      return;
    }
    const result = setBookingFulfilment(booking.id, {
      status: deliveryStatus,
      ...(promisedDate ? { promisedDate } : {}),
      ...(deliveryNotes.trim() ? { internalNotes: deliveryNotes.trim() } : {}),
      ...(normalizedLink ? { deliveryLink: normalizedLink } : {}),
    });
    if (!result.ok) {
      setDeliveryError(result.error ?? t('bd.delivery.linkInvalid'));
      return;
    }
    Keyboard.dismiss();
    savingDeliveryRef.current = true;
    setSavingDelivery(true);
    setDeliveryError('');
    let saved = false;
    try {
      await confirmWorkspaceSave();
      saved = true;
      setDeliveryLink(normalizedLink ?? '');
      captureEvent('delivery_updated', { status: deliveryStatus, has_link: Boolean(normalizedLink) });
    } catch (failure) {
      // The sheet stays open with what was entered, so tapping Save status again retries it.
      setDeliveryError(failure instanceof Error && failure.message ? failure.message : t('bookings.error.save'));
    } finally {
      savingDeliveryRef.current = false;
      setSavingDelivery(false);
    }
    if (saved) onStatusSaved({ bookingId: booking.id, status: deliveryStatus });
  };

  // Delivery fields that differ from what the booking has stored — the only edits this sheet holds.
  const storedFulfilment = booking?.fulfilment;
  const hasUnsavedDelivery = Boolean(booking) && trackingOpen && (
    deliveryStatus !== (storedFulfilment?.status ?? 'not_started')
    || promisedDate !== (storedFulfilment?.promisedDate ?? '')
    || deliveryLink.trim() !== (storedFulfilment?.deliveryLink ?? '')
    || deliveryNotes.trim() !== (storedFulfilment?.internalNotes ?? '')
  );

  /** Closes without saving anything; unsaved delivery edits are discarded only once confirmed. */
  const requestClose = () => {
    Keyboard.dismiss();
    if (savingDelivery || !hasUnsavedDelivery) {
      onClose();
      return;
    }
    Alert.alert(t('bd.delivery.unsaved.title'), t('bd.delivery.unsaved.body'), [
      { text: t('bd.delivery.unsaved.keep'), style: 'cancel' },
      { text: t('bd.delivery.unsaved.discard'), style: 'destructive', onPress: onClose },
    ]);
  };

  const moneyRows = money
    ? [
        { key: 'value', label: t('bd.money.value'), value: formatter.format(money.bookingValue) },
        { key: 'collected', label: t('bd.money.collected'), value: formatter.format(money.collected) },
        { key: 'outstanding', label: t('bd.money.outstanding'), value: formatter.format(money.outstanding) },
        { key: 'expenses', label: t('bd.money.expenses', { count: money.linkedExpenseCount }), value: money.linkedExpenses ? `− ${formatter.format(money.linkedExpenses)}` : formatter.format(0) },
        { key: 'projected', label: t('bd.money.projected'), value: formatter.format(money.projectedMargin), strong: true },
      ]
    : [];

  // The booking's own notes, as the owner typed them. Private: shown here only. The app's own line
  // is shown without its stored terms identifier, which stays in the record untouched.
  const { systemLine, editable: bookingNotes } = splitBookingNotes(booking?.notes);
  const systemLineText = systemLine.replace(TERMS_ID, '. Terms accepted.');

  const startEditingNotes = () => {
    setNotesDraft(bookingNotes);
    setNotesError('');
    setEditingNotes(true);
  };

  const cancelEditingNotes = () => {
    if (savingNotesRef.current) return;
    Keyboard.dismiss();
    setEditingNotes(false);
    setNotesDraft('');
    setNotesError('');
  };

  /**
   * Saves the owner's notes onto this booking only, keeping the app's read-only line in front of
   * them exactly as stored. A failed save puts the previous notes back and leaves the editor open
   * with what was typed, so Save can be tapped again.
   */
  const saveNotes = async () => {
    if (!booking || savingNotesRef.current) return;
    const text = notesDraft.trim();
    if (text === bookingNotes) {
      cancelEditingNotes();
      return;
    }
    const previous = booking.notes;
    const result = setBookingNotes(booking.id, [systemLine, text].filter(Boolean).join('\n\n'));
    if (!result.ok) {
      setNotesError(result.error ?? t('bookings.error.save'));
      return;
    }
    savingNotesRef.current = true;
    setSavingNotes(true);
    setNotesError('');
    try {
      await confirmWorkspaceSave();
      Keyboard.dismiss();
      setEditingNotes(false);
      setNotesDraft('');
    } catch (failure) {
      setBookingNotes(booking.id, previous);
      setNotesError(failure instanceof Error && failure.message ? failure.message : t('bookings.error.save'));
    } finally {
      savingNotesRef.current = false;
      setSavingNotes(false);
    }
  };

  return (
    <BottomSheetModal visible={visible && Boolean(booking)} onClose={requestClose} onClosed={onClosed} heightRatio={0.92}>
      {booking && totals ? (
        // Outside the scroll view, so it stays put however far the sheet is scrolled.
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            hitSlop={8}
            onPress={requestClose}
            style={({ pressed }) => [styles.closeButton, { backgroundColor: softInset }, pressed && f.pressed]}>
            <Ionicons name="close" size={22} color={palette.text} />
          </Pressable>
        </View>
      ) : null}
      {booking && totals ? (
        <ScrollView {...modalScrollProps} contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 8 }}>
            <>
              <View style={styles.header}>
                <View style={styles.flex}>
                  <Text style={[styles.eyebrow, { color: palette.accent }]}>{t('bd.title')}</Text>
                  <Text accessibilityRole="header" style={[styles.title, { color: palette.text }]} numberOfLines={2}>{booking.title}</Text>
                  <Text style={[styles.subtitle, { color: palette.muter }]} numberOfLines={1}>{customer?.name ?? 'Unknown customer'}</Text>
                </View>
                <JobStatusPill status={booking.status} onPress={() => onChangeStatus(booking)} />
              </View>

              <View style={[styles.card, { backgroundColor: softSurface, borderColor: softBorder }]}>
                <MetaRow icon="calendar-outline" value={formatDate(booking.date)} color={palette.text} muted={palette.muter} />
                <MetaRow icon="time-outline" value={timeRange || t('bookings.notSpecified')} color={palette.text} muted={palette.muter} />
                <MetaRow icon="location-outline" value={booking.location} color={palette.text} muted={palette.muter} />
                <MetaRow icon="cube-outline" value={booking.packageName} color={palette.text} muted={palette.muter} />
                {booking.bufferMinutes ? <MetaRow icon="hourglass-outline" value={`${t('bm.buffer')} · ${t('bm.buffer.minutes', { count: booking.bufferMinutes })}`} color={palette.text} muted={palette.muter} /> : null}
              </View>

              <View style={styles.inlineLabelRow}>
                <Text style={[f.fieldLabel, styles.inlineLabel, { color: palette.muter }]}>{t('bookings.notes')}</Text>
                {editingNotes ? (
                  // Beside the heading rather than under the field, so they stay above the keyboard.
                  <View style={styles.notesActions}>
                    <Pressable accessibilityRole="button" accessibilityState={{ disabled: savingNotes }} disabled={savingNotes} hitSlop={8} onPress={cancelEditingNotes} style={({ pressed }) => [styles.notesAction, pressed && f.pressed]}>
                      <Text style={[f.textLink, { color: palette.muter }]}>{t('bd.notes.cancel')}</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityState={{ disabled: savingNotes, busy: savingNotes }} disabled={savingNotes} hitSlop={8} onPress={saveNotes} style={({ pressed }) => [styles.notesAction, pressed && f.pressed]}>
                      {savingNotes ? <ActivityIndicator color={palette.accent} size="small" /> : null}
                      <Text style={[f.textLink, { color: palette.accent }]}>{savingNotes ? t('bd.notes.saving') : t('bd.notes.save')}</Text>
                    </Pressable>
                  </View>
                ) : systemLine || bookingNotes ? (
                  <Pressable accessibilityRole="button" hitSlop={8} onPress={startEditingNotes} style={({ pressed }) => [styles.notesAction, pressed && f.pressed]}>
                    <Text style={[f.textLink, { color: palette.accent }]}>{bookingNotes ? t('bd.notes.edit') : t('bd.notes.add')}</Text>
                  </Pressable>
                ) : null}
              </View>
              {!editingNotes && !systemLine && !bookingNotes ? (
                <Pressable accessibilityRole="button" onPress={startEditingNotes} style={({ pressed }) => [f.sectionButton, styles.noTop, { backgroundColor: softInset, borderColor: softBorder }, pressed && f.pressed]}>
                  <Text style={[f.sectionTitle, { color: palette.text }]}>{t('bd.notes.add')}</Text>
                  <Ionicons name="add" size={18} color={palette.accent} />
                </Pressable>
              ) : (
                <View style={[styles.card, { backgroundColor: softSurface, borderColor: softBorder }]}>
                  {systemLine ? (
                    <Text selectable style={[styles.notesText, { color: palette.muter }, (Boolean(bookingNotes) || editingNotes) && styles.systemNote]}>{systemLineText}</Text>
                  ) : null}
                  {editingNotes ? (
                    <>
                      <TextInput
                        value={notesDraft}
                        onChangeText={(value) => { setNotesDraft(value); setNotesError(''); }}
                        placeholder={t('bd.notes.placeholder')}
                        placeholderTextColor={palette.muter}
                        accessibilityLabel={t('bd.notes.editLabel')}
                        autoFocus
                        multiline
                        maxLength={8000}
                        editable={!savingNotes}
                        style={[f.input, styles.notes, styles.notesInput, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
                      />
                      {notesError ? <Text accessibilityRole="alert" style={f.error}>{notesError}</Text> : null}
                    </>
                  ) : bookingNotes ? (
                    <Text selectable style={[styles.notesText, { color: palette.text }]}>{bookingNotes}</Text>
                  ) : null}
                </View>
              )}

              <Text style={[f.fieldLabel, { color: palette.muter }]}>{t('bd.charges')}</Text>
              <View style={[styles.card, { backgroundColor: softSurface, borderColor: softBorder }]}>
                <LineRow label={booking.packageName} detail={booking.includedServices?.join(' · ')} value={formatter.format(totals.baseCents / 100)} color={palette.text} muted={palette.muter} />
                {charges.map((charge) => (
                  <LineRow key={charge.id} label={charge.description} detail={describeQuantity(charge, formatter)} value={formatter.format(charge.amount)} color={palette.text} muted={palette.muter} />
                ))}
              </View>
              <BookingMoneySummary totals={totals} formatter={formatter} colors={colors} showPayments depositDueDate={booking.depositDueDate ? formatDate(booking.depositDueDate) : undefined} />

              <Text style={[f.fieldLabel, { color: palette.muter }]}>{t('bd.money')}</Text>
              <View style={[styles.card, { backgroundColor: softSurface, borderColor: softBorder }]}>
                {moneyRows.map((row) => (
                  <View key={row.key} style={[styles.moneyRow, row.key === 'projected' && [styles.moneyDivider, { borderTopColor: palette.border }]]}>
                    <Text style={[styles.moneyLabel, { color: row.strong ? palette.text : palette.muter }]}>{row.label}</Text>
                    <Text style={[styles.moneyValue, { color: palette.text }, row.strong && styles.strong]}>{row.value}</Text>
                  </View>
                ))}
                <Text style={[f.hint, { color: palette.muter }]}>{money?.isCancelled ? t('bd.money.cancelled') : t('bd.money.note')}</Text>
              </View>

              <View style={styles.deliveryHeader}>
                <Text style={[f.fieldLabel, styles.inlineLabel, { color: palette.muter }]}>{t('bd.delivery')}</Text>
                {deliveryState === 'overdue' || deliveryState === 'due_today' ? (
                  <Text style={[styles.badge, { color: deliveryState === 'overdue' ? '#B42318' : '#B26C00', backgroundColor: deliveryState === 'overdue' ? '#FDECEC' : '#FFF6E7' }]}>
                    {t(deliveryState === 'overdue' ? 'bd.delivery.overdue' : 'bd.delivery.dueToday')}
                  </Text>
                ) : null}
              </View>
              {!trackingOpen ? (
                <Pressable accessibilityRole="button" onPress={() => setTrackingOpen(true)} style={({ pressed }) => [f.sectionButton, styles.noTop, { backgroundColor: softInset, borderColor: softBorder }, pressed && f.pressed]}>
                  <Text style={[f.sectionTitle, { color: palette.text }]}>{t('bd.delivery.start')}</Text>
                  <Ionicons name="add" size={18} color={palette.accent} />
                </Pressable>
              ) : (
                <View style={[styles.card, { backgroundColor: softSurface, borderColor: softBorder }]}>
                  <View style={styles.statusGrid}>
                    {FULFILMENT_STATUS_ORDER.map((status) => (
                      <Pressable
                        key={status}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: deliveryStatus === status }}
                        onPress={() => setDeliveryStatus(status)}
                        style={[f.chip, styles.statusChip, { backgroundColor: softInset, borderColor: softBorder }, deliveryStatus === status && { backgroundColor: accentSoft, borderColor: palette.accent }]}>
                        <Text style={[f.chipText, styles.statusChipText, { color: deliveryStatus === status ? palette.accent : palette.text }]}>{t(`bd.status.${status}`)}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <View style={styles.inlineLabelRow}>
                    <Text style={[f.fieldLabel, styles.inlineLabel, { color: palette.muter }]}>{t('bd.delivery.promised')}</Text>
                    {promisedDate ? (
                      <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setPromisedDate('')}>
                        <Text style={[f.textLink, { color: palette.accent }]}>{t('bm.deposit.dueDate.clear')}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  {promisedDate ? (
                    <DatePickerField value={promisedDate} onChange={setPromisedDate} isDarkMode={isDarkMode} palette={palette} />
                  ) : (
                    <Pressable accessibilityRole="button" onPress={() => setPromisedDate(booking.date > localToday() ? booking.date : localToday())} style={styles.textLinkRow}>
                      <Ionicons name="calendar-outline" size={14} color={palette.accent} />
                      <Text style={[f.textLink, { color: palette.accent }]}>{t('bd.delivery.promised.set')}</Text>
                    </Pressable>
                  )}
                  <Text style={[f.fieldLabel, { color: palette.muter }]}>{t('bd.delivery.link')}</Text>
                  <TextInput
                    value={deliveryLink}
                    onChangeText={(value) => { setDeliveryLink(value); setDeliveryError(''); }}
                    placeholder={t('bd.delivery.link.placeholder')}
                    placeholderTextColor={palette.muter}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    style={[f.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
                  />
                  <Text style={[f.fieldLabel, { color: palette.muter }]}>{t('bd.delivery.notes')}</Text>
                  <TextInput
                    value={deliveryNotes}
                    onChangeText={setDeliveryNotes}
                    placeholder={t('bd.delivery.notes.placeholder')}
                    placeholderTextColor={palette.muter}
                    multiline
                    maxLength={2000}
                    style={[f.input, styles.notes, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
                  />
                  {deliveryError ? <Text accessibilityRole="alert" style={f.error}>{deliveryError}</Text> : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: savingDelivery, busy: savingDelivery }}
                    disabled={savingDelivery}
                    onPress={saveDelivery}
                    style={({ pressed }) => [styles.primary, { backgroundColor: palette.accent, shadowColor: palette.accent }, pressed && f.pressed, savingDelivery && styles.busy]}>
                    {savingDelivery ? <ActivityIndicator color="#FFFFFF" size="small" /> : null}
                    <Text style={styles.primaryText}>{savingDelivery ? t('bd.delivery.saving') : t('bd.delivery.save')}</Text>
                  </Pressable>
                </View>
              )}
            </>
        </ScrollView>
      ) : null}
    </BottomSheetModal>
  );
}

function MetaRow({ icon, value, color, muted }: { icon: React.ComponentProps<typeof Ionicons>['name']; value: string; color: string; muted: string }) {
  if (!value) return null;
  return (
    <View style={styles.metaRow}>
      <Ionicons name={icon} size={16} color={muted} />
      <Text style={[styles.metaValue, { color }]}>{value}</Text>
    </View>
  );
}

function LineRow({ label, detail, value, color, muted }: { label: string; detail?: string; value: string; color: string; muted: string }) {
  return (
    <View style={styles.lineRow}>
      <View style={styles.flex}>
        <Text style={[styles.lineLabel, { color }]}>{label}</Text>
        {detail ? <Text style={[styles.lineDetail, { color: muted }]}>{detail}</Text> : null}
      </View>
      <Text style={[styles.lineValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 3 },
  title: { fontSize: 22, fontWeight: '900', letterSpacing: -0.4 },
  subtitle: { fontSize: 13, marginTop: 3 },
  card: { borderWidth: 1, borderRadius: 18, padding: 14 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  metaValue: { flex: 1, marginLeft: 8, fontSize: 13, fontWeight: '600' },
  lineRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 5 },
  lineLabel: { fontSize: 13.5, fontWeight: '700' },
  lineDetail: { fontSize: 12, marginTop: 2 },
  lineValue: { fontSize: 13.5, fontWeight: '700' },
  moneyRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 4 },
  moneyDivider: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 6, paddingTop: 9 },
  moneyLabel: { flex: 1, fontSize: 13, fontWeight: '600' },
  moneyValue: { fontSize: 13, fontWeight: '700' },
  strong: { fontWeight: '800' },
  deliveryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, marginBottom: 8 },
  inlineLabel: { marginTop: 0, marginBottom: 0 },
  inlineLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, marginBottom: 8 },
  badge: { fontSize: 11, fontWeight: '800', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },
  noTop: { marginTop: 0 },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // Two equal columns: basis just under half so two fit beside the gap; minHeight fits a wrapped two-line label.
  statusChip: { flexGrow: 1, flexBasis: '40%', minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  statusChipText: { textAlign: 'center' },
  textLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', minHeight: 28 },
  notes: { minHeight: 76, textAlignVertical: 'top' },
  notesText: { fontSize: 13.5, fontWeight: '500', lineHeight: 20 },
  systemNote: { marginBottom: 10 },
  // Capped so the field, and the Save / Cancel beside the heading, fit above the keyboard.
  notesInput: { maxHeight: 160 },
  notesActions: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  notesAction: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 28 },
  primary: { marginTop: 14, borderRadius: 17, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, shadowOpacity: 0.24, shadowRadius: 12, shadowOffset: { width: 4, height: 7 }, elevation: 5 },
  primaryText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  topBar: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: -4, marginBottom: 4 },
  closeButton: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  busy: { opacity: 0.7 },
});
