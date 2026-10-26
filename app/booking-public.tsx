import BookFlowLoading from '@/components/feedback/BookFlowLoading';
import { useLoadingTransition } from '@/components/feedback/useLoadingTransition';
import { createPublicInvoiceUrl, decodeInvoiceToken } from '@/lib/public-invoice-url';
import { Redirect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/context/auth-context';
import { DEFAULT_LOCALE, isLocale, translate, type Locale, type TranslationKey } from '@/lib/i18n';
import { getSupabaseFunctionUrl } from '@/lib/supabase';

/**
 * The customer's side of a booking form, a quotation, or a booking page.
 *
 * Opened from a private link without an account. Everything shown comes from the `booking-public`
 * Edge Function's allow-listed projection; every response is validated again on the server, which
 * prices it from the business's own snapshot. Agreed details are read-only here — a customer can
 * only send their own details, accept or decline, or ask for a change.
 */

type OfferStatus = 'sent' | 'submitted' | 'accepted' | 'declined' | 'change_requested' | 'converted';

type PublicOffer = {
  kind: 'booking_form' | 'quotation' | 'booking_page';
  status: OfferStatus;
  version: number;
  locale: string;
  timeZone: string;
  business: { name: string; phone: string; email: string; logoUrl: string };
  title: string;
  customerName: string;
  packageName: string;
  packageDetails: string;
  includedServices: string[];
  lines: { kind: 'package' | 'charge'; description: string; detail: string; quantity: number; unit: string; unitPrice: string; amount: string }[];
  totals: { subtotal: string; charges: string; total: string; hasCharges: boolean; deposit: string; hasDeposit: boolean; depositDueDate: string; depositOutstanding: string; paid: string; balance: string };
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  terms: string;
  termsVersion: string;
  validUntil: string;
  isExpiredQuote: boolean;
  requireEmail: boolean;
  canRespond: boolean;
  changeRequestsLeft: number;
  submittedAt: string;
  booking: { status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' } | null;
  fulfilment: { status: 'not_started' | 'service_completed' | 'in_progress' | 'delivered'; promisedDate: string; deliveryLink: string } | null;
  invoice: { number: string; token: string } | null;
  payments: { date: string; amount: string; kind: 'deposit' | 'payment' }[];
};

type Field = 'name' | 'phone' | 'email' | 'customerLocation' | 'location';

const ERROR_KEYS: Record<string, TranslationKey> = {
  invalid_name: 'pub.error.name',
  invalid_phone: 'pub.error.phone',
  invalid_email: 'pub.error.email',
  invalid_location: 'pub.error.location',
  invalid_customer_location: 'pub.error.customerLocation',
  terms_required: 'pub.error.terms',
  invalid_change: 'pub.error.change',
  slot_unavailable: 'pub.error.slot',
  plan_limit: 'pub.error.limit',
  // The business's plan could not be checked just now — temporary, not a limit.
  entitlement_unavailable: 'pub.error.unavailable',
  offer_changed: 'pub.error.changed',
  offer_expired: 'pub.error.expired',
  rate_limited: 'pub.error.rate',
  closed: 'pub.error.closed',
};

/** A random key per action, reused on a retry so a lost response can never submit twice. */
function newIdempotencyKey() {
  const bytes = new Uint8Array(18);
  globalThis.crypto?.getRandomValues?.(bytes);
  const random = Array.from(bytes, (byte) => byte.toString(36).padStart(2, '0')).join('');
  return `k${Date.now().toString(36)}${random}`.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64).padEnd(16, '0');
}

function NativeRedirect() {
  const { isAuthenticated, isLoaded } = useAuth();
  const loadingTransition = useLoadingTransition(!isLoaded);
  if (loadingTransition.visible) return <BookFlowLoading key={loadingTransition.cycle} loading={!isLoaded} />;
  return <Redirect href={isAuthenticated ? '/(tabs)' : '/(auth)/login'} />;
}

export default function PublicBookingRoute() {
  if (Platform.OS !== 'web') return <NativeRedirect />;
  return <PublicBookingScreen />;
}

function PublicBookingScreen() {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  const t = useCallback((key: TranslationKey, values?: Record<string, string | number>) => translate(locale, key, values), [locale]);
  const params = useLocalSearchParams<{ token?: string | string[]; t?: string | string[] }>();
  const rawToken = params.token ?? params.t;
  const token = decodeInvoiceToken(Array.isArray(rawToken) ? rawToken[0] : rawToken);
  const apiUrl = useMemo(() => (token ? `${getSupabaseFunctionUrl('booking-public')}?format=json&token=${encodeURIComponent(token)}` : null), [token]);

  const [offer, setOffer] = useState<PublicOffer | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const loadingTransition = useLoadingTransition(isLoading);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<Field | 'terms' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // The only details a customer can enter; everything else on the page is the owner's and read-only.
  const [form, setForm] = useState({ name: '', email: '', phone: '', customerLocation: '', location: '' });
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [showChange, setShowChange] = useState(false);
  const [changeMessage, setChangeMessage] = useState('');
  const keys = useRef<Record<string, string>>({});
  // Blocks a second tap that lands before `pending` re-renders the button as disabled.
  const inFlight = useRef(false);
  const keyFor = (action: string) => (keys.current[action] ??= newIdempotencyKey());

  const load = useCallback(async () => {
    if (!apiUrl) {
      setLoadError(translate(locale, 'pub.expired'));
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await fetch(apiUrl, { headers: { accept: 'application/json' } });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.data) {
        setOffer(null);
        setLoadError(translate(locale, response.status === 404 || response.status === 400 ? 'pub.expired' : 'pub.error.generic'));
        return;
      }
      const loaded = body.data as PublicOffer;
      setLocale(isLocale(loaded.locale) ? loaded.locale : DEFAULT_LOCALE);
      setOffer(loaded);
      setForm((current) => (current.location || !loaded.location ? current : { ...current, location: loaded.location }));
    } catch {
      setOffer(null);
      setLoadError(translate(locale, 'pub.error.generic'));
    } finally {
      setIsLoading(false);
    }
  }, [apiUrl, locale]);

  useEffect(() => {
    load();
    // Loads once per link; `locale` changing after the first load must not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl]);

  const send = async (action: 'submit' | 'accept' | 'decline' | 'request_change', payload: Record<string, unknown>) => {
    if (!apiUrl || pending || inFlight.current || !offer) return;
    inFlight.current = true;
    setPending(action);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({ action, idempotencyKey: keyFor(action), payload: { ...payload, version: offer.version } }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.data) {
        const code = typeof body?.error === 'string' ? body.error : '';
        const field = code === 'invalid_name' ? 'name' : code === 'invalid_phone' ? 'phone' : code === 'invalid_email' ? 'email' : code === 'invalid_customer_location' ? 'customerLocation' : code === 'invalid_location' ? 'location' : code === 'terms_required' ? 'terms' : null;
        setFieldError(field);
        // A temporary throttle says when to try again; nothing entered on the page is lost.
        const retryAfter = code === 'rate_limited' && typeof body?.retryAfterSeconds === 'number' && body.retryAfterSeconds > 0 ? body.retryAfterSeconds : 0;
        // Under a minute the wait is shown in seconds; otherwise in whole minutes, rounded up so the
        // client is never told to come back before the window has ended.
        setError(retryAfter
          ? retryAfter < 60
            ? t('pub.error.rateWaitSeconds', { seconds: Math.ceil(retryAfter) })
            : t('pub.error.rateWait', { minutes: Math.ceil(retryAfter / 60) })
          : t(ERROR_KEYS[code] ?? (response.status === 404 ? 'pub.expired' : 'pub.error.generic')));
        // The details moved on underneath the customer: show them the latest version.
        if (code === 'offer_changed' || code === 'closed' || code === 'offer_expired') await load();
        return;
      }
      setFieldError(null);
      setOffer(body.data as PublicOffer);
      if (action === 'request_change') {
        // A further change request is a new action with its own key.
        delete keys.current.request_change;
        setChangeMessage('');
        setShowChange(false);
        setNotice(t('pub.changeSent', { business: offer.business.name || 'The business' }));
      }
    } catch {
      // Network failure: the same key is reused on retry, so a request that did land is not repeated.
      setError(t('pub.error.generic'));
    } finally {
      inFlight.current = false;
      setPending(null);
    }
  };

  const validateForm = () => {
    if (!offer) return false;
    if (form.name.trim().length < 2) return setFieldError('name'), setError(t('pub.error.name')), false;
    // Email is always required on a booking form.
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) return setFieldError('email'), setError(t('pub.error.email')), false;
    if (!/^\+?[0-9 ().-]{7,24}$/.test(form.phone.trim()) || form.phone.replace(/\D/g, '').length < 7) return setFieldError('phone'), setError(t('pub.error.phone')), false;
    if (form.customerLocation.trim().length > 300) return setFieldError('customerLocation'), setError(t('pub.error.customerLocation')), false;
    if (!offer.location && !form.location.trim()) return setFieldError('location'), setError(t('pub.error.location')), false;
    if (!acceptTerms) return setFieldError('terms'), setError(t('pub.error.terms')), false;
    return true;
  };

  if (loadingTransition.visible) return <BookFlowLoading key={loadingTransition.cycle} loading={isLoading} />;

  if (!offer) {
    return (
      <SafeAreaView style={styles.centeredPage}>
        <View style={styles.errorCard}>
          <Text accessibilityRole="header" style={styles.errorTitle}>{t('pub.unavailable.title')}</Text>
          <Text style={styles.errorMessage}>{loadError ?? t('pub.expired')}</Text>
          <Pressable accessibilityRole="button" onPress={load} style={({ pressed }) => [styles.primaryButton, styles.retry, pressed && styles.pressed]}>
            <Text style={styles.primaryButtonText}>{t('app.tryAgain')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const business = offer.business.name || 'BookFlow business';
  const formatDate = (value: string) => {
    if (!value) return '';
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale === 'ms-MY' ? 'ms-MY' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date);
  };
  const formatTime = (value: string) => {
    const match = /^(\d{2}):(\d{2})$/.exec(value);
    if (!match) return value;
    const hour = Number(match[1]);
    return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? 'PM' : 'AM'}`;
  };
  const time = [offer.startTime, offer.endTime].filter(Boolean).map(formatTime).join(' – ');
  const title = offer.kind === 'booking_form' && offer.status !== 'converted' ? t('pub.form.title') : offer.kind === 'quotation' && offer.status !== 'converted' ? t('pub.quote.title') : t('pub.page.title');
  const showForm = offer.kind === 'booking_form' && offer.canRespond;
  const showQuoteActions = offer.kind === 'quotation' && offer.canRespond && !offer.isExpiredQuote;
  const isBookingPage = offer.status === 'converted' || offer.kind === 'booking_page';
  const bookingStatusKey: Record<string, TranslationKey> = {
    pending: 'pub.status.pending', confirmed: 'pub.status.confirmed', in_progress: 'pub.status.inProgress', completed: 'pub.status.completed', cancelled: 'pub.status.cancelled',
  };

  const inputStyle = (field: Field) => [styles.input, fieldError === field && styles.inputError];

  return (
    <SafeAreaView style={styles.page}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.container}>
          {offer.business.logoUrl ? (
            <Image source={{ uri: offer.business.logoUrl }} style={styles.logo} resizeMode="contain" accessibilityLabel={`${business} logo`} />
          ) : (
            <Text style={styles.brand}>{business.toUpperCase()}</Text>
          )}

          <View style={styles.card}>
            <View style={styles.rule} />
            <View style={styles.content}>
              <Text style={styles.eyebrow}>{title}</Text>
              <Text accessibilityRole="header" style={styles.heading}>{offer.title || offer.packageName}</Text>
              <Text style={styles.muted}>{t('pub.secure', { business })}</Text>
              {offer.kind === 'quotation' && offer.validUntil ? (
                <Text style={[styles.muted, offer.isExpiredQuote && styles.warningText]}>{t('pub.validUntil', { date: formatDate(offer.validUntil) })}</Text>
              ) : null}

              {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}

              {/* ------------------------------------------------------------ agreed details */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('pub.agreed')}</Text>
                {!isBookingPage ? <Text style={styles.hint}>{t('pub.agreedHint', { business })}</Text> : null}
                <Detail label={t('pub.date')} value={formatDate(offer.date)} />
                <Detail label={t('pub.time')} value={time} />
                {offer.location ? <Detail label={t('pub.location')} value={offer.location} /> : null}
                <Detail label={t('pub.package')} value={offer.packageName} />
                {offer.timeZone ? <Text style={styles.hint}>{t('pub.timeZone', { zone: offer.timeZone })}</Text> : null}
                {offer.packageDetails ? <Text style={styles.body}>{offer.packageDetails}</Text> : null}
                {offer.includedServices.length ? (
                  <View style={styles.included}>
                    <Text style={styles.label}>{t('pub.included')}</Text>
                    {offer.includedServices.map((item) => <Text key={item} style={styles.body}>• {item}</Text>)}
                  </View>
                ) : null}
              </View>

              <View style={styles.section}>
                {offer.lines.map((line, index) => (
                  <View key={`${index}-${line.description}`} style={styles.lineRow}>
                    <View style={styles.flex}>
                      <Text style={styles.lineTitle}>{line.description}</Text>
                      {line.kind === 'charge' && (line.quantity !== 1 || line.unit) ? (
                        <Text style={styles.hint}>{line.quantity}{line.unit ? ` ${line.unit}` : ''} × {line.unitPrice}</Text>
                      ) : null}
                    </View>
                    <Text style={styles.lineAmount}>{line.amount}</Text>
                  </View>
                ))}
                <View style={styles.totals}>
                  <Total label={t('pub.subtotal')} value={offer.totals.subtotal} />
                  {offer.totals.hasCharges ? <Total label={t('pub.charges')} value={offer.totals.charges} /> : null}
                  <Total label={t('pub.total')} value={offer.totals.total} strong />
                  {offer.totals.hasDeposit ? (
                    <Total label={offer.totals.depositDueDate ? t('pub.depositBy', { date: formatDate(offer.totals.depositDueDate) }) : t('pub.deposit')} value={offer.totals.deposit} />
                  ) : null}
                  {isBookingPage ? (
                    <>
                      <Total label={t('pub.paid')} value={offer.totals.paid} />
                      <Total label={t('pub.balance')} value={offer.totals.balance} strong />
                    </>
                  ) : null}
                </View>
              </View>

              {offer.terms || showForm || showQuoteActions ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>{t('pub.terms')}</Text>
                  <Text style={styles.body}>{offer.terms || t('pub.noTerms')}</Text>
                </View>
              ) : null}

              {/* ------------------------------------------------------------ booking page */}
              {isBookingPage ? (
                <View style={styles.section}>
                  {offer.booking ? <Detail label={t('pub.bookingStatus')} value={t(bookingStatusKey[offer.booking.status] ?? 'pub.status.pending')} /> : null}
                  {offer.invoice?.token ? (
                    <Pressable accessibilityRole="link" onPress={() => Linking.openURL(createPublicInvoiceUrl(offer.invoice!.token))} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
                      <Text style={styles.primaryButtonText}>{t('pub.invoice')}{offer.invoice.number ? ` · ${offer.invoice.number}` : ''}</Text>
                    </Pressable>
                  ) : (
                    <Text style={styles.hint}>{t('pub.invoicePending', { business })}</Text>
                  )}
                  <Text style={[styles.label, styles.spaced]}>{t('pub.payments')}</Text>
                  {offer.payments.length ? offer.payments.map((payment, index) => (
                    <Detail key={`${index}-${payment.date}`} label={`${payment.kind === 'deposit' ? t('pub.paymentDeposit') : t('pub.paymentPayment')} · ${formatDate(payment.date)}`} value={payment.amount} />
                  )) : <Text style={styles.hint}>{t('pub.noPayments')}</Text>}
                  {offer.fulfilment ? (
                    <View style={styles.spaced}>
                      <Text style={styles.label}>{t('pub.delivery')}</Text>
                      <Text style={styles.body}>{t(`bd.status.${offer.fulfilment.status}` as TranslationKey)}</Text>
                      {offer.fulfilment.promisedDate && offer.fulfilment.status !== 'delivered' ? <Text style={styles.hint}>{t('pub.deliveryBy', { date: formatDate(offer.fulfilment.promisedDate) })}</Text> : null}
                      {offer.fulfilment.deliveryLink ? (
                        <Pressable accessibilityRole="link" onPress={() => Linking.openURL(offer.fulfilment!.deliveryLink)} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
                          <Text style={styles.secondaryButtonText}>{t('pub.openDelivery')}</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              ) : null}

              {/* ------------------------------------------------------------ responses */}
              {offer.status === 'submitted' ? (
                <View style={styles.confirmation} accessibilityRole="alert">
                  <Text style={styles.confirmationTitle}>{t('pub.submitted.title')}</Text>
                  <Text style={styles.confirmationBody}>{t('pub.submitted.body', { business })}</Text>
                </View>
              ) : offer.status === 'accepted' ? (
                <View style={styles.confirmation} accessibilityRole="alert">
                  <Text style={styles.confirmationTitle}>{t('pub.accepted.title')}</Text>
                  <Text style={styles.confirmationBody}>{t('pub.accepted.body', { business })}</Text>
                </View>
              ) : offer.status === 'declined' ? (
                <Text style={styles.resolved}>{t('pub.declined')}</Text>
              ) : null}

              {showForm ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>{t('pub.yourDetails')}</Text>
                  <FieldLabel label={t('pub.name')} required requiredLabel={t('pub.required')} optionalLabel={t('pub.optional')} />
                  <TextInput value={form.name} onChangeText={(name) => setForm({ ...form, name })} autoComplete="name" maxLength={120} accessibilityLabel={t('pub.name')} style={inputStyle('name')} />
                  <FieldLabel label={t('pub.email')} required requiredLabel={t('pub.required')} optionalLabel={t('pub.optional')} />
                  <TextInput value={form.email} onChangeText={(email) => setForm({ ...form, email })} autoComplete="email" keyboardType="email-address" autoCapitalize="none" maxLength={254} accessibilityLabel={t('pub.email')} style={inputStyle('email')} />
                  <FieldLabel label={t('pub.phone')} required requiredLabel={t('pub.required')} optionalLabel={t('pub.optional')} />
                  <TextInput value={form.phone} onChangeText={(phone) => setForm({ ...form, phone })} autoComplete="tel" keyboardType="phone-pad" maxLength={24} placeholder="+60 12-345 6789" placeholderTextColor="#98A2B3" accessibilityLabel={t('pub.phone')} style={inputStyle('phone')} />
                  <FieldLabel label={t('pub.customerLocation')} required={false} requiredLabel={t('pub.required')} optionalLabel={t('pub.optional')} />
                  <TextInput value={form.customerLocation} onChangeText={(customerLocation) => setForm({ ...form, customerLocation })} maxLength={300} accessibilityLabel={t('pub.customerLocation')} style={inputStyle('customerLocation')} />
                  <FieldLabel label={t('pub.eventLocation')} required={!offer.location} requiredLabel={t('pub.required')} optionalLabel={t('pub.optional')} />
                  <TextInput value={form.location} onChangeText={(location) => setForm({ ...form, location })} maxLength={300} accessibilityLabel={t('pub.eventLocation')} style={inputStyle('location')} />
                </View>
              ) : null}

              {showForm || showQuoteActions ? (
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: acceptTerms }}
                  onPress={() => { setAcceptTerms(!acceptTerms); if (fieldError === 'terms') setFieldError(null); }}
                  style={[styles.checkboxRow, fieldError === 'terms' && styles.checkboxError]}>
                  <View style={[styles.checkbox, acceptTerms && styles.checkboxChecked]}>{acceptTerms ? <Text style={styles.checkmark}>✓</Text> : null}</View>
                  <Text style={styles.checkboxText}>{t('pub.acceptTerms')}</Text>
                </Pressable>
              ) : null}

              {error ? <Text accessibilityRole="alert" style={styles.inlineError}>{error}</Text> : null}

              {showForm ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={Boolean(pending)}
                  onPress={() => {
                    if (!validateForm()) return;
                    // Exactly the five customer fields, trimmed; the server takes everything else from the stored form.
                    send('submit', {
                      name: form.name.trim(),
                      email: form.email.trim(),
                      phone: form.phone.trim(),
                      customerLocation: form.customerLocation.trim(),
                      location: form.location.trim(),
                      acceptTerms: true,
                      termsVersion: offer.termsVersion,
                    });
                  }}
                  style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, pending ? styles.disabled : null]}>
                  {pending === 'submit' ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>{t('pub.submit')}</Text>}
                </Pressable>
              ) : null}

              {showQuoteActions ? (
                <View style={styles.actions}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={Boolean(pending)}
                    onPress={() => {
                      if (!acceptTerms) { setFieldError('terms'); setError(t('pub.error.terms')); return; }
                      send('accept', { acceptTerms: true, termsVersion: offer.termsVersion, name: offer.customerName });
                    }}
                    style={({ pressed }) => [styles.primaryButton, styles.flexButton, pressed && styles.pressed]}>
                    {pending === 'accept' ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>{t('pub.accept')}</Text>}
                  </Pressable>
                  <Pressable accessibilityRole="button" disabled={Boolean(pending)} onPress={() => send('decline', {})} style={({ pressed }) => [styles.secondaryButton, styles.flexButton, pressed && styles.pressed]}>
                    {pending === 'decline' ? <ActivityIndicator color="#4F46E5" /> : <Text style={styles.secondaryButtonText}>{t('pub.decline')}</Text>}
                  </Pressable>
                </View>
              ) : null}

              {(showForm || showQuoteActions) && offer.changeRequestsLeft > 0 ? (
                <View style={styles.section}>
                  {showChange ? (
                    <>
                      <TextInput value={changeMessage} onChangeText={setChangeMessage} multiline maxLength={1000} placeholder={t('pub.changePlaceholder')} placeholderTextColor="#98A2B3" accessibilityLabel={t('pub.requestChange')} style={[styles.input, styles.multiline]} />
                      <Pressable accessibilityRole="button" disabled={Boolean(pending)} onPress={() => {
                        if (changeMessage.trim().length < 5) { setError(t('pub.error.change')); return; }
                        send('request_change', { message: changeMessage.trim() });
                      }} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
                        {pending === 'request_change' ? <ActivityIndicator color="#4F46E5" /> : <Text style={styles.secondaryButtonText}>{t('pub.sendChange')}</Text>}
                      </Pressable>
                    </>
                  ) : (
                    <Pressable accessibilityRole="button" onPress={() => setShowChange(true)} style={({ pressed }) => [styles.linkButton, pressed && styles.pressed]}>
                      <Text style={styles.linkText}>{t('pub.requestChange')}</Text>
                    </Pressable>
                  )}
                </View>
              ) : null}

              {offer.kind === 'quotation' && offer.isExpiredQuote && offer.canRespond ? <Text style={styles.resolved}>{t('pub.error.expired')}</Text> : null}
            </View>
            <Text style={styles.footer}>{t('pub.footer')}</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function Total({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.totalRow}>
      <Text style={[styles.detailLabel, strong && styles.strong]}>{label}</Text>
      <Text style={[styles.detailValue, strong && styles.strong]}>{value}</Text>
    </View>
  );
}

function FieldLabel({ label, required, requiredLabel, optionalLabel }: { label: string; required: boolean; requiredLabel: string; optionalLabel: string }) {
  return (
    <View style={styles.fieldLabelRow}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.fieldTag, required && styles.fieldTagRequired]}>{required ? requiredLabel : optionalLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F4F6FB' },
  centeredPage: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#F4F6FB' },
  scrollContent: { flexGrow: 1, paddingHorizontal: 16, paddingVertical: 28 },
  container: { width: '100%', maxWidth: 680, alignSelf: 'center' },
  brand: { marginBottom: 18, color: '#4F46E5', fontSize: 13, fontWeight: '800', letterSpacing: 1.8 },
  logo: { width: 148, height: 62, marginBottom: 18 },
  card: { overflow: 'hidden', backgroundColor: '#FFFFFF', borderColor: '#E4E7EC', borderWidth: 1, borderRadius: 24 },
  rule: { height: 7, backgroundColor: '#4F46E5' },
  content: { padding: 22 },
  eyebrow: { color: '#667085', fontSize: 11, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  heading: { marginTop: 6, color: '#172033', fontSize: 26, fontWeight: '800', letterSpacing: -0.6 },
  muted: { marginTop: 6, color: '#667085', fontSize: 13, lineHeight: 19 },
  warningText: { color: '#B42318', fontWeight: '700' },
  section: { marginTop: 22 },
  sectionTitle: { color: '#172033', fontSize: 16, fontWeight: '800', marginBottom: 8 },
  label: { color: '#344054', fontSize: 13, fontWeight: '700' },
  hint: { color: '#667085', fontSize: 12.5, lineHeight: 18, marginTop: 4 },
  body: { color: '#172033', fontSize: 14, lineHeight: 21, marginTop: 4 },
  included: { marginTop: 10 },
  spaced: { marginTop: 16 },
  flex: { flex: 1 },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 18, paddingVertical: 9, borderBottomColor: '#EAECF0', borderBottomWidth: 1 },
  detailLabel: { color: '#667085', fontSize: 13, flexShrink: 1 },
  detailValue: { flex: 1, color: '#172033', fontSize: 13, fontWeight: '700', textAlign: 'right' },
  lineRow: { flexDirection: 'row', gap: 14, paddingVertical: 10, borderBottomColor: '#EAECF0', borderBottomWidth: 1 },
  lineTitle: { color: '#172033', fontSize: 14, fontWeight: '700' },
  lineAmount: { color: '#172033', fontSize: 14, fontWeight: '700' },
  totals: { marginTop: 8, padding: 14, borderRadius: 14, backgroundColor: '#F8FAFC' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 5 },
  strong: { color: '#172033', fontSize: 15, fontWeight: '800' },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, marginBottom: 6 },
  fieldTag: { color: '#667085', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldTagRequired: { color: '#4338CA' },
  input: { borderColor: '#D0D5DD', borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 12, fontSize: 16, color: '#172033', backgroundColor: '#FFFFFF' },
  inputError: { borderColor: '#B42318', borderWidth: 2 },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  checkboxRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 20, padding: 12, borderRadius: 12, backgroundColor: '#F8FAFC' },
  checkboxError: { borderColor: '#B42318', borderWidth: 1 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#98A2B3', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  checkboxChecked: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
  checkmark: { color: '#FFFFFF', fontSize: 14, fontWeight: '900', lineHeight: 16 },
  checkboxText: { flex: 1, color: '#172033', fontSize: 14, lineHeight: 20, fontWeight: '600' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 },
  flexButton: { flexGrow: 1, flexBasis: 180 },
  primaryButton: { marginTop: 18, minHeight: 52, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, borderRadius: 14, backgroundColor: '#4F46E5' },
  primaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  secondaryButton: { marginTop: 12, minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, borderRadius: 14, borderWidth: 1, borderColor: '#4F46E5' },
  secondaryButtonText: { color: '#4F46E5', fontSize: 15, fontWeight: '800' },
  linkButton: { alignSelf: 'flex-start', paddingVertical: 10 },
  linkText: { color: '#4F46E5', fontSize: 14, fontWeight: '800' },
  retry: { alignSelf: 'center', paddingHorizontal: 24 },
  disabled: { opacity: 0.6 },
  pressed: { opacity: 0.82 },
  notice: { marginTop: 18, padding: 14, borderRadius: 12, backgroundColor: '#ECFDF3', color: '#067647', fontWeight: '700', lineHeight: 20 },
  inlineError: { marginTop: 16, padding: 14, borderRadius: 12, backgroundColor: '#FEF3F2', color: '#B42318', fontWeight: '700', lineHeight: 20 },
  confirmation: { marginTop: 22, padding: 16, borderRadius: 14, backgroundColor: '#ECFDF3' },
  confirmationTitle: { color: '#067647', fontSize: 16, fontWeight: '800' },
  confirmationBody: { marginTop: 6, color: '#054F31', fontSize: 14, lineHeight: 21 },
  resolved: { marginTop: 22, padding: 15, borderRadius: 14, backgroundColor: '#F2F4F7', color: '#344054', textAlign: 'center', fontWeight: '800' },
  footer: { paddingHorizontal: 30, paddingVertical: 18, borderTopColor: '#EAECF0', borderTopWidth: 1, color: '#98A2B3', fontSize: 11, textAlign: 'center' },
  errorCard: { width: '100%', maxWidth: 520, padding: 30, borderColor: '#E4E7EC', borderWidth: 1, borderRadius: 22, backgroundColor: '#FFFFFF', alignItems: 'center' },
  errorTitle: { color: '#172033', fontSize: 24, fontWeight: '800', textAlign: 'center' },
  errorMessage: { marginTop: 10, color: '#667085', fontSize: 15, lineHeight: 23, textAlign: 'center' },
});
