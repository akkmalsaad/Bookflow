import { useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SuccessFeedback } from '@/components/feedback/SuccessFeedback';
import { useConfirmedSave } from '@/components/feedback/useConfirmedSave';
import { getCurrencyFormatter, useAppData, type Booking, type Invoice, type PackageOption } from '@/context/app-data-context';
import { getThemePalette, useTheme } from '@/context/theme-context';
import { DatePickerField } from '@/components/DatePickerField';
import { KeyboardDoneButton } from '@/components/KeyboardDoneButton';
import { modalScrollProps } from '@/components/modal-keyboard';
import { useResponsive } from '@/lib/responsive';
import { useTranslation } from '@/lib/use-translation';
import { captureEvent } from '@/lib/analytics';
import { getServiceDepositDefault, resolveServiceDepositAmount } from '@/lib/service-defaults';
import { addMinutesToTime, findBookingConflicts, normalizeBookingTime, normalizeBufferMinutes, parsePackageDurationMinutes } from '@/lib/booking-conflicts';
import {
  calculateBookingTotals,
  getBookingBasePrice,
  getBookingDepositTerms,
  normalizeCharges,
  resolveBookingMoney,
  validateChargeDraft,
  type BookingCharge,
  type DepositTerms,
  type DepositType,
} from '@/lib/booking-pricing';
import type { BookingOffer, OfferDetails } from '@/lib/booking-offers';
import { getInvoiceEditSource } from '@/lib/invoice-edit';
import { getInvoicePaymentSummary } from '@/lib/invoice-payments';
import type { TranslationKey } from '@/lib/i18n';
import { BookingChargesEditor, newChargeRow, type ChargeDraftRow } from '@/components/booking/BookingChargesEditor';
import { BookingMoneySummary } from '@/components/booking/BookingMoneySummary';
import { ScheduleConflictNotice } from '@/components/booking/ScheduleConflictNotice';
import { LinkReadyPanel } from '@/components/booking/LinkReadyPanel';
import { bookingFormStyles as f } from '@/components/booking/booking-form-styles';
import { useSubscription } from '@/context/subscription-context';
import { canUseWorkflowFeature } from '@/lib/workflow-entitlements';
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

type ActiveTimePicker = 'start' | 'finish' | null;

/** Renders a resolved deposit for the form; a service without one leaves the field empty. */
function formatDepositDraft(amount: number | null) {
  if (amount === null || amount <= 0) return '';
  // Whole amounts lose the trailing .00 so the field reads the way the user would type it.
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

function formatDisplayDate(dateString: string) {
  const date = new Date(`${dateString}T00:00:00`);
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function addDays(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Today in the device's own timezone — never UTC, which is a day behind in Malaysia before 8am. */
function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** A light format check for the customer's email; the field itself stays the existing one. */
function isEmailAddress(value: string) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim());
}
const SOURCE_PACKAGE_ID = '__source-package';

/**
 * create: a new booking from the Schedule (unchanged behaviour, plus the optional sections).
 * edit: the same form, prefilled, saving over the booking.
 * duplicate: prefilled from another booking; payments, numbers, links, terms acceptance and
 *   delivery progress are never copied, and the date and time must be reviewed before saving.
 * quote: the same form, saving a draft quotation instead of a booking.
 * form: prefilled from a booking form, saving its next version. The form's customer is kept as is.
 * edit with `sourceInvoice` and `onSaveInvoice`: the invoice form, prefilled, saving over the invoice.
 */
export type BookingModalMode = 'create' | 'edit' | 'duplicate' | 'quote' | 'form';

type Props = {
  selectedDate: string;
  onDateChange?: (date: string) => void;
  dueDate?: string;
  onDueDateChange?: (date: string) => void;
  initialCustomerId?: string;
  onClose: () => void;
  /** `bookingId` is the booking the invoice reserved, when it made one. */
  onSaveInvoice?: (input: BookingInvoiceInput) => { ok: true; bookingId?: string } | { ok: false; error: string };
  mode?: BookingModalMode;
  /** The booking being edited or duplicated. */
  sourceBooking?: Booking;
  /** The quotation or booking form being revised. */
  sourceOffer?: BookingOffer;
  /** The invoice being edited (mode 'edit' with onSaveInvoice). */
  sourceInvoice?: Invoice;
};

export type BookingInvoiceInput = {
  customerId?: string;
  newCustomer?: { name: string; email: string; phone: string; location: string; notes: string };
  packageId: string;
  /** The booking total: package price plus additional charges. */
  price: number;
  /** The package price before additional charges. */
  basePrice?: number;
  charges?: BookingCharge[];
  location: string;
  depositAmount?: number;
  depositType?: DepositType;
  depositValue?: number;
  depositDueDate?: string;
  bufferMinutes?: number;
  terms?: string;
  allowConflict?: boolean;
  notes: string;
  date: string;
  startTime: string;
  endTime: string;
};

export function AddBookingModal({ selectedDate, onDateChange, dueDate, onDueDateChange, initialCustomerId, onClose, onSaveInvoice, mode = 'create', sourceBooking, sourceOffer, sourceInvoice }: Props) {
  const showComposer = true;
  const setShowComposer = (visible: boolean) => { if (!visible) onClose(); };
  const router = useRouter();
  const { isDarkMode } = useTheme();
  const {
    packages, bookings, customers, invoices, payments, checkPlanLimit, createBooking, updateBooking,
    updateCustomer, saveQuotation, createBookingForm, reviseBookingForm, currency,
  } = useAppData();
  const { t } = useTranslation();
  const { isPro } = useSubscription();
  const palette = getThemePalette(isDarkMode);
  const { sheetStyle } = useResponsive();
  const currencyFormatter = useMemo(() => getCurrencyFormatter(currency), [currency]);
  const dropdownAnim = useRef(new Animated.Value(0)).current;
  const feedback = useConfirmedSave(showComposer);

  const isEdit = mode === 'edit';
  const isDuplicate = mode === 'duplicate';
  const isQuote = mode === 'quote';
  const isFormEdit = mode === 'form';
  const isInvoiceEdit = isEdit && Boolean(sourceInvoice && onSaveInvoice);
  // An invoice is read into the same shape a booking is, so the form needs no second prefill path.
  const invoiceSource = useMemo(
    () => (sourceInvoice ? getInvoiceEditSource(sourceInvoice, bookings.find((item) => item.id === sourceInvoice.bookingId)) : undefined),
    [bookings, sourceInvoice],
  );
  const source: Booking | undefined = isEdit || isDuplicate ? (isInvoiceEdit ? invoiceSource : sourceBooking) : undefined;
  const sourceDetails: OfferDetails | undefined = isQuote || isFormEdit ? sourceOffer?.details : undefined;
  const sourcePackageId = source?.packageId ?? sourceDetails?.packageId;
  const sourcePackageName = source?.packageName ?? sourceDetails?.packageName;
  const seedPackage = (sourcePackageId ? packages.find((item) => item.id === sourcePackageId) : undefined)
    ?? (sourcePackageName ? packages.find((item) => item.name === sourcePackageName) : undefined);
  const seedBasePrice = source ? getBookingBasePrice(source) : sourceDetails?.basePrice;
  // A booking whose service has since been deleted keeps its own package name and price rather than
  // being silently moved onto another service.
  // An invoice raised for a custom amount has no service at all; it keeps that rather than being
  // given the first service in the list.
  const sourcePackage = useMemo<PackageOption | null>(() => {
    if (seedPackage || (!sourcePackageName && !isInvoiceEdit)) return null;
    return { id: SOURCE_PACKAGE_ID, name: sourcePackageName || t('invoices.customAmount'), details: sourceDetails?.packageDetails ?? '', duration: '', price: seedBasePrice ?? 0, info: '' };
  }, [isInvoiceEdit, seedBasePrice, seedPackage, sourceDetails?.packageDetails, sourcePackageName, t]);
  const packageOptions = useMemo(() => (sourcePackage ? [sourcePackage, ...packages] : packages), [packages, sourcePackage]);
  const initialPackage = seedPackage ?? sourcePackage ?? packages[0];
  const initialPrice = seedBasePrice ?? initialPackage?.price ?? 0;
  // The deposit the booking (or quotation) already has. It is kept exactly as stored — a percentage
  // stays a percentage, a due date stays — unless the owner types a new amount into the field.
  const sourceDeposit: DepositTerms | null = source ? getBookingDepositTerms(source) : sourceDetails?.deposit ?? null;
  const initialDepositDraft = source || sourceDetails
    ? formatDepositDraft(source?.depositAmount ?? (sourceDeposit?.type === 'fixed' ? sourceDeposit.value : null))
    : formatDepositDraft(resolveServiceDepositAmount(initialPackage, initialPrice));

  const [draftNotes, setDraftNotes] = useState(source?.notes ?? sourceDetails?.notes ?? '');
  const sourceCustomerId = source?.customerId ?? (isQuote ? sourceOffer?.customerId : undefined);
  const [selectedCustomerId, setSelectedCustomerId] = useState(sourceCustomerId ?? initialCustomerId ?? customers[0]?.id ?? '');
  const [customerMode, setCustomerMode] = useState<'existing' | 'new'>(sourceCustomerId || initialCustomerId || customers.length ? 'existing' : 'new');
  const [customerQuery, setCustomerQuery] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerEmail, setNewCustomerEmail] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerLocation, setNewCustomerLocation] = useState('');
  const [selectedPackageId, setSelectedPackageId] = useState(initialPackage?.id ?? '');
  const [showPackageDropdown, setShowPackageDropdown] = useState(false);
  const [draftPrice, setDraftPrice] = useState(String(initialPrice));
  const [draftDeposit, setDraftDeposit] = useState(initialDepositDraft);
  // Mirrors isEndTimeManual: once the deposit is typed by hand it stops tracking the service and
  // the price, until a different service is chosen. A prefilled booking's deposit is its own.
  const [isDepositManual, setIsDepositManual] = useState(Boolean(source || sourceDetails));
  // True once the owner types into the deposit field; until then a stored deposit is kept as-is.
  const [depositEdited, setDepositEdited] = useState(false);
  const sourceStart = normalizeBookingTime(source?.startTime ?? source?.time ?? sourceDetails?.startTime);
  const sourceEnd = normalizeBookingTime(source?.endTime ?? sourceDetails?.endTime);
  const [draftStartTime, setDraftStartTime] = useState(sourceStart ?? '10:00');
  const [draftEndTime, setDraftEndTime] = useState(sourceEnd ?? (addMinutesToTime('10:00', parsePackageDurationMinutes(initialPackage?.duration) ?? 60)) ?? '11:00');
  // Once the finish time is dialled in by hand it stops following the package, until it is reset.
  const [isEndTimeManual, setIsEndTimeManual] = useState(Boolean(sourceEnd));
  const [activeTimePicker, setActiveTimePicker] = useState<ActiveTimePicker>(null);
  const isTimePickerOpen = activeTimePicker !== null;
  const [draftLocation, setDraftLocation] = useState(source?.location ?? sourceDetails?.location ?? '');
  const [formError, setFormError] = useState('');
  // The date is the Schedule's selected day for a new booking, exactly as before. Edits, duplicates
  // and quotations carry their own date, so the field becomes editable for them.
  const [localDate, setLocalDate] = useState(source?.date ?? sourceDetails?.date ?? selectedDate);
  const effectiveDate = onDateChange || mode === 'create' ? selectedDate : localDate;
  const changeDate = onDateChange ?? (mode === 'create' ? undefined : setLocalDate);
  const [chargeRows, setChargeRows] = useState<ChargeDraftRow[]>(() =>
    normalizeCharges(source?.charges ?? sourceDetails?.charges).map((charge) =>
      newChargeRow({ description: charge.description, quantity: String(charge.quantity), unitPrice: String(charge.unitPrice), unit: charge.unit, addOnId: charge.addOnId }),
    ),
  );
  const [showCharges, setShowCharges] = useState(chargeRows.length > 0);
  const [chargeError, setChargeError] = useState('');
  // No longer edited in this modal; a booking keeps its own buffer and a new one takes the service's.
  const [bufferMinutes, setBufferMinutes] = useState(normalizeBufferMinutes(source?.bufferMinutes ?? sourceDetails?.bufferMinutes ?? initialPackage?.bufferMinutes));
  const [terms, setTerms] = useState(source?.terms ?? sourceDetails?.terms ?? initialPackage?.info ?? '');
  // For an existing customer saved without an email, the owner can add it here.
  const [existingCustomerEmail, setExistingCustomerEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [allowConflict, setAllowConflict] = useState(false);
  // The booking this form has just saved. It stays on screen while the save is confirmed (and on a
  // retry), and must never be reported as clashing with itself.
  const [savedBookingId, setSavedBookingId] = useState<string | null>(null);
  // A duplicate keeps its source's date and time only once the owner has looked at them.
  const [scheduleReviewed, setScheduleReviewed] = useState(!isDuplicate);
  const [validUntil, setValidUntil] = useState(sourceOffer?.validUntil ?? addDays(todayKey(), 30));
  const [sendingForm, setSendingForm] = useState(false);
  // Blocks a second tap that lands before `sendingForm` has re-rendered the button, so one tap
  // publishes one form.
  const sendingFormRef = useRef(false);
  const [formLink, setFormLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [unchangedInvoices, setUnchangedInvoices] = useState<string[]>([]);

  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId) ?? null;
  const filteredCustomers = customers.filter((customer) => {
    const searchTerm = customerQuery.trim().toLowerCase();
    if (!searchTerm) return true;
    return customer.name.toLowerCase().includes(searchTerm) || customer.email.toLowerCase().includes(searchTerm);
  });

  useEffect(() => {
    Animated.timing(dropdownAnim, {
      toValue: showCustomerDropdown ? 1 : 0,
      duration: 180,
      useNativeDriver: false,
    }).start();
  }, [dropdownAnim, showCustomerDropdown]);

  const selectedPackage = packageOptions.find((item) => item.id === selectedPackageId) ?? packageOptions[0];
  const packageDurationMinutes = parsePackageDurationMinutes(selectedPackage?.duration);

  /**
   * The finish time a package implies for a given start. Packages whose duration cannot be read
   * ("Half day") fall back to the previous +1 hour default rather than inventing a length.
   */
  const getPackageEndTime = (startTime: string, durationMinutes = packageDurationMinutes) =>
    (durationMinutes ? addMinutesToTime(startTime, durationMinutes) : null) ?? getSuggestedEndTime(startTime);

  const handlePackageSelection = (packageId: string) => {
    const chosenPackage = packageOptions.find((item) => item.id === packageId);
    const nextPrice = chosenPackage?.price ?? 0;
    setSelectedPackageId(packageId);
    setDraftPrice(String(nextPrice));
    if (!isEndTimeManual) {
      setDraftEndTime(getPackageEndTime(draftStartTime, parsePackageDurationMinutes(chosenPackage?.duration)));
    }
    // Deliberately choosing another service re-fills the deposit even after a manual edit, which is
    // the one case where overwriting what was typed is what the user is asking for.
    setDraftDeposit(formatDepositDraft(resolveServiceDepositAmount(chosenPackage, nextPrice)));
    setIsDepositManual(false);
    setDepositEdited(true);
    setBufferMinutes(normalizeBufferMinutes(chosenPackage?.bufferMinutes));
    // A new package can move the finish time and the buffer, so an earlier "Book anyway" no longer
    // describes the slot being booked.
    setAllowConflict(false);
    setTerms(chosenPackage?.info ?? '');
    setShowPackageDropdown(false);
  };

  // Says where the prefilled figure came from, and stays honest once it has been overridden.
  const serviceDeposit = getServiceDepositDefault(selectedPackage);
  const depositHint = isDepositManual
    ? t('bookings.deposit.manual')
    : serviceDeposit
      ? serviceDeposit.type === 'percent'
        ? t('bookings.deposit.percent', { value: serviceDeposit.value, service: selectedPackage?.name ?? t('bookings.deposit.thisService') })
        : t('bookings.deposit.fixed', { service: selectedPackage?.name ?? t('bookings.deposit.thisService') })
      : t('bookings.deposit.none');

  /** Hands the finish time back to the package after it has been overridden. */
  const resetEndTimeToPackage = () => {
    setIsEndTimeManual(false);
    setDraftEndTime(getPackageEndTime(draftStartTime));
    setAllowConflict(false);
    setFormError('');
  };

  const markScheduleChanged = () => {
    setScheduleReviewed(true);
    setAllowConflict(false);
  };

  const updateTimePart = (part: TimePart, value: number | string) => {
    if (!activeTimePicker) return;

    const currentTime = activeTimePicker === 'start' ? draftStartTime : draftEndTime;
    const currentParts = getTimeParts(currentTime);
    const nextTime = to24HourTime(
      part === 'hour' ? Number(value) : currentParts.hour,
      part === 'minute' ? String(value) : currentParts.minute,
      part === 'period' ? value as TimePeriod : currentParts.period,
    );

    if (activeTimePicker === 'start') {
      setDraftStartTime(nextTime);
      if (!isEndTimeManual) {
        // Keeps the booking the length the package says it is as the start moves.
        setDraftEndTime(getPackageEndTime(nextTime));
      } else if (draftEndTime <= nextTime) {
        setDraftEndTime(getSuggestedEndTime(nextTime));
      }
    } else {
      setDraftEndTime(nextTime);
      setIsEndTimeManual(true);
    }
    markScheduleChanged();
    setFormError('');
  };

  const toggleTimeMenu = (menu: 'start' | 'finish') => {
    if (activeTimePicker === menu) {
      setActiveTimePicker(null);
      return;
    }

    setActiveTimePicker(menu);
    setShowCustomerDropdown(false);
    setShowPackageDropdown(false);
  };

  // ------------------------------------------------------------------ live money and schedule
  const parsedRows = useMemo(() => chargeRows.map((row) => validateChargeDraft(row, () => row.key)), [chargeRows]);
  const validCharges = parsedRows.flatMap((result) => (result.ok ? [result.charge] : []));
  const numericPrice = Number(draftPrice);
  const trimmedDeposit = draftDeposit.trim();
  // A stored deposit (percentage, due date and all) is kept until the owner types a new amount.
  const keepsStoredDeposit = Boolean(sourceDeposit) && !depositEdited;
  const storedDueDate = sourceDeposit?.dueDate;
  const depositTerms: DepositTerms | null = keepsStoredDeposit
    ? sourceDeposit
    : trimmedDeposit && Number(trimmedDeposit) > 0
      ? { type: 'fixed', value: Number(trimmedDeposit), ...(storedDueDate ? { dueDate: storedDueDate } : {}) }
      : null;
  const linkedInvoices = isInvoiceEdit && sourceInvoice ? [sourceInvoice] : source && isEdit ? invoices.filter((invoice) => invoice.bookingId === source.id) : [];
  const paidCents = linkedInvoices.reduce((sum, invoice) => sum + Math.round(getInvoicePaymentSummary(invoice, payments).amountPaid * 100), 0);
  const totals = calculateBookingTotals({
    basePrice: Number.isFinite(numericPrice) && numericPrice > 0 ? numericPrice : 0,
    charges: validCharges,
    deposit: depositTerms,
    paidCents,
  });
  const showSummary = chargeRows.length > 0 || totals.depositDueCents > 0 || isEdit;

  const startTimeKey = normalizeBookingTime(draftStartTime);
  const endTimeKey = normalizeBookingTime(draftEndTime);
  // Excluded by id: the booking being edited, or the one this form has already saved. A duplicate's
  // original is a different booking and still counts.
  const ownBookingId = isEdit ? source?.id : savedBookingId ?? undefined;
  const conflicts = useMemo(
    () => (startTimeKey && endTimeKey
      ? findBookingConflicts(bookings, { date: effectiveDate, startTime: startTimeKey, endTime: endTimeKey, bufferMinutes }, ownBookingId)
      : []),
    [bookings, bufferMinutes, effectiveDate, endTimeKey, ownBookingId, startTimeKey],
  );
  const hasOverlap = conflicts.some((item) => item.kind === 'overlap');

  const depositErrorKey = (error: string): TranslationKey => {
    if (error === 'deposit_percent') return 'bm.error.depositPercent';
    if (error === 'deposit_too_high') return 'bm.error.depositTotal';
    if (error === 'charges') return 'bm.error.charges';
    if (error === 'price') return 'bookings.error.fields';
    return 'bookings.error.deposit';
  };

  /**
   * Everything the save paths share: the charges, the deposit, the schedule and the conflict
   * decision, validated once. Returns null (with the error shown) when anything needs attention.
   */
  const collectForm = () => {
    if (!scheduleReviewed) {
      setFormError(t('bm.error.reviewSchedule'));
      return null;
    }
    const startTime = normalizeBookingTime(draftStartTime);
    const endTime = normalizeBookingTime(draftEndTime);
    if (!selectedPackage || Number.isNaN(numericPrice) || numericPrice <= 0 || !startTime || !endTime || endTime <= startTime) {
      setFormError(t('bookings.error.fields'));
      return null;
    }

    const firstInvalid = parsedRows.find((result) => !result.ok);
    if (firstInvalid && !firstInvalid.ok) {
      setShowCharges(true);
      setChargeError(t(firstInvalid.error === 'description' ? 'bm.charges.error.description' : firstInvalid.error === 'quantity' ? 'bm.charges.error.quantity' : 'bm.charges.error.price'));
      setFormError(t('bm.error.charges'));
      return null;
    }
    setChargeError('');

    // Blank means no deposit, which is a perfectly normal booking — only a typed value is checked.
    const numericDeposit = !keepsStoredDeposit && trimmedDeposit ? Number(trimmedDeposit) : 0;
    if (!keepsStoredDeposit && trimmedDeposit && (Number.isNaN(numericDeposit) || numericDeposit < 0)) {
      setFormError(t('bookings.error.deposit'));
      return null;
    }
    if (numericDeposit > totals.totalCents / 100) {
      setFormError(t('bookings.error.depositTooHigh'));
      return null;
    }
    // An untouched stored deposit is passed back exactly; a typed amount is a plain deposit amount,
    // as it was before deposit types existed. A stored due date is never dropped.
    // A booking saved with a plain amount (no deposit type) stays a plain amount.
    const sourceHasTypedDeposit = source ? Boolean(source.depositType) : true;
    const depositInput = keepsStoredDeposit && sourceDeposit
      ? sourceHasTypedDeposit
        ? { depositType: sourceDeposit.type, depositValue: sourceDeposit.value, ...(storedDueDate ? { depositDueDate: storedDueDate } : {}) }
        : { depositAmount: sourceDeposit.value, ...(storedDueDate ? { depositDueDate: storedDueDate } : {}) }
      : numericDeposit > 0
        ? { depositAmount: numericDeposit, ...(storedDueDate ? { depositDueDate: storedDueDate } : {}) }
        : {};
    const money = resolveBookingMoney({ price: numericPrice, basePrice: numericPrice, charges: validCharges, ...depositInput });
    if (!money.ok) {
      setFormError(t(depositErrorKey(money.error)));
      return null;
    }
    // A plain booking (no charges) is stored exactly as before: its price is the package price.
    const fields = validCharges.length ? money.fields : { ...money.fields, basePrice: undefined };

    if (hasOverlap && !allowConflict && !isQuote) {
      setFormError(t('bm.conflict.hint'));
      return null;
    }

    const isSourcePackage = selectedPackage.id === SOURCE_PACKAGE_ID;
    // A booking keeps the deliverables it was agreed with while its package is unchanged.
    const keepsSourceServices = Boolean(source) && (isSourcePackage || selectedPackage.id === source?.packageId || selectedPackage.name === source?.packageName);
    const includedServices = keepsSourceServices ? source?.includedServices ?? selectedPackage.includedServices : selectedPackage.includedServices;

    return {
      startTime,
      endTime,
      fields,
      packageId: isSourcePackage ? undefined : selectedPackage.id,
      includedServices: includedServices?.length ? includedServices : undefined,
      details: {
        title: selectedPackage.name,
        ...(isSourcePackage ? {} : { packageId: selectedPackage.id }),
        packageName: selectedPackage.name,
        packageDetails: selectedPackage.details || undefined,
        includedServices: includedServices ?? [],
        basePrice: numericPrice,
        charges: validCharges,
        deposit: depositTerms,
        date: effectiveDate,
        startTime,
        endTime,
        bufferMinutes,
        location: draftLocation.trim(),
        notes: draftNotes.trim(),
        terms: terms.trim(),
        acceptedConflictIds: allowConflict ? conflicts.map((item) => item.booking.id) : [],
      } satisfies OfferDetails,
    };
  };

  const newCustomerInput = (notes: string) => ({
    name: newCustomerName,
    email: newCustomerEmail.trim(),
    phone: newCustomerPhone,
    location: newCustomerLocation,
    notes,
  });

  // A new booking (or an invoice made with one) needs the customer's email. Editing and quotations
  // never block on it, so older records without one stay editable.
  const requiresEmail = !isEdit && !isQuote;
  const existingCustomerMissingEmail = customerMode === 'existing' && Boolean(selectedCustomer) && !selectedCustomer?.email.trim();

  /**
   * Checks the email the save will use. Returns the email to add to an existing customer that has
   * none (or '' when nothing needs adding), or null with the inline error shown.
   */
  const checkCustomerEmail = (): string | null => {
    const typed = customerMode === 'new' ? newCustomerEmail.trim() : existingCustomerMissingEmail ? existingCustomerEmail.trim() : '';
    const hasEmail = customerMode === 'new' ? Boolean(typed) : !existingCustomerMissingEmail || Boolean(typed);
    const error = !hasEmail
      ? (requiresEmail ? t('bm.email.required') : '')
      : typed && !isEmailAddress(typed) ? t('bm.email.invalid') : '';
    setEmailError(error);
    if (error) {
      setFormError(error);
      return null;
    }
    return customerMode === 'existing' && existingCustomerMissingEmail ? typed : '';
  };

  /** Saves the email the owner just supplied onto the existing customer, before the booking is made. */
  const addEmailToExistingCustomer = (email: string) => {
    if (!email || !selectedCustomerId) return true;
    if (updateCustomer(selectedCustomerId, { email })) return true;
    setFormError(t('bookings.error.save'));
    return false;
  };

  const handleAddBooking = () => feedback.run(() => {
    const limitKind = onSaveInvoice ? 'invoices' : 'bookings';
    // The same gate the mutation enforces; checked here only to route into the upgrade flow.
    // Editing and quotations create no booking, so they never meet it.
    if ((mode === 'create' || isDuplicate) && !checkPlanLimit(limitKind).allowed) {
      setShowComposer(false);
      router.push({ pathname: '/paywall', params: { reason: limitKind, returnTo: onSaveInvoice ? '/invoices' : '/bookings' } });
      // `false` leaves useConfirmedSave untouched: nothing was mutated, so nothing awaits a save.
      return false;
    }

    // A booking form keeps the customer it was prepared for (or none), so only its details are saved.
    if (isFormEdit) {
      const form = collectForm();
      if (!form || !sourceOffer) return false;
      const result = reviseBookingForm(sourceOffer.id, form.details);
      if (!result.ok) {
        setFormError(result.error ?? t('bookings.error.save'));
        return false;
      }
      captureEvent('booking_form_revised', { has_charges: validCharges.length > 0, change_requested: sourceOffer.status === 'change_requested' });
      return true;
    }

    const isNewCustomerValid = Boolean(newCustomerName.trim());
    const hasValidCustomer = customerMode === 'existing' ? Boolean(selectedCustomerId) : isNewCustomerValid;
    if (!hasValidCustomer) {
      setFormError(t(isQuote ? 'bm.quote.customerRequired' : 'bookings.error.fields'));
      return false;
    }

    const emailToAdd = checkCustomerEmail();
    if (emailToAdd === null) return false;

    const form = collectForm();
    if (!form) return false;
    if (!addEmailToExistingCustomer(emailToAdd)) return false;
    const { startTime, endTime, fields, details } = form;
    // An edited invoice keeps an empty location empty rather than gaining the placeholder.
    const location = draftLocation.trim() || (isInvoiceEdit ? '' : 'Client location');
    const hasDeposit = Boolean(fields.depositAmount && fields.depositAmount > 0);

    if (isQuote) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) {
        setFormError(t('bookings.error.fields'));
        return false;
      }
      const result = saveQuotation({
        offerId: sourceOffer?.id,
        customerId: customerMode === 'existing' ? selectedCustomerId : undefined,
        newCustomer: customerMode === 'new' ? newCustomerInput('Created while preparing a quotation.') : undefined,
        details,
        validUntil,
      });
      if (!result.ok) {
        if (result.error === 'limit') {
          setShowComposer(false);
          router.push({ pathname: '/paywall', params: { reason: 'customers', returnTo: '/offers' } });
          return false;
        }
        setFormError(result.error);
        return false;
      }
      captureEvent('quotation_saved', { revised: Boolean(sourceOffer), has_charges: validCharges.length > 0 });
      return true;
    }

    // Invoice submissions must use the invoice mutation, never createBooking.
    if (onSaveInvoice) {
      const result = onSaveInvoice({
        customerId: customerMode === 'existing' ? selectedCustomerId : undefined,
        newCustomer: customerMode === 'new' ? newCustomerInput('Created from invoice form') : undefined,
        packageId: selectedPackage.id,
        price: fields.price,
        basePrice: fields.basePrice,
        charges: fields.charges,
        location,
        depositAmount: fields.depositAmount,
        depositType: fields.depositType,
        depositValue: fields.depositValue,
        depositDueDate: fields.depositDueDate,
        bufferMinutes,
        terms: terms.trim() || undefined,
        allowConflict,
        notes: draftNotes.trim(),
        date: effectiveDate,
        startTime,
        endTime,
      });
      if (!result.ok) {
        setFormError(result.error);
        return false;
      }
      if (result.bookingId) setSavedBookingId(result.bookingId);
      return true;
    }

    const input = {
      customerId: customerMode === 'existing' ? selectedCustomerId : undefined,
      newCustomer: customerMode === 'new' ? newCustomerInput(isEdit ? 'Created while editing a booking.' : 'Created while adding a booking.') : undefined,
      title: selectedPackage.name,
      date: effectiveDate,
      time: startTime,
      startTime,
      endTime,
      location,
      packageName: selectedPackage.name,
      ...(form.packageId ? { packageId: form.packageId } : {}),
      // The values finally on the form, not the service's — editing the service later must never
      // reach back into this booking.
      ...fields,
      ...(bufferMinutes ? { bufferMinutes } : {}),
      ...(form.includedServices ? { includedServices: form.includedServices } : {}),
      ...(terms.trim() ? { terms: terms.trim() } : {}),
      allowConflict,
      status: 'Inquiry' as const,
      notes: draftNotes.trim() || 'New booking created from quick add.',
    };

    if (isEdit && source) {
      const result = updateBooking(source.id, { ...input, status: source.status, notes: draftNotes.trim() || source.notes });
      if (!result.ok) {
        if (result.error === 'limit') {
          setShowComposer(false);
          router.push({ pathname: '/paywall', params: { reason: 'customers', returnTo: '/bookings' } });
          return false;
        }
        setFormError(result.error ?? t('bookings.error.save'));
        return false;
      }
      setUnchangedInvoices(result.unchangedInvoiceNumbers ?? []);
      captureEvent('booking_edited', { has_charges: validCharges.length > 0, has_deposit: hasDeposit });
      return true;
    }

    const result = createBooking(input);

    if (!result) {
      setFormError(t('bookings.error.save'));
      return false;
    }
    setSavedBookingId(result.booking.id);

    captureEvent(isDuplicate ? 'booking_duplicated' : 'booking_created', {
      customer_source: customerMode,
      has_deposit: hasDeposit,
      has_charges: validCharges.length > 0,
      conflict_override: allowConflict,
    });
    return true;
  });

  /** Publishes a booking form from what is on the form. Nothing is booked and no number is used. */
  const handleSendForm = async () => {
    if (sendingForm || sendingFormRef.current || feedback.saving) return;
    setFormError('');
    const form = collectForm();
    if (!form) return;
    sendingFormRef.current = true;
    setSendingForm(true);
    try {
      const result = await createBookingForm({
        details: form.details,
        customerId: customerMode === 'existing' && selectedCustomerId ? selectedCustomerId : undefined,
        // The customer always gives an email on the form, so sending it never waits on one here.
        requireEmail: true,
      });
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      captureEvent('booking_form_sent', { has_charges: validCharges.length > 0, has_deposit: Boolean(depositTerms) });
      setFormLink({ url: result.url, expiresAt: result.expiresAt });
    } finally {
      sendingFormRef.current = false;
      setSendingForm(false);
    }
  };

  const completeBooking = () => {
    setShowComposer(false);
    setActiveTimePicker(null);
    setDraftNotes('');
    setCustomerQuery('');
    setShowCustomerDropdown(false);
    setFormError('');
  };

  const softSurface = isDarkMode ? '#172033' : '#F7F9FD';
  const softInset = isDarkMode ? '#111A2B' : '#EEF2F8';
  const softBorder = isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.9)';
  const softShadow = isDarkMode ? '#020617' : '#A7B4C8';
  const accentSoft = isDarkMode ? '#29284B' : '#E9E8FF';
  const timePickerColors = { palette, softInset, softBorder, accentSoft };
  const formColors = { palette, softSurface, softInset, softBorder, accentSoft };

  const eyebrowKey: TranslationKey = isInvoiceEdit ? 'invoices.edit.eyebrow' : onSaveInvoice ? 'invoices.create.eyebrow' : isEdit ? 'bm.edit.eyebrow' : isDuplicate ? 'bm.duplicate.eyebrow' : isQuote ? 'bm.quote.eyebrow' : isFormEdit ? 'bm.formEdit.eyebrow' : 'bookings.create.eyebrow';
  const titleKey: TranslationKey = isInvoiceEdit ? 'invoices.edit.title' : onSaveInvoice ? 'invoices.create.title' : isEdit ? 'bm.edit.title' : isDuplicate ? 'bm.duplicate.title' : isQuote ? (sourceOffer ? 'bm.quote.editTitle' : 'bm.quote.title') : isFormEdit ? 'bm.formEdit.title' : 'bookings.create.title';
  const saveKey: TranslationKey = isInvoiceEdit ? 'bm.edit.save' : onSaveInvoice ? 'invoices.save' : isEdit ? 'bm.edit.save' : isQuote ? 'bm.quote.save' : isFormEdit ? 'bm.formEdit.save' : 'bookings.save';
  const successTitleKey: TranslationKey = isInvoiceEdit ? 'invoices.edit.saved.title' : onSaveInvoice ? 'invoices.created.title' : isEdit ? 'bm.edit.saved.title' : isQuote ? 'bm.quote.saved.title' : isFormEdit ? 'bm.formEdit.saved.title' : 'bookings.created.title';
  const successBody = isInvoiceEdit
    ? t('invoices.edit.saved.body')
    : onSaveInvoice
    ? t('invoices.created.body')
    : isEdit
      ? unchangedInvoices.length ? t('bm.edit.invoiceUnchanged', { number: unchangedInvoices.join(', ') }) : t('bm.edit.saved.body')
      : isQuote ? t('bm.quote.saved.body') : isFormEdit ? t('bm.formEdit.saved.body') : t('bookings.created.body');
  const canSendForm = mode === 'create' && !onSaveInvoice && canUseWorkflowFeature('bookingForms', isPro);
  const busy = feedback.saving || feedback.success || sendingForm;

  return (
      <Modal visible={showComposer} transparent animationType="slide" onRequestClose={() => { if (!busy) setShowComposer(false); }}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, sheetStyle, { backgroundColor: softSurface, borderColor: softBorder, shadowColor: softShadow }, feedback.success && { display: 'none' }]}>
            <View style={[styles.modalHandle, { backgroundColor: palette.border }]} />
            <View accessibilityElementsHidden={feedback.success} importantForAccessibility={feedback.success ? 'no-hide-descendants' : 'auto'} style={styles.modalHeader}>
              <View style={styles.headerCopy}>
                <Text style={[styles.modalEyebrow, { color: palette.accent }]}>{t(eyebrowKey)}</Text>
                <Text style={[styles.modalTitle, { color: palette.text }]}>{formLink ? t('bm.sendForm.title') : t(titleKey)}</Text>
              </View>
              <Pressable disabled={busy} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('of.cancel')} onPress={() => setShowComposer(false)} style={[styles.closeButton, { backgroundColor: softInset }]}>
                <Ionicons name="close" size={24} color={palette.text} />
              </Pressable>
            </View>

            <ScrollView
              accessibilityElementsHidden={feedback.success}
              importantForAccessibility={feedback.success ? 'no-hide-descendants' : 'auto'}
              {...modalScrollProps}
              // The wheels own every vertical gesture while a picker is open, so the form behind
              // them cannot scroll out from under the finger.
              scrollEnabled={!isTimePickerOpen}
              contentContainerStyle={styles.modalScrollContent}>

            {formLink ? (
              <LinkReadyPanel
                title={t('bm.sendForm.title')}
                body={t('bm.sendForm.body')}
                url={formLink.url}
                expiresAt={formLink.expiresAt}
                phone={customerMode === 'existing' ? selectedCustomer?.phone : newCustomerPhone}
                colors={formColors}
                onDone={() => setShowComposer(false)}
              />
            ) : (
            <>
            <View pointerEvents={feedback.pending || sendingForm ? 'none' : 'auto'}>
            <Text style={[styles.fieldLabel, { color: palette.muter }]}>{t('bookings.package')}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('bookings.choosePackage')}
              onPress={() => {
                setShowPackageDropdown((current) => !current);
                setShowCustomerDropdown(false);
              }}
              style={[
                styles.dropdownButton,
                { backgroundColor: softInset, borderColor: softBorder },
                showPackageDropdown && { borderColor: palette.accent, backgroundColor: accentSoft },
              ]}>
              <View style={styles.packageSelectedCopy}>
                <Text style={[styles.packageSelectedName, { color: palette.text }]}>{selectedPackage?.name ?? 'Choose a package'}</Text>
                {selectedPackage ? (
                  <Text style={[styles.packageSelectedMeta, { color: palette.muter }]}>
                    {[selectedPackage.duration, currencyFormatter.format(selectedPackage.price)].filter(Boolean).join(' · ')}
                  </Text>
                ) : null}
              </View>
              <Ionicons name={showPackageDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={palette.text} />
            </Pressable>

            {showPackageDropdown && (
              <View style={[styles.packageDropdownPanel, { backgroundColor: softInset, borderColor: softBorder }]}>
                <ScrollView showsVerticalScrollIndicator={false} nestedScrollEnabled keyboardShouldPersistTaps="handled" style={styles.packageDropdownScroll}>
                  {packageOptions.map((item) => (
                    <Pressable
                      key={item.id}
                      onPress={() => handlePackageSelection(item.id)}
                      style={[
                        styles.packageOption,
                        { backgroundColor: softSurface, borderColor: softBorder },
                        selectedPackageId === item.id && { backgroundColor: accentSoft, borderColor: palette.accent },
                      ]}>
                      <View style={styles.packageOptionHeader}>
                        <Text style={[styles.packageOptionText, { color: palette.text }]}>{item.name}</Text>
                        {selectedPackageId === item.id ? <Ionicons name="checkmark" size={17} color={palette.accent} /> : null}
                      </View>
                      <Text style={[styles.packageOptionMeta, { color: palette.muter }]}>
                        {[item.duration, currencyFormatter.format(item.price)].filter(Boolean).join(' · ')}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

            {selectedPackage?.includedServices?.length ? (
              <Text style={[f.hint, styles.includedHint, { color: palette.muter }]}>
                {t('bd.included')}: {selectedPackage.includedServices.join(' · ')}
              </Text>
            ) : null}

            {isFormEdit ? null : (
            <>
            <Text style={[styles.fieldLabel, { color: palette.muter }]}>{t('bookings.customerSource')}</Text>
            <View style={styles.modeRow}>
              <Pressable
                onPress={() => {
                  setCustomerMode('existing');
                  setFormError('');
                }}
                style={[
                  styles.modeButton,
                  { backgroundColor: softInset, borderColor: softBorder },
                  customerMode === 'existing' && { backgroundColor: accentSoft, borderColor: palette.accent },
                ]}>
                <Text style={[styles.modeButtonText, { color: customerMode === 'existing' ? palette.accent : palette.text }]}>{t('bookings.existingCustomer')}</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setCustomerMode('new');
                  setShowCustomerDropdown(false);
                  setFormError('');
                }}
                style={[
                  styles.modeButton,
                  { backgroundColor: softInset, borderColor: softBorder },
                  customerMode === 'new' && { backgroundColor: accentSoft, borderColor: palette.accent },
                ]}>
                <Text style={[styles.modeButtonText, { color: customerMode === 'new' ? palette.accent : palette.text }]}>{t('bookings.newCustomer')}</Text>
              </Pressable>
            </View>

            {customerMode === 'existing' ? (
              <>
                <Text style={[styles.fieldLabel, { color: palette.muter }]}>{t('bookings.customer')}</Text>
                <Pressable
                  onPress={() => {
                    setShowCustomerDropdown((current) => !current);
                    setShowPackageDropdown(false);
                  }}
                  style={[styles.dropdownButton, { backgroundColor: softInset, borderColor: softBorder }, showCustomerDropdown && { borderColor: palette.accent, backgroundColor: accentSoft }]}>
                  <Text style={[styles.dropdownText, { color: palette.text }]}>{selectedCustomer ? selectedCustomer.name : 'Choose a customer'}</Text>
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
                    placeholder={t('bookings.searchCustomer')}
                    placeholderTextColor={palette.muter}
                    style={[styles.searchInput, { backgroundColor: softSurface, borderColor: softBorder, color: palette.text }]}
                  />

                  {/* The list scrolls itself. Without this the rows were laid out in a plain View
                      that the panel simply clipped, so every drag fell through to the form behind
                      it and moved the whole modal instead. Mirrors the package dropdown above. */}
                  <ScrollView
                    showsVerticalScrollIndicator={false}
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
                            setExistingCustomerEmail('');
                            setEmailError('');
                          }}
                          style={[styles.selectOption, { backgroundColor: softSurface, borderColor: softBorder }, selectedCustomerId === customer.id && { backgroundColor: accentSoft, borderColor: palette.accent }]}>
                          <Text style={[styles.selectText, { color: palette.text }]}>{customer.name}</Text>
                          <Text style={[styles.selectSubtext, { color: palette.muter }]}>{customer.email}</Text>
                        </Pressable>
                      ))
                    ) : (
                      <Text style={[styles.emptySearchText, { color: palette.muter }]}>{t('bookings.noMatchingCustomer')}</Text>
                    )}
                  </ScrollView>
                </Animated.View>

                {existingCustomerMissingEmail ? (
                  <>
                    <Text style={[styles.fieldLabel, { color: palette.muter }]}>{t('bookings.field.customerEmail')}</Text>
                    <TextInput
                      value={existingCustomerEmail}
                      onChangeText={(value) => {
                        setExistingCustomerEmail(value);
                        setEmailError('');
                        setFormError('');
                      }}
                      placeholder="siti@example.my"
                      placeholderTextColor={palette.muter}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      style={[styles.input, { backgroundColor: softInset, borderColor: emailError ? '#DC2626' : softBorder, color: palette.text }]}
                    />
                    <Text accessibilityRole={emailError ? 'alert' : undefined} style={[styles.depositHint, { color: emailError ? '#DC2626' : palette.muter }]}>
                      {emailError || t('bm.email.missing')}
                    </Text>
                  </>
                ) : null}
              </>
            ) : (
              <>
                <Text style={[styles.fieldLabel, { color: palette.muter }]}>{t('bookings.field.customerName')}</Text>
                <TextInput
                  value={newCustomerName}
                  onChangeText={setNewCustomerName}
                  placeholder="Siti Nur Izzah"
                  placeholderTextColor={palette.muter}
                  style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
                />

                <Text style={[styles.fieldLabel, { color: palette.muter }]}>{t('bookings.field.customerEmail')}</Text>
                <TextInput
                  value={newCustomerEmail}
                  onChangeText={(value) => {
                    setNewCustomerEmail(value);
                    setEmailError('');
                    setFormError('');
                  }}
                  placeholder="siti@example.my"
                  placeholderTextColor={palette.muter}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[styles.input, { backgroundColor: softInset, borderColor: emailError ? '#DC2626' : softBorder, color: palette.text }]}
                />
                {emailError ? <Text accessibilityRole="alert" style={[styles.depositHint, { color: '#DC2626' }]}>{emailError}</Text> : null}

                <Text style={[styles.fieldLabel, { color: palette.muter }]}>{t('bookings.field.customerPhone')}</Text>
                <TextInput
                  value={newCustomerPhone}
                  onChangeText={setNewCustomerPhone}
                  placeholder="+60 12-345 6789"
                  placeholderTextColor={palette.muter}
                  keyboardType="phone-pad"
                  style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
                />

                <Text style={[styles.fieldLabel, { color: palette.muter }]}>{t('bookings.field.customerLocation')}</Text>
                <TextInput
                  value={newCustomerLocation}
                  onChangeText={setNewCustomerLocation}
                  placeholder="Kuala Lumpur"
                  placeholderTextColor={palette.muter}
                  style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
                />
              </>
            )}
            </>
            )}

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>{t('bookings.price')}</Text>
            <TextInput
              value={draftPrice}
              onChangeText={(value) => {
                setDraftPrice(value);
                // The service's deposit follows the price until it is typed by hand.
                if (!isDepositManual) {
                  setDraftDeposit(formatDepositDraft(resolveServiceDepositAmount(selectedPackage, Number(value))));
                  setDepositEdited(true);
                }
              }}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={palette.muter}
              style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
            />

            {canUseWorkflowFeature('additionalCharges', isPro) ? (
            <BookingChargesEditor
              rows={chargeRows}
              onChange={(rows) => {
                setChargeRows(rows);
                setChargeError('');
                setFormError('');
              }}
              addOns={selectedPackage?.addOns}
              expanded={showCharges}
              onToggle={() => setShowCharges((current) => !current)}
              formatter={currencyFormatter}
              colors={formColors}
              error={chargeError}
            />
            ) : null}

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>{t('bookings.deposit')}</Text>
            <TextInput
              value={draftDeposit}
              onChangeText={(value) => {
                setDraftDeposit(value);
                setIsDepositManual(true);
                setDepositEdited(true);
                setFormError('');
              }}
              keyboardType="numeric"
              placeholder={t('bookings.deposit.optional')}
              placeholderTextColor={palette.muter}
              accessibilityLabel={t('bookings.deposit.label')}
              style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
            />
            <Text style={[styles.depositHint, { color: palette.muter }]}>
              {keepsStoredDeposit && sourceDeposit?.type === 'percent'
                ? t('bm.deposit.percentHint', { value: sourceDeposit.value, amount: currencyFormatter.format(totals.depositDueCents / 100) })
                : depositHint}
            </Text>

            {showSummary ? (
              <BookingMoneySummary totals={totals} formatter={currencyFormatter} colors={formColors} showPayments={isEdit} depositDueDate={depositTerms?.dueDate} charges={validCharges} />
            ) : null}

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>{t('bookings.eventDate')}</Text>
            {changeDate ? (
              <DatePickerField
                value={effectiveDate}
                onChange={(date) => {
                  changeDate(date);
                  markScheduleChanged();
                }}
                isDarkMode={isDarkMode}
                palette={palette}
              />
            ) : (
            <TextInput
              value={selectedDate}
              editable={false}
              style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.muter, opacity: 0.8 }]}
            />
            )}

            <View style={styles.timeRow}>
              <View style={styles.timeField}>
                <Text style={[styles.fieldLabel, { color: palette.muter }]}>{t('bookings.startTime')}</Text>
                <TimeSelectButton
                  value={draftStartTime}
                  accessibilityLabel={`${t('bookings.chooseStartTime')}, ${formatTime(draftStartTime)}`}
                  active={activeTimePicker === 'start'}
                  onPress={() => toggleTimeMenu('start')}
                  colors={timePickerColors}
                />
              </View>
              <View style={styles.timeField}>
                <View style={[styles.timeFieldLabelRow, styles.timeLabelSpacing]}>
                  <Text style={[styles.fieldLabel, styles.timeFieldLabel, { color: palette.muter }]}>{t('bookings.finishTime')}</Text>
                  {isEndTimeManual ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('bookings.auto.label')}
                      accessibilityHint={
                        selectedPackage?.duration ? `Sets it from ${selectedPackage.duration}` : undefined
                      }
                      hitSlop={8}
                      onPress={resetEndTimeToPackage}
                      style={({ pressed }) => pressed && styles.autoTagPressed}>
                      <Text style={[styles.autoTag, { color: palette.accent }]}>{t('bookings.auto')}</Text>
                    </Pressable>
                  ) : packageDurationMinutes ? (
                    <Text style={[styles.autoTag, styles.autoTagIdle, { color: palette.muter }]}>
                      Auto
                    </Text>
                  ) : null}
                </View>
                <TimeSelectButton
                  value={draftEndTime}
                  accessibilityLabel={`${t('bookings.chooseFinishTime')}, ${formatTime(draftEndTime)}`}
                  active={activeTimePicker === 'finish'}
                  onPress={() => toggleTimeMenu('finish')}
                  colors={timePickerColors}
                />
              </View>
            </View>

            {activeTimePicker ? (
              <TimePickerMenu
                title={activeTimePicker === 'start' ? t('bookings.chooseStartTime') : t('bookings.chooseFinishTime')}
                value={activeTimePicker === 'start' ? draftStartTime : draftEndTime}
                onChangePart={updateTimePart}
                error={draftEndTime <= draftStartTime ? t('bookings.timeRangeError') : undefined}
                doneDisabled={draftEndTime <= draftStartTime}
                onDone={() => setActiveTimePicker(null)}
                colors={timePickerColors}
              />
            ) : null}

            {!scheduleReviewed ? (
              <View accessibilityRole="alert" style={[styles.reviewNotice, { backgroundColor: accentSoft, borderColor: palette.accent }]}>
                <Ionicons name="calendar-outline" size={18} color={palette.accent} />
                <View style={styles.reviewCopy}>
                  <Text style={[styles.invoiceNoticeText, styles.reviewText, { color: palette.text }]}>{t('bm.duplicate.review')}</Text>
                  <Pressable accessibilityRole="button" hitSlop={6} onPress={() => { setScheduleReviewed(true); setFormError(''); }}>
                    <Text style={[f.textLink, { color: palette.accent }]}>{t('bm.duplicate.keep')}</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            <ScheduleConflictNotice
              conflicts={conflicts}
              override={allowConflict}
              onOverrideChange={(value) => {
                setAllowConflict(value);
                setFormError('');
              }}
              colors={formColors}
              formatDate={formatDisplayDate}
            />

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>{t('bookings.eventLocation')}</Text>
            <TextInput
              value={draftLocation}
              onChangeText={setDraftLocation}
              placeholder={t('bookings.location.placeholder')}
              placeholderTextColor={palette.muter}
              style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
            />

            {/* Notes belong to the booking; an invoice has none of its own to edit. */}
            {isInvoiceEdit ? null : (
            <>
            <Text style={[styles.fieldLabel, { color: palette.muter }]}>{t('bookings.notes')}</Text>
            <TextInput
              value={draftNotes}
              onChangeText={setDraftNotes}
              placeholder={t('bookings.notes.placeholder')}
              placeholderTextColor={palette.muter}
              multiline
              style={[styles.input, styles.notesInput, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
            />
            </>
            )}

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>{t('bm.terms')}</Text>
            <TextInput
              value={terms}
              onChangeText={setTerms}
              placeholder={t('bm.terms.placeholder')}
              placeholderTextColor={palette.muter}
              multiline
              maxLength={8000}
              style={[styles.input, styles.notesInput, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
            />

            {onDueDateChange ? (
              <>
                <Text style={[styles.fieldLabel, { color: palette.muter }]}>{t('invoices.dueDate')}</Text>
                <TextInput
                  value={dueDate}
                  onChangeText={onDueDateChange}
                  style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={palette.muter}
                />
              </>
            ) : null}

            {isQuote ? (
              <>
                <Text style={[styles.fieldLabel, { color: palette.muter }]}>{t('bm.quote.validUntil')}</Text>
                <DatePickerField value={validUntil} onChange={setValidUntil} isDarkMode={isDarkMode} palette={palette} />
              </>
            ) : null}

            {isEdit ? null : (
              <View style={[styles.invoiceNotice, { backgroundColor: accentSoft, borderColor: palette.accent }]}>
                <Ionicons name={isQuote ? 'pricetag-outline' : isFormEdit ? 'link-outline' : 'document-text-outline'} size={18} color={palette.accent} />
                <Text style={[styles.invoiceNoticeText, { color: palette.text }]}>{t(isQuote ? 'bm.quote.notice' : isFormEdit ? 'bm.formEdit.notice' : 'bookings.invoiceNotice')}</Text>
              </View>
            )}

            </View>
            {formError || feedback.error ? <Text accessibilityRole="alert" style={styles.formError}>{feedback.error || formError}</Text> : null}

            <Pressable accessibilityRole="button" style={[styles.submitButton, { backgroundColor: palette.accent, shadowColor: palette.accent }]} disabled={busy} onPress={handleAddBooking}>
              <Text style={styles.submitButtonText}>{feedback.saving ? t('bookings.saving') : feedback.pending ? t('bookings.retry') : t(saveKey)}</Text>
            </Pressable>
            {isInvoiceEdit ? (
              // Closes without saving: nothing is written until Save changes is pressed.
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => setShowComposer(false)}
                style={({ pressed }) => [styles.secondaryButton, { borderColor: palette.border }, pressed && styles.autoTagPressed, busy && styles.disabledButton]}>
                <Text style={[styles.secondaryButtonText, { color: palette.text }]}>{t('of.cancel')}</Text>
              </Pressable>
            ) : null}
            {canSendForm ? (
              <Pressable
                accessibilityRole="button"
                accessibilityHint={t('bm.sendForm.body')}
                disabled={busy || feedback.pending}
                onPress={handleSendForm}
                style={({ pressed }) => [styles.secondaryButton, { borderColor: palette.accent }, pressed && styles.autoTagPressed, (busy || feedback.pending) && styles.disabledButton]}>
                <Ionicons name="paper-plane-outline" size={17} color={palette.accent} />
                <Text style={[styles.secondaryButtonText, { color: palette.accent }]}>{sendingForm ? t('bm.sendForm.sending') : t('bm.sendForm')}</Text>
              </Pressable>
            ) : null}
            </>
            )}
            </ScrollView>
          </View>
          <SuccessFeedback visible={feedback.success} title={t(successTitleKey)} message={successBody} onComplete={completeBooking} />

          <KeyboardDoneButton />
        </View>
      </Modal>
  );
}

const styles = StyleSheet.create({
  headerCopy: {
    flex: 1,
    marginRight: 12,
  },
  includedHint: {
    marginTop: 0,
    marginBottom: 2,
  },
  reviewNotice: {
    borderWidth: 1,
    borderRadius: 17,
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 12,
  },
  reviewCopy: {
    flex: 1,
    gap: 8,
  },
  reviewText: {
    marginLeft: 8,
  },
  secondaryButton: {
    marginTop: 10,
    borderRadius: 17,
    borderWidth: 1,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryButtonText: {
    fontWeight: '800',
    fontSize: 14.5,
  },
  disabledButton: {
    opacity: 0.55,
  },
  depositHint: {
    fontSize: 11.5,
    fontWeight: '500',
    lineHeight: 16,
    marginTop: 6,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.58)',
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
    letterSpacing: 0.65,
    marginBottom: 8,
    marginTop: 14,
    textTransform: 'uppercase',
  },
  input: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  timeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  timeField: {
    flex: 1,
  },
  timeFieldLabelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeLabelSpacing: {
    marginBottom: 8,
    marginTop: 14,
  },
  timeFieldLabel: {
    // The row owns the spacing the label used to carry on its own.
    marginBottom: 0,
    marginTop: 0,
  },
  autoTag: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.65,
    textTransform: 'uppercase',
  },
  autoTagIdle: {
    opacity: 0.7,
  },
  autoTagPressed: {
    opacity: 0.6,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 4,
  },
  modeButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modeButtonText: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 8,
  },
  dropdownText: {
    color: '#111827',
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
    color: '#111827',
  },
  selectOption: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 8,
  },
  selectText: {
    color: '#111827',
    fontWeight: '600',
  },
  selectSubtext: {
    color: '#6B7280',
    fontSize: 12,
    marginTop: 2,
  },
  emptySearchText: {
    color: '#6B7280',
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 10,
  },
  notesInput: {
    minHeight: 92,
    textAlignVertical: 'top',
  },
  invoiceNotice: {
    borderWidth: 1,
    borderRadius: 17,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 16,
  },
  invoiceNoticeText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    marginLeft: 8,
  },
  formError: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 12,
  },
  packageSelectedCopy: {
    flex: 1,
  },
  packageSelectedName: {
    fontSize: 14,
    fontWeight: '700',
  },
  packageSelectedMeta: {
    fontSize: 12,
    marginTop: 3,
  },
  packageDropdownPanel: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 8,
    marginBottom: 8,
  },
  packageDropdownScroll: {
    maxHeight: 240,
  },
  packageOption: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  packageOptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  packageOptionText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  packageOptionMeta: {
    fontSize: 12,
    marginTop: 4,
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
    fontSize: 15,
  },
});
