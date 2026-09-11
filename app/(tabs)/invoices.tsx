import { SuccessFeedback } from '@/components/feedback/SuccessFeedback';

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { Animated, FlatList, Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePostHog } from 'posthog-react-native';

import { RecordDepositModal } from '@/components/RecordDepositModal';
import { KeyboardDoneButton } from '@/components/KeyboardDoneButton';
import { modalScrollProps } from '@/components/modal-keyboard';
import { UpdatePaymentModal } from '@/components/UpdatePaymentModal';
import { InvoiceActionSheet } from '@/components/invoice/InvoiceActionSheet';
import { InvoiceListCard } from '@/components/invoices/InvoiceListCard';
import { ManagePaymentSheet } from '@/components/invoices/ManagePaymentSheet';
import { DatePickerField } from '@/components/DatePickerField';
import {
  formatTime,
  getSuggestedEndTime,
  getTimeParts,
  to24HourTime,
  TimePickerMenu,
  TimeSelectButton,
  type TimePart,
  type TimePeriod,
} from '@/components/booking/EventTimePicker';
import { addMinutesToTime, parsePackageDurationMinutes } from '@/lib/booking-conflicts';
import { getCurrencyFormatter, useAppData } from '@/context/app-data-context';
import { getThemePalette, useTheme } from '@/context/theme-context';
import { useResponsive } from '@/lib/responsive';
import { useTranslation } from '@/lib/use-translation';
import { isInvoiceClosed } from '@/lib/invoice-lifecycle';
import { getInvoicePaymentSummary } from '@/lib/invoice-payments';
import { buildInvoiceSearchIndex, matchesInvoiceSearch } from '@/lib/invoice-search';
import { shareInvoiceOnWhatsApp } from '@/lib/invoice-sharing';

/** The device's own calendar day, so an invoice counts against the month it was really made in. */
function getLocalDayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function InvoicesScreen() {
  const router = useRouter();
  const { isDarkMode } = useTheme();
  const { customers, bookings, invoices, trashedInvoices, packages, payments, addCustomer, addInvoice, checkPlanLimit, confirmWorkspaceSave, createInvoiceShareLink, refreshInvoiceStatuses, invoiceDraft, setInvoiceDraft, updateInvoiceStatus, currency } = useAppData();
  const posthog = usePostHog();
  const palette = getThemePalette(isDarkMode);
  // Invoice rows are dense text, so they stay one column inside the narrower reading width.
  const { readingStyle, sheetStyle, isPhone } = useResponsive();
  const { t } = useTranslation();
  const currencyFormatter = useMemo(() => getCurrencyFormatter(currency), [currency]);
  const customerMap = new Map(customers.map((customer) => [customer.id, customer]));
  const [searchTerm, setSearchTerm] = useState('');
  const [showComposer, setShowComposer] = useState(Boolean(invoiceDraft));
  const [showSuccess, setShowSuccess] = useState(false);
  const successActive = useRef(false);
  const [customerMode, setCustomerMode] = useState<'existing' | 'manual'>(invoiceDraft ? 'existing' : 'existing');
  const [selectedCustomerId, setSelectedCustomerId] = useState(invoiceDraft?.customerId ?? customers[0]?.id ?? '');
  const [customerQuery, setCustomerQuery] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [selectedPackageId, setSelectedPackageId] = useState(() => {
    return packages.find((item) => item.price === (invoiceDraft?.amount ?? item.price))?.id ?? packages[0]?.id ?? '';
  });
  const [usePackagePrice, setUsePackagePrice] = useState(Boolean(packages.length));
  const [draftAmount, setDraftAmount] = useState(invoiceDraft ? String(invoiceDraft.amount) : packages[0] ? String(packages[0].price) : '');
  const [draftDueDate, setDraftDueDate] = useState(invoiceDraft?.dueDate ?? new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  const [depositInvoiceId, setDepositInvoiceId] = useState<string | null>(null);
  const [paymentInvoiceId, setPaymentInvoiceId] = useState<string | null>(null);
  const [sharingInvoiceId, setSharingInvoiceId] = useState<string | null>(null);
  // The invoice whose money sheet is open, and the header's utility menu.
  const [managePaymentId, setManagePaymentId] = useState<string | null>(null);
  const [showUtilityMenu, setShowUtilityMenu] = useState(false);
  const [openDustbinAfterMenu, setOpenDustbinAfterMenu] = useState(false);
  // Held while the payment sheet slides away, then opened — see the sheet's onClosed hand-off.
  const [pendingPaymentAction, setPendingPaymentAction] = useState<{ kind: 'deposit' | 'payment' | 'paid'; invoiceId: string } | null>(null);
  const [showPaidSuccess, setShowPaidSuccess] = useState(false);
  // The event this invoice bills for. Kept separate from draftDueDate: one is when the job happens,
  // the other is when the money is due.
  const [draftEventDate, setDraftEventDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [draftStartTime, setDraftStartTime] = useState('10:00');
  const [draftEndTime, setDraftEndTime] = useState('11:00');
  // Once the finish time is dialled in by hand it stops following the package, until it is reset.
  const [isEndTimeManual, setIsEndTimeManual] = useState(false);
  const [activeTimePicker, setActiveTimePicker] = useState<'start' | 'finish' | null>(null);
  const [scheduleError, setScheduleError] = useState('');
  const dropdownAnim = useRef(new Animated.Value(0)).current;
  const softSurface = isDarkMode ? '#172033' : '#F7F9FD';
  const softInset = isDarkMode ? '#111A2B' : '#EEF2F8';
  const softBorder = isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.9)';
  const softShadow = isDarkMode ? '#020617' : '#A7B4C8';
  const accentSoft = isDarkMode ? '#29284B' : '#E9E8FF';

  // Held so the sheet keeps rendering its invoice while it slides away.
  const lastManagedInvoice = useRef<{ invoice: (typeof invoices)[number]; summary: ReturnType<typeof getInvoicePaymentSummary> } | null>(null);
  const activeManagedInvoice = invoices.find((item) => item.id === managePaymentId) ?? null;
  if (activeManagedInvoice) {
    lastManagedInvoice.current = {
      invoice: activeManagedInvoice,
      summary: getInvoicePaymentSummary(activeManagedInvoice, payments),
    };
  }
  const managePaymentInvoice = activeManagedInvoice ?? lastManagedInvoice.current?.invoice ?? null;
  const managePaymentSummary = activeManagedInvoice
    ? getInvoicePaymentSummary(activeManagedInvoice, payments)
    : lastManagedInvoice.current?.summary ?? null;

  // Built once per data change rather than per keystroke, so typing stays light on long lists.
  const invoiceSearchIndex = useMemo(() => {
    const customerNames = new Map(customers.map((customer) => [customer.id, customer.name]));
    const bookingsById = new Map(bookings.map((booking) => [booking.id, booking]));
    return new Map(
      invoices.map((invoice) => [
        invoice.id,
        buildInvoiceSearchIndex(invoice, customerNames.get(invoice.customerId) ?? '', bookingsById.get(invoice.bookingId)),
      ]),
    );
  }, [bookings, customers, invoices]);
  const visibleInvoices = useMemo(
    () => invoices.filter((invoice) => {
      const index = invoiceSearchIndex.get(invoice.id);
      return index ? matchesInvoiceSearch(index, searchTerm) : true;
    }),
    [invoiceSearchIndex, invoices, searchTerm],
  );

  const selectedPackage = packages.find((item) => item.id === selectedPackageId) ?? null;
  // Same rule as the booking composer: the finish time follows the package's own duration until it
  // is dialled in by hand.
  const packageDurationMinutes = parsePackageDurationMinutes(selectedPackage?.duration);
  const getPackageEndTime = (startTime: string) =>
    (packageDurationMinutes ? addMinutesToTime(startTime, packageDurationMinutes) : null) ?? getSuggestedEndTime(startTime);
  const timePickerColors = { palette, softInset, softBorder, accentSoft };
  // An invoice raised from a booking already has its slot, so it never opens a second one.
  const isLinkedToBooking = Boolean(invoiceDraft?.bookingId);

  const updateTimePart = (part: TimePart, value: number | string) => {
    if (!activeTimePicker) return;

    const currentParts = getTimeParts(activeTimePicker === 'start' ? draftStartTime : draftEndTime);
    const nextTime = to24HourTime(
      part === 'hour' ? Number(value) : currentParts.hour,
      part === 'minute' ? String(value) : currentParts.minute,
      part === 'period' ? value as TimePeriod : currentParts.period,
    );

    if (activeTimePicker === 'start') {
      setDraftStartTime(nextTime);
      if (!isEndTimeManual) {
        setDraftEndTime(getPackageEndTime(nextTime));
      } else if (draftEndTime <= nextTime) {
        setDraftEndTime(getSuggestedEndTime(nextTime));
      }
    } else {
      setDraftEndTime(nextTime);
      setIsEndTimeManual(true);
    }
    setScheduleError('');
  };

  const toggleTimeMenu = (menu: 'start' | 'finish') => {
    if (activeTimePicker === menu) {
      setActiveTimePicker(null);
      return;
    }

    setActiveTimePicker(menu);
    setShowCustomerDropdown(false);
  };
  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId) ?? null;
  const filteredCustomers = customers.filter((customer) => {
    const searchTerm = customerQuery.trim().toLowerCase();
    if (!searchTerm) {
      return true;
    }
    return customer.name.toLowerCase().includes(searchTerm) || customer.email.toLowerCase().includes(searchTerm);
  });

  useEffect(() => {
    Animated.timing(dropdownAnim, {
      toValue: showCustomerDropdown ? 1 : 0,
      duration: 180,
      useNativeDriver: false,
    }).start();
  }, [dropdownAnim, showCustomerDropdown]);

  // A draft can also arrive while this tab is already mounted (e.g. from a customer profile).
  useEffect(() => {
    if (!invoiceDraft) return;

    const draftPackage = packages.find((item) => item.name === invoiceDraft.serviceName);

    setCustomerMode('existing');
    setSelectedCustomerId(invoiceDraft.customerId);
    setDraftDueDate(invoiceDraft.dueDate);
    setDraftAmount(String(invoiceDraft.amount));
    setUsePackagePrice(false);
    if (draftPackage) {
      setSelectedPackageId(draftPackage.id);
    }
    setShowComposer(true);
  }, [invoiceDraft, packages]);

  useFocusEffect(
    useCallback(() => {
      refreshInvoiceStatuses().catch(() => {});
      const refreshInterval = setInterval(() => {
        refreshInvoiceStatuses().catch(() => {});
      }, 15_000);

      return () => clearInterval(refreshInterval);
    }, [refreshInvoiceStatuses]),
  );

  const handlePackageSelection = (packageId: string) => {
    const chosenPackage = packages.find((item) => item.id === packageId);
    setSelectedPackageId(packageId);
    setUsePackagePrice(true);
    setDraftAmount(String(chosenPackage?.price ?? 0));

    // As in the booking composer, a newly chosen package hands the end time back to its duration
    // unless the end time has been dialled in by hand.
    if (!isEndTimeManual) {
      const minutes = parsePackageDurationMinutes(chosenPackage?.duration);
      setDraftEndTime((minutes ? addMinutesToTime(draftStartTime, minutes) : null) ?? getSuggestedEndTime(draftStartTime));
    }
    setScheduleError('');
  };

  const handleShareInvoice = async (invoice: (typeof invoices)[number]) => {
    setSharingInvoiceId(invoice.id);
    try {
      await shareInvoiceOnWhatsApp({
        invoice,
        customer: customerMap.get(invoice.customerId),
        currencyFormatter,
        createShareLink: createInvoiceShareLink,
      });
    } finally {
      setSharingInvoiceId(null);
    }
  };

  const handleCreateInvoice = () => {
    if (successActive.current) return;
    // The same gate the mutation enforces; checked here only to route into the upgrade flow.
    if (!checkPlanLimit('invoices').allowed) {
      setShowComposer(false);
      router.push({ pathname: '/paywall', params: { reason: 'invoices', returnTo: '/invoices' } });
      return;
    }
    const resolvedAmount = usePackagePrice && selectedPackage ? Number(selectedPackage.price) : Number(draftAmount);
    const amount = resolvedAmount;
    let resolvedCustomerId = selectedCustomerId;

    if (customerMode === 'manual') {
      const trimmedName = manualName.trim();
      const trimmedEmail = manualEmail.trim();

      if (!trimmedName || !trimmedEmail || Number.isNaN(amount) || amount <= 0) {
        return;
      }

      const createdCustomer = {
        name: trimmedName,
        email: trimmedEmail,
        phone: manualPhone.trim(),
        location: 'New customer',
        notes: 'Created from invoice form',
      };

      const savedCustomer = addCustomer(createdCustomer);
      resolvedCustomerId = savedCustomer?.id ?? '';
    }

    if (!resolvedCustomerId || Number.isNaN(amount) || amount <= 0) {
      return;
    }

    const result = addInvoice(
      {
        bookingId: invoiceDraft?.bookingId ?? '',
        customerId: resolvedCustomerId,
        amount,
        dueDate: draftDueDate,
        status: 'Draft',
          sentAt: getLocalDayKey(),
        serviceName: selectedPackage?.name ?? invoiceDraft?.serviceName,
        packageDetails: selectedPackage?.details,
        terms: selectedPackage?.info ?? invoiceDraft?.terms,
      },
      // A booking-raised invoice keeps the slot it already has; only a standalone one books time.
      isLinkedToBooking ? undefined : { date: draftEventDate, startTime: draftStartTime, endTime: draftEndTime },
    );

    // Nothing was written: the form keeps everything the user typed so only the time needs changing.
    if (!result.ok) {
      if (result.limit) {
        setShowComposer(false);
        router.push({ pathname: '/paywall', params: { reason: 'invoices', returnTo: '/invoices' } });
        return;
      }
      setScheduleError(result.error);
      return;
    }

    posthog.capture('invoice_created', {
      customer_source: customerMode,
      source: invoiceDraft ? 'booking' : 'standalone',
      has_event_schedule: !isLinkedToBooking,
    });
    successActive.current = true;
    setShowSuccess(true);
    Keyboard.dismiss();

    setDraftAmount(packages[0] ? String(packages[0].price) : '');
    setDraftDueDate(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
    setDraftEventDate(new Date().toISOString().slice(0, 10));
    setDraftStartTime('10:00');
    setDraftEndTime('11:00');
    setIsEndTimeManual(false);
    setActiveTimePicker(null);
    setScheduleError('');
    setSelectedPackageId(packages[0]?.id ?? '');
    setUsePackagePrice(Boolean(packages.length));
    setSelectedCustomerId(customers[0]?.id ?? '');
    setManualName('');
    setManualEmail('');
    setManualPhone('');
    setCustomerMode('existing');
    setInvoiceDraft(null);
    setShowComposer(false);
  };

  return (
    <SafeAreaView style={[styles.screen, !isPhone && styles.screenBleed, { backgroundColor: palette.background }]}>
      <View style={[styles.headerRow, readingStyle]}>
        <View style={styles.headerTitleGroup}>
          <View style={[styles.headerIcon, { backgroundColor: softSurface, borderColor: softBorder, shadowColor: softShadow }]}>
            <Ionicons name="receipt-outline" size={23} color={palette.accent} />
          </View>
          <View style={styles.headerCopy}>
            <Text style={[styles.eyebrow, { color: palette.accent }]}>{t('invoices.eyebrow')}</Text>
            <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>{t('invoices.title')}</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('invoices.moreActions')}
            accessibilityHint={
              trashedInvoices.length === 0
                ? t('invoices.dustbin.empty')
                : trashedInvoices.length === 1
                  ? t('invoices.dustbin.count.one')
                  : t('invoices.dustbin.count', { count: trashedInvoices.length })
            }
            hitSlop={8}
            onPress={() => setShowUtilityMenu(true)}
            style={({ pressed }) => [styles.utilityButton, pressed && styles.headerActionPressed]}>
            <Ionicons name="ellipsis-horizontal" size={22} color={palette.muter} />
            {trashedInvoices.length ? (
              <View style={[styles.trashBadge, { backgroundColor: palette.accent, borderColor: palette.background }]} />
            ) : null}
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: palette.accent, shadowColor: palette.accent },
              pressed && styles.headerActionPressed,
            ]}
            onPress={() => {
              setInvoiceDraft(null);
              setSelectedPackageId(packages[0]?.id ?? '');
              setUsePackagePrice(Boolean(packages.length));
              setDraftAmount(packages[0] ? String(packages[0].price) : '');
              setShowComposer(true);
            }}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.primaryButtonText}>New</Text>
          </Pressable>
        </View>
      </View>

      <View style={[styles.searchRow, readingStyle]}>
        <View style={[styles.searchField, { backgroundColor: softInset, borderColor: softBorder }]}>
          <Ionicons name="search" size={17} color={palette.muter} />
          <TextInput
            value={searchTerm}
            onChangeText={setSearchTerm}
            style={[styles.searchFieldInput, { color: palette.text }]}
            placeholder={t('invoices.search')}
            placeholderTextColor={palette.muter}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            accessibilityLabel={t('invoices.search.label')}
          />
          {searchTerm.length > 0 && (
            <Pressable
              onPress={() => setSearchTerm('')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('invoices.search.clear')}>
              <Ionicons name="close-circle" size={17} color={palette.muter} />
            </Pressable>
          )}
        </View>
      </View>

      <FlatList
        data={visibleInvoices}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.list, readingStyle]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListEmptyComponent={searchTerm.trim() ? (
          <View style={[styles.emptyState, { backgroundColor: softSurface, borderColor: softBorder, shadowColor: softShadow }]}>
            <Ionicons name="search-outline" size={22} color={palette.muter} />
            <Text style={[styles.emptyText, { color: palette.muter }]}>
              {t('invoices.empty.search', { term: searchTerm.trim() })}
            </Text>
          </View>
        ) : null}
        renderItem={({ item }) => {
          const customer = customerMap.get(item.customerId);
          const summary = getInvoicePaymentSummary(item, payments);

          return (
            <InvoiceListCard
              invoice={item}
              clientName={customer?.name ?? t('invoices.unknownCustomer')}
              summary={summary}
              currencyFormatter={currencyFormatter}
              // Same condition the old action rows used, so nothing gains or loses an action.
              showActions={item.status !== 'Paid' && !isInvoiceClosed(item)}
              isSending={sharingInvoiceId === item.id}
              onOpen={() => router.push({ pathname: '/invoice/[invoiceId]', params: { invoiceId: item.id } })}
              onSend={() => handleShareInvoice(item)}
              onManagePayment={() => setManagePaymentId(item.id)}
            />
          );
        }}
      />

      <RecordDepositModal invoiceId={depositInvoiceId} onClose={() => setDepositInvoiceId(null)} />

      <UpdatePaymentModal invoiceId={paymentInvoiceId} onClose={() => setPaymentInvoiceId(null)} />

      {/* Every row here calls a handler this screen already had — only the labels changed. */}
      <ManagePaymentSheet
        visible={activeManagedInvoice !== null}
        onClosed={() => {
          if (!pendingPaymentAction) return;
          const { kind, invoiceId } = pendingPaymentAction;
          setPendingPaymentAction(null);
          if (kind === 'deposit') setDepositInvoiceId(invoiceId);
          else if (kind === 'payment') setPaymentInvoiceId(invoiceId);
          // Confirmation only after the workspace save is acknowledged — the same signal
          // useConfirmedSave waits on. A failed sync surfaces through the existing sync banner and
          // simply never shows the success card.
          else void confirmWorkspaceSave().then(() => setShowPaidSuccess(true)).catch(() => {});
        }}
        invoice={managePaymentInvoice}
        clientName={managePaymentInvoice ? customerMap.get(managePaymentInvoice.customerId)?.name ?? t('invoices.unknownCustomer') : ''}
        summary={managePaymentSummary}
        currencyFormatter={currencyFormatter}
        onClose={() => setManagePaymentId(null)}
        // The deposit and payment editors are their own modals, so the sheet steps aside first —
        // two native modals must never be on screen at once.
        onUpdateDeposit={() => {
          const invoiceId = managePaymentId;
          setManagePaymentId(null);
          setPendingPaymentAction({ kind: 'deposit', invoiceId: invoiceId ?? '' });
        }}
        onRecordPayment={() => {
          const invoiceId = managePaymentId;
          setManagePaymentId(null);
          setPendingPaymentAction({ kind: 'payment', invoiceId: invoiceId ?? '' });
        }}
        onMarkAsAccepted={() => {
          if (managePaymentId) updateInvoiceStatus(managePaymentId, 'Accepted');
          setManagePaymentId(null);
        }}
        onMarkAsPaid={() => {
          const invoiceId = managePaymentId;
          if (invoiceId) {
            updateInvoiceStatus(invoiceId, 'Paid');
            setPendingPaymentAction({ kind: 'paid', invoiceId });
          }
          setManagePaymentId(null);
        }}
      />

      <Modal visible={showPaidSuccess} transparent animationType="fade" onRequestClose={() => {}}>
        <View style={styles.successBackdrop}>
          <SuccessFeedback
            visible={showPaidSuccess}
            title={t('invoices.paid.title')}
            message={t('invoices.paid.body')}
            onComplete={() => setShowPaidSuccess(false)}
          />
        </View>
      </Modal>

      <InvoiceActionSheet
        visible={showUtilityMenu}
        onClose={() => setShowUtilityMenu(false)}
        onClosed={() => {
          if (!openDustbinAfterMenu) return;
          setOpenDustbinAfterMenu(false);
          router.push('/settings/invoices/trash');
        }}
        title={t('invoices.eyebrow')}
        subtitle={
          trashedInvoices.length === 0
            ? t('invoices.dustbin.empty')
            : trashedInvoices.length === 1
              ? t('invoices.dustbin.subtitle.one')
              : t('invoices.dustbin.subtitle', { count: trashedInvoices.length })
        }
        items={[
          {
            key: 'dustbin',
            icon: 'trash-outline',
            label: t('invoices.dustbin.label'),
            accessibilityHint: t('invoices.dustbin.hint'),
            onPress: () => {
              setOpenDustbinAfterMenu(true);
              setShowUtilityMenu(false);
            },
          },
        ]}
      />

      <Modal visible={showComposer || showSuccess} transparent animationType="slide" onRequestClose={() => { if (!successActive.current) setShowComposer(false); }}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, sheetStyle, { backgroundColor: softSurface, borderColor: softBorder, shadowColor: softShadow }, showSuccess && { display: 'none' }]}>
            <View style={[styles.modalHandle, { backgroundColor: palette.border }]} />
            <View accessibilityElementsHidden={showSuccess} importantForAccessibility={showSuccess ? 'no-hide-descendants' : 'auto'} style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalEyebrow, { color: palette.accent }]}>{t('invoices.create.eyebrow')}</Text>
                <Text style={[styles.modalTitle, { color: palette.text }]}>{t('invoices.create.title')}</Text>
              </View>
              <Pressable
                disabled={showSuccess}
                hitSlop={8}
                style={[styles.closeButton, { backgroundColor: softInset }]}
                onPress={() => {
                  setInvoiceDraft(null);
                  setSelectedPackageId(packages[0]?.id ?? '');
                  setUsePackagePrice(Boolean(packages.length));
                  setDraftAmount(packages[0] ? String(packages[0].price) : '');
                  setShowComposer(false);
                }}>
                <Ionicons name="close" size={24} color={palette.text} />
              </Pressable>
            </View>

            <ScrollView accessibilityElementsHidden={showSuccess} importantForAccessibility={showSuccess ? 'no-hide-descendants' : 'auto'} pointerEvents={showSuccess ? 'none' : 'auto'} {...modalScrollProps} contentContainerStyle={styles.modalScrollContent}>
            <Text style={[styles.fieldLabel, { color: palette.muter }]}>{t('invoices.customerSource')}</Text>
            <View style={styles.modeRow}>
              <Pressable
                onPress={() => setCustomerMode('existing')}
                style={[
                  styles.modeButton,
                  { backgroundColor: softInset, borderColor: softBorder },
                  customerMode === 'existing' && { backgroundColor: accentSoft, borderColor: palette.accent },
                ]}>
                <Text style={[styles.modeButtonText, { color: customerMode === 'existing' ? palette.accent : palette.text }]}>{t('invoices.existingCustomer')}</Text>
              </Pressable>
              <Pressable
                onPress={() => setCustomerMode('manual')}
                style={[
                  styles.modeButton,
                  { backgroundColor: softInset, borderColor: softBorder },
                  customerMode === 'manual' && { backgroundColor: accentSoft, borderColor: palette.accent },
                ]}>
                <Text style={[styles.modeButtonText, { color: customerMode === 'manual' ? palette.accent : palette.text }]}>{t('invoices.manualEntry')}</Text>
              </Pressable>
            </View>

            {customerMode === 'existing' ? (
              <>
                <Text style={[styles.fieldLabel, { color: palette.muter }]}>{t('invoices.selectCustomer')}</Text>
                <Pressable
                  onPress={() => setShowCustomerDropdown((current) => !current)}
                  style={[styles.dropdownButton, { backgroundColor: softInset, borderColor: softBorder }, showCustomerDropdown && { borderColor: palette.accent, backgroundColor: accentSoft }]}>
                  <Text style={[styles.dropdownText, { color: palette.text }]}>{selectedCustomer ? selectedCustomer.name : t('invoices.chooseCustomer')}</Text>
                  <Ionicons name={showCustomerDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={palette.text} />
                </Pressable>

                <Animated.View
                  style={[
                    styles.dropdownPanel,
                    {
                      maxHeight: dropdownAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, 220],
                      }),
                      opacity: dropdownAnim,
                      backgroundColor: softInset,
                      borderColor: softBorder,
                    },
                  ]}>
                  <TextInput
                    value={customerQuery}
                    onChangeText={setCustomerQuery}
                    placeholder={t('invoices.searchCustomer')}
                    placeholderTextColor={palette.muter}
                    style={[styles.searchInput, { backgroundColor: softSurface, borderColor: softBorder, color: palette.text }]}
                  />

                  {/* The list scrolls itself. Without this the rows were laid out in a plain View
                      that the panel simply clipped, so every drag fell through to the form behind
                      it and moved the whole modal instead. Mirrors the booking customer list. */}
                  <ScrollView
                    nestedScrollEnabled
                    keyboardShouldPersistTaps="handled"
                    style={styles.dropdownScroll}
                    contentContainerStyle={styles.dropdownList}>
                    {filteredCustomers.length > 0 ? (
                      filteredCustomers.map((customer) => (
                        <Pressable
                          key={customer.id}
                          onPress={() => {
                            setSelectedCustomerId(customer.id);
                            setCustomerQuery('');
                            setShowCustomerDropdown(false);
                          }}
                          style={[styles.selectOption, styles.customerOption, { backgroundColor: softSurface, borderColor: softBorder }, selectedCustomerId === customer.id && { backgroundColor: accentSoft, borderColor: palette.accent }]}>
                          <Text style={[styles.selectText, { color: palette.text }]}>{customer.name}</Text>
                          <Text style={[styles.selectSubtext, { color: palette.muter }]}>{customer.email}</Text>
                        </Pressable>
                      ))
                    ) : (
                      <Text style={[styles.emptySearchText, { color: palette.muter }]}>{t('invoices.noMatchingCustomer')}</Text>
                    )}
                  </ScrollView>
                </Animated.View>
              </>
            ) : (
              <>
                <Text style={[styles.fieldLabel, { color: palette.muter }]}>{t('invoices.field.customerName')}</Text>
                <TextInput value={manualName} onChangeText={setManualName} style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]} placeholder="Siti Nur Izzah" placeholderTextColor={palette.muter} />

                <Text style={[styles.fieldLabel, { color: palette.muter }]}>{t('invoices.field.customerEmail')}</Text>
                <TextInput value={manualEmail} onChangeText={setManualEmail} style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]} placeholder="siti@example.my" keyboardType="email-address" placeholderTextColor={palette.muter} />

                <Text style={[styles.fieldLabel, { color: palette.muter }]}>{t('invoices.field.customerPhone')}</Text>
                <TextInput value={manualPhone} onChangeText={setManualPhone} style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]} placeholder="+60 12-345 6789" placeholderTextColor={palette.muter} />
              </>
            )}

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>{t('invoices.package')}</Text>
            <View style={styles.selectWrap}>
              <Pressable
                onPress={() => {
                  setSelectedPackageId('');
                  setUsePackagePrice(false);
                  setDraftAmount('');
                }}
                style={[styles.selectOption, { backgroundColor: softInset, borderColor: softBorder }, !usePackagePrice && { backgroundColor: accentSoft, borderColor: palette.accent }]}>
                <Text style={[styles.selectText, { color: palette.text }]}>{t('invoices.customAmount')}</Text>
              </Pressable>
              {packages.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => handlePackageSelection(item.id)}
                  style={[styles.selectOption, { backgroundColor: softInset, borderColor: softBorder }, selectedPackageId === item.id && { backgroundColor: accentSoft, borderColor: palette.accent }]}>
                  <Text style={[styles.selectText, { color: palette.text }]}>
                    {item.name} · <Text style={styles.inlineCurrency}>{currencyFormatter.format(item.price)}</Text>
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>{t('invoices.amount')}</Text>
            <TextInput
              value={draftAmount}
              onChangeText={setDraftAmount}
              keyboardType="numeric"
              style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }, usePackagePrice && selectedPackageId ? styles.inputDisabled : null]}
              placeholder="2500"
              placeholderTextColor={palette.muter}
              editable={!usePackagePrice || !selectedPackageId}
            />

            {isLinkedToBooking ? null : (
              <>
                <Text style={[styles.fieldLabel, { color: palette.muter }]}>{t('invoices.eventDate')}</Text>
                <DatePickerField
                  value={draftEventDate}
                  onChange={(next) => {
                    setDraftEventDate(next);
                    setScheduleError('');
                  }}
                  isDarkMode={isDarkMode}
                  palette={palette}
                />

                <View style={styles.timeRow}>
                  <View style={styles.timeField}>
                    <Text style={[styles.fieldLabel, { color: palette.muter }]}>{t('invoices.startTime')}</Text>
                    <TimeSelectButton
                      value={draftStartTime}
                      accessibilityLabel={`${t('invoices.chooseStartTime')}, ${formatTime(draftStartTime)}`}
                      active={activeTimePicker === 'start'}
                      onPress={() => toggleTimeMenu('start')}
                      colors={timePickerColors}
                    />
                  </View>
                  <View style={styles.timeField}>
                    <Text style={[styles.fieldLabel, { color: palette.muter }]}>{t('invoices.endTime')}</Text>
                    <TimeSelectButton
                      value={draftEndTime}
                      accessibilityLabel={`${t('invoices.chooseEndTime')}, ${formatTime(draftEndTime)}`}
                      active={activeTimePicker === 'finish'}
                      onPress={() => toggleTimeMenu('finish')}
                      colors={timePickerColors}
                    />
                  </View>
                </View>

                {activeTimePicker ? (
                  <TimePickerMenu
                    title={activeTimePicker === 'start' ? t('invoices.chooseStartTime') : t('invoices.chooseEndTime')}
                    value={activeTimePicker === 'start' ? draftStartTime : draftEndTime}
                    onChangePart={updateTimePart}
                    error={draftEndTime <= draftStartTime ? t('invoices.timeRangeError') : undefined}
                    doneDisabled={draftEndTime <= draftStartTime}
                    onDone={() => setActiveTimePicker(null)}
                    colors={timePickerColors}
                  />
                ) : null}

                {scheduleError ? (
                  <Text accessibilityRole="alert" style={styles.scheduleError}>{scheduleError}</Text>
                ) : null}
              </>
            )}

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>{t('invoices.dueDate')}</Text>
            <TextInput
              value={draftDueDate}
              onChangeText={setDraftDueDate}
              style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={palette.muter}
            />

            <Pressable style={[styles.submitButton, { backgroundColor: palette.accent, shadowColor: palette.accent }]} disabled={showSuccess} onPress={handleCreateInvoice}>
              <Text style={styles.submitButtonText}>{t('invoices.save')}</Text>
            </Pressable>
            </ScrollView>
          </View>
          <SuccessFeedback
            visible={showSuccess}
            title={t('invoices.created.title')}
            message={t('invoices.created.body')}
            onComplete={() => {
              successActive.current = false;
              setShowSuccess(false);
            }}
          />

          <KeyboardDoneButton />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    overflow: 'hidden',
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  /** Hands the edge inset to the centred content column, so the two never stack. */
  screenBleed: {
    paddingHorizontal: 0,
  },

  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  /** Mirrors the Customers search field. */
  searchRow: {
    marginBottom: 14,
  },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 44,
  },
  searchFieldInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    padding: 0,
  },
  emptyState: {
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 28,
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 8, height: 10 },
    elevation: 5,
  },
  emptyText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  headerIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 6, height: 7 },
    elevation: 5,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    textTransform: 'uppercase',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 5,
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.45,
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  headerActionPressed: {
    opacity: 0.6,
  },
  utilityButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    position: 'relative',
    width: 40,
  },
  trashBadge: {
    borderRadius: 999,
    borderWidth: 2,
    height: 10,
    position: 'absolute',
    right: 3,
    top: 7,
    width: 10,
  },
  trashBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  primaryButton: {
    alignItems: 'center',
    flexDirection: 'row',
    borderRadius: 16,
    paddingHorizontal: 15,
    paddingVertical: 12,
    shadowOpacity: 0.24,
    shadowRadius: 12,
    shadowOffset: { width: 4, height: 7 },
    elevation: 5,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
    marginLeft: 6,
  },
  list: {
    paddingBottom: 116,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.58)',
    justifyContent: 'flex-end',
  },
  timeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  timeField: {
    flex: 1,
  },
  scheduleError: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    marginTop: 8,
  },
  /** The same dim every other BookFlow success state is presented over. */
  successBackdrop: {
    backgroundColor: 'rgba(15, 23, 42, 0.58)',
    flex: 1,
  },
  modalCard: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
    maxHeight: '92%',
    shadowOpacity: 0.32,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -8 },
    elevation: 14,
  },
  modalHandle: {
    width: 42,
    height: 5,
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 10,
  },
  modalScrollContent: {
    paddingBottom: 4,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  modalEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.65,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  modeButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modeButtonText: {
    fontWeight: '700',
    fontSize: 13,
  },
  selectWrap: {
    gap: 8,
    marginBottom: 12,
  },
  selectOption: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 12,
  },
  dropdownText: {
    fontWeight: '600',
    flex: 1,
  },
  dropdownPanel: {
    overflow: 'hidden',
    borderWidth: 1,
    borderRadius: 18,
    marginBottom: 12,
  },
  dropdownScroll: {
    // Bounded so the list has somewhere to scroll inside the panel's animated 220pt cap, rather
    // than growing past it and being clipped.
    flexGrow: 0,
    flexShrink: 1,
  },
  dropdownList: {
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    margin: 8,
  },
  /** The booking customer list spaces its rows by 8; packages here keep their own `selectWrap` gap. */
  customerOption: {
    marginBottom: 8,
  },
  selectText: {
    fontWeight: '600',
  },
  inlineCurrency: {
    fontSize: 12,
  },
  selectSubtext: {
    fontSize: 12,
    marginTop: 2,
  },
  emptySearchText: {
    fontSize: 12,
    paddingVertical: 10,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    fontSize: 14,
  },
  inputDisabled: {
    opacity: 0.62,
  },
  submitButton: {
    marginTop: 18,
    borderRadius: 17,
    paddingVertical: 15,
    alignItems: 'center',
    shadowOpacity: 0.24,
    shadowRadius: 12,
    shadowOffset: { width: 4, height: 7 },
    elevation: 5,
  },
  submitButtonText: {
    color: '#fff',
    fontWeight: '800',
  },
});
