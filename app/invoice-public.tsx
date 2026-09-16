import BookFlowLoading from '@/components/feedback/BookFlowLoading';
import { useLoadingTransition } from '@/components/feedback/useLoadingTransition';
import { decodeInvoiceToken } from '@/lib/public-invoice-url';
import { Redirect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/context/auth-context';
import { renderInvoiceHtml, type InvoiceRenderData } from '@/lib/invoice-design';
import { DEFAULT_LOCALE, isLocale, translate, type Locale, type TranslationKey } from '@/lib/i18n';
import { getSupabaseFunctionUrl } from '@/lib/supabase';

/**
 * Renders the invoice exactly as the PDF does.
 *
 * `renderInvoiceHtml` is the same function `lib/invoice-pdf` calls, so the document the customer
 * scrolls through and the file the business downloads come from one renderer rather than from two
 * layouts that would drift apart. The full document — template and accent CSS included — goes into
 * an iframe: the body alone carries no styling, and the template's `body` rules would otherwise leak
 * onto this page. This route only ever runs on web — native redirects above — so a DOM node here is
 * the intended target, not an escape hatch.
 */
function TemplatedInvoiceDocument({ data }: { data: InvoiceRenderData }) {
  const [frame, setFrame] = useState<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState(900);
  const html = useMemo(() => renderInvoiceHtml(data), [data]);

  useEffect(() => {
    if (!frame) return;
    let observer: ResizeObserver | undefined;
    // The frame is sized to its content so the page scrolls as one document, not a box within a box.
    // Measured from the body: the root element never reports less than the frame's own height.
    const fit = () => {
      const body = frame.contentDocument?.body;
      if (!body) return;
      const measure = () => setHeight(Math.ceil(body.getBoundingClientRect().height));
      measure();
      observer?.disconnect();
      observer = new ResizeObserver(measure);
      observer.observe(body);
    };
    fit();
    frame.addEventListener('load', fit);
    return () => {
      frame.removeEventListener('load', fit);
      observer?.disconnect();
    };
  }, [frame, html]);

  return React.createElement('iframe', {
    ref: setFrame,
    title: `Invoice ${data.invoice.number}`,
    // The markup is built by BookFlow from the invoice's own frozen snapshot; every value inside it
    // is HTML-escaped by the renderer. Scripts stay disabled; same-origin only lets us measure height.
    sandbox: 'allow-same-origin',
    srcDoc: html,
    scrolling: 'no',
    style: { display: 'block', width: '100%', height, border: 0 },
  });
}

type InvoiceStatus = 'Sent' | 'Partially Paid' | 'Accepted' | 'Declined' | 'Paid' | 'Cancelled' | 'Void';

type InvoicePayload = {
  /** The interface language the sender's app was in when the link was made. */
  locale?: Locale;
  /**
   * The frozen presentation model written when the link was created. Links made before invoice
   * customisation existed do not have it, and fall back to the original layout below.
   */
  render?: InvoiceRenderData;
  invoice: {
    id?: string;
    invoiceNumber?: string;
    amount: number;
    depositPaid?: number;
    dueDate: string;
    sentAt: string;
    status: InvoiceStatus;
    terms?: string;
  };
  customer: { name: string; email: string; phone: string };
  businessProfile: { name: string; ssmRegistrationNo?: string; phone: string; email: string; address: string; logoUrl?: string };
  currency: 'MYR' | 'IDR' | 'USD';
  serviceName?: string;
  packageDetails?: string;
  eventLocation?: string;
  eventDate?: string;
  eventStartTime?: string;
  eventEndTime?: string;
};

type InvoiceResult = { payload: InvoicePayload; status: InvoiceStatus };

function formatDate(value?: string) {
  if (!value) return 'Not specified';
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en-MY', { dateStyle: 'long' }).format(parsed);
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function PartyCard({ label, name, lines, fallback }: { label: string; name: string; lines: string[]; fallback: string }) {
  return (
    <View style={styles.partyCard}>
      <Text style={styles.eyebrow}>{label}</Text>
      <Text style={styles.partyName}>{name || fallback}</Text>
      {lines.filter(Boolean).map((line) => (
        <Text key={line} style={styles.mutedText}>
          {line}
        </Text>
      ))}
    </View>
  );
}

function NativeInvoiceRedirect() {
  const { isAuthenticated, isLoaded } = useAuth();
  const loadingTransition = useLoadingTransition(!isLoaded);

  if (loadingTransition.visible) return <BookFlowLoading key={loadingTransition.cycle} loading={!isLoaded} />;

  return <Redirect href={isAuthenticated ? '/(tabs)' : '/(auth)/login'} />;
}

export default function PublicInvoiceRoute() {
  if (Platform.OS !== 'web') {
    return <NativeInvoiceRedirect />;
  }

  return <PublicInvoiceScreen />;
}

function PublicInvoiceScreen() {
  /**
   * The language the invoice was sent in, carried on the link itself. The reader's own device
   * language is deliberately not consulted: this page belongs to the invoice, not to whoever opens
   * it. Links made before this existed have no locale and read as English.
   */
  const [documentLocale, setDocumentLocale] = useState<Locale>(DEFAULT_LOCALE);
  const t = useCallback((key: TranslationKey) => translate(documentLocale, key), [documentLocale]);

  const params = useLocalSearchParams<{ token?: string | string[]; t?: string | string[] }>();
  const rawToken = params.token ?? params.t;
  const token = decodeInvoiceToken(Array.isArray(rawToken) ? rawToken[0] : rawToken);
  const { width } = useWindowDimensions();
  const [result, setResult] = useState<InvoiceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const loadingTransition = useLoadingTransition(isLoading);
  const [pendingAction, setPendingAction] = useState<'Accepted' | 'Declined' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const apiUrl = useMemo(() => {
    if (!token) return null;
    return `${getSupabaseFunctionUrl('invoice-public')}?format=json&token=${encodeURIComponent(token)}`;
  }, [token]);

  const loadInvoice = useCallback(async () => {
    if (!apiUrl) {
      setError(t('public.linkIncomplete'));
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(apiUrl, { headers: { accept: 'application/json' } });
      const body = await response.json();
      if (!response.ok) {
        setError(response.status === 404 ? t('public.linkIncomplete') : t('public.loadFailed'));
        setResult(null);
        return;
      }
      const loaded = body as InvoiceResult;
      setDocumentLocale(isLocale(loaded.payload?.locale) ? loaded.payload.locale : DEFAULT_LOCALE);
      setResult(loaded);
    } catch {
      setResult(null);
      setError(t('public.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  }, [apiUrl, t]);

  useEffect(() => {
    loadInvoice();
  }, [loadInvoice]);

  const respond = async (action: 'Accepted' | 'Declined') => {
    if (!apiUrl || pendingAction) return;
    setPendingAction(action);
    setError(null);
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const body = await response.json();
      if (!response.ok) {
        if (response.status === 409) await loadInvoice();
        setError(t('public.responseFailed'));
        return;
      }
      const loaded = body as InvoiceResult;
      setDocumentLocale(isLocale(loaded.payload?.locale) ? loaded.payload.locale : DEFAULT_LOCALE);
      setResult(loaded);
      setNotice(action === 'Accepted' ? t('public.accepted') : t('public.declined'));
    } catch {
      setError(t('public.responseFailed'));
    } finally {
      setPendingAction(null);
    }
  };

  if (loadingTransition.visible) {
    return <BookFlowLoading key={loadingTransition.cycle} loading={isLoading} />;
  }

  if (!result) {
    return (
      <SafeAreaView style={styles.centeredPage}>
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>{t('public.unavailable')}</Text>
          <Text style={styles.errorMessage}>{error ?? 'This invoice link is invalid or has expired.'}</Text>
          <Pressable onPress={loadInvoice} style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}>
            <Text style={styles.retryButtonText}>{t('app.tryAgain')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const { payload, status } = result;
  const formatter = new Intl.NumberFormat(
    payload.currency === 'MYR' ? 'ms-MY' : payload.currency === 'IDR' ? 'id-ID' : 'en-US',
    { style: 'currency', currency: payload.currency },
  );
  const deposit = payload.invoice.depositPaid ?? 0;
  const balance = status === 'Paid' ? 0 : Math.max(0, payload.invoice.amount - deposit);
  // Cancelled and Void are what the app writes when an invoice is moved to the dustbin or voided. The
  // customer is only ever told the invoice is no longer active, never why.
  const isInactive = status === 'Cancelled' || status === 'Void';
  const canRespond = status === 'Sent';
  const stackContent = width < 680;

  return (
    <SafeAreaView style={styles.page}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.container}>
          {payload.render ? (
            <View style={styles.templatedCard}>
              <TemplatedInvoiceDocument data={payload.render} />
              <View style={styles.templatedActions}>
                {isInactive ? (
                  <Text accessibilityRole="alert" style={styles.inactiveBanner}>
                    This invoice is no longer active. Please contact the sender if you need a new one.
                  </Text>
                ) : null}
                {notice ? <Text style={styles.notice}>{notice}</Text> : null}
                {error ? <Text style={styles.inlineError}>{error}</Text> : null}
                {canRespond ? (
                  <View style={[styles.actions, stackContent && styles.actionsStacked]}>
                    <Pressable
                      accessibilityRole="button"
                      disabled={Boolean(pendingAction)}
                      onPress={() => respond('Declined')}
                      style={({ pressed }) => [styles.actionButton, styles.declineButton, pressed && styles.pressed]}>
                      {pendingAction === 'Declined' ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.actionButtonText}>{t('public.declineInvoice')}</Text>}
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      disabled={Boolean(pendingAction)}
                      onPress={() => respond('Accepted')}
                      style={({ pressed }) => [styles.actionButton, styles.acceptButton, pressed && styles.pressed]}>
                      {pendingAction === 'Accepted' ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.actionButtonText}>{t('public.accept')}</Text>}
                    </Pressable>
                  </View>
                ) : isInactive ? (
                  <Text style={styles.resolved}>{t('public.resolved')}</Text>
                ) : (
                  <Text style={styles.resolved}>This invoice is {status.toLowerCase()}.</Text>
                )}
              </View>
              <Text style={styles.footer}>{t('public.footer')}</Text>
            </View>
          ) : (
            <>
          {payload.businessProfile.logoUrl ? (
            <Image
              source={{ uri: payload.businessProfile.logoUrl }}
              style={styles.businessLogo}
              resizeMode="contain"
              accessibilityLabel={`${payload.businessProfile.name || 'Business'} logo`}
            />
          ) : (
            <Text style={styles.brand}>BOOKFLOW</Text>
          )}
          <View style={styles.card}>
            <View style={styles.rule} />
            <View style={styles.content}>
              <View style={[styles.header, stackContent && styles.headerStacked]}>
                <View>
                  <Text style={styles.eyebrow}>{t('doc.invoice')}</Text>
                  <Text selectable style={styles.invoiceId}>{payload.invoice.invoiceNumber || payload.invoice.id}</Text>
                </View>
                <View style={[styles.statusPill, isInactive && styles.statusPillInactive]}>
                  <Text style={[styles.statusText, isInactive && styles.statusTextInactive]}>
                    {isInactive ? t('public.noLongerActive') : status}
                  </Text>
                </View>
              </View>

              {isInactive ? (
                <Text accessibilityRole="alert" style={styles.inactiveBanner}>
                  This invoice is no longer active. Please contact the sender if you need a new one.
                </Text>
              ) : null}
              {notice ? <Text style={styles.notice}>{notice}</Text> : null}
              {error ? <Text style={styles.inlineError}>{error}</Text> : null}

              <View style={[styles.parties, stackContent && styles.partiesStacked]}>
                <PartyCard
                  fallback={t('public.notSpecified')}
                  label={t('doc.from')}
                  name={payload.businessProfile.name || 'BookFlow business'}
                  lines={[
                    payload.businessProfile.ssmRegistrationNo ? `SSM: ${payload.businessProfile.ssmRegistrationNo}` : '',
                    payload.businessProfile.phone,
                    payload.businessProfile.email,
                    payload.businessProfile.address,
                  ]}
                />
                <PartyCard
                  fallback={t('public.notSpecified')}
                  label={t('doc.billToLabel')}
                  name={payload.customer.name}
                  lines={[payload.customer.email, payload.customer.phone]}
                />
              </View>

              <View style={styles.summary}>
                <Text style={styles.eyebrow}>{t('public.service')}</Text>
                <Text style={styles.serviceName}>{payload.serviceName || 'Custom service'}</Text>
                <Text style={styles.description}>{payload.packageDetails || 'Professional services'}</Text>
                <Text style={styles.amount}>{formatter.format(payload.invoice.amount)}</Text>
              </View>

              <View style={styles.details}>
                <DetailRow label={t('doc.issued')} value={formatDate(payload.invoice.sentAt)} />
                <DetailRow label={t('public.dueDate')} value={formatDate(payload.invoice.dueDate)} />
                <DetailRow label={t('doc.depositPaid')} value={formatter.format(deposit)} />
                <DetailRow label={t('doc.balanceDue')} value={formatter.format(balance)} />
                <DetailRow
                  label={t('public.event')}
                  value={`${formatDate(payload.eventDate)} · ${payload.eventStartTime || t('public.notSpecified')}–${payload.eventEndTime || t('public.notSpecified')}`}
                />
                <DetailRow label={t('doc.location')} value={payload.eventLocation || t('public.notSpecified')} />
              </View>

              {payload.invoice.terms?.trim() ? (
                <View style={styles.terms}>
                  <Text style={styles.eyebrow}>{t('public.infoTerms')}</Text>
                  <Text style={styles.termsText}>{payload.invoice.terms}</Text>
                </View>
              ) : null}

              {canRespond ? (
                <View style={[styles.actions, stackContent && styles.actionsStacked]}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={Boolean(pendingAction)}
                    onPress={() => respond('Declined')}
                    style={({ pressed }) => [styles.actionButton, styles.declineButton, pressed && styles.pressed]}>
                    {pendingAction === 'Declined' ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.actionButtonText}>{t('public.declineInvoice')}</Text>}
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={Boolean(pendingAction)}
                    onPress={() => respond('Accepted')}
                    style={({ pressed }) => [styles.actionButton, styles.acceptButton, pressed && styles.pressed]}>
                    {pendingAction === 'Accepted' ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.actionButtonText}>{t('public.accept')}</Text>}
                  </Pressable>
                </View>
              ) : isInactive ? (
                <Text style={styles.resolved}>{t('public.resolved')}</Text>
              ) : (
                <Text style={styles.resolved}>This invoice is {status.toLowerCase()}.</Text>
              )}
            </View>
            <Text style={styles.footer}>{t('public.footer')}</Text>
          </View>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F4F6FB' },
  centeredPage: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#F4F6FB' },
  scrollContent: { flexGrow: 1, paddingHorizontal: 14, paddingVertical: 28 },
  container: { width: '100%', maxWidth: 760, alignSelf: 'center' },
  brand: { marginBottom: 18, color: '#4F46E5', fontSize: 13, fontWeight: '800', letterSpacing: 1.8 },
  businessLogo: { width: 148, height: 62, marginBottom: 18 },
  card: { overflow: 'hidden', backgroundColor: '#FFFFFF', borderColor: '#E4E7EC', borderWidth: 1, borderRadius: 24 },
  templatedCard: { overflow: 'hidden', backgroundColor: '#FFFFFF', borderColor: '#E4E7EC', borderWidth: 1, borderRadius: 20 },
  templatedActions: { paddingHorizontal: 28, paddingBottom: 8 },
  rule: { height: 7, backgroundColor: '#4F46E5' },
  content: { padding: 28 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 18 },
  headerStacked: { alignItems: 'flex-start', flexDirection: 'column' },
  eyebrow: { color: '#667085', fontSize: 11, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  invoiceId: { marginTop: 5, color: '#172033', fontSize: 30, fontWeight: '800', letterSpacing: -0.8 },
  statusPill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: '#EEF2FF' },
  statusText: { color: '#4338CA', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  statusPillInactive: { backgroundColor: '#F2F4F7' },
  statusTextInactive: { color: '#475467' },
  inactiveBanner: { marginTop: 20, padding: 14, borderRadius: 12, backgroundColor: '#F2F4F7', color: '#344054', fontWeight: '700', lineHeight: 20 },
  notice: { marginTop: 20, padding: 14, borderRadius: 12, backgroundColor: '#ECFDF3', color: '#067647', fontWeight: '700' },
  inlineError: { marginTop: 20, padding: 14, borderRadius: 12, backgroundColor: '#FEF3F2', color: '#B42318', fontWeight: '700' },
  parties: { flexDirection: 'row', gap: 16, marginTop: 26 },
  partiesStacked: { flexDirection: 'column' },
  partyCard: { flex: 1, minWidth: 0, padding: 17, borderColor: '#E4E7EC', borderWidth: 1, borderRadius: 15 },
  partyName: { marginTop: 7, marginBottom: 3, color: '#172033', fontSize: 17, fontWeight: '800' },
  mutedText: { color: '#667085', fontSize: 13, lineHeight: 20 },
  summary: { marginTop: 18, padding: 18, borderRadius: 15, backgroundColor: '#F8FAFC' },
  serviceName: { marginTop: 6, color: '#172033', fontSize: 16, fontWeight: '800' },
  description: { marginTop: 4, color: '#667085', fontSize: 14, lineHeight: 21 },
  amount: { marginTop: 12, color: '#172033', fontSize: 28, fontWeight: '800' },
  details: { marginTop: 12 },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 18, paddingVertical: 9, borderBottomColor: '#EAECF0', borderBottomWidth: 1 },
  detailLabel: { color: '#667085', fontSize: 13 },
  detailValue: { flex: 1, color: '#172033', fontSize: 13, fontWeight: '700', textAlign: 'right' },
  terms: { marginTop: 18, padding: 16, borderRadius: 14, backgroundColor: '#F8FAFC' },
  termsText: { marginTop: 7, color: '#172033', fontSize: 14, lineHeight: 21 },
  actions: { flexDirection: 'row', gap: 14, marginTop: 24 },
  actionsStacked: { flexDirection: 'column' },
  actionButton: { flex: 1, minHeight: 50, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, borderRadius: 14 },
  declineButton: { backgroundColor: '#B42318' },
  acceptButton: { backgroundColor: '#4F46E5' },
  actionButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  pressed: { opacity: 0.82 },
  resolved: { marginTop: 24, padding: 15, borderRadius: 14, backgroundColor: '#F2F4F7', color: '#344054', textAlign: 'center', fontWeight: '800' },
  footer: { paddingHorizontal: 30, paddingVertical: 18, borderTopColor: '#EAECF0', borderTopWidth: 1, color: '#98A2B3', fontSize: 11, textAlign: 'center' },
  errorCard: { width: '100%', maxWidth: 520, padding: 30, borderColor: '#E4E7EC', borderWidth: 1, borderRadius: 22, backgroundColor: '#FFFFFF', alignItems: 'center' },
  errorTitle: { color: '#172033', fontSize: 24, fontWeight: '800', textAlign: 'center' },
  errorMessage: { marginTop: 10, color: '#667085', fontSize: 15, lineHeight: 23, textAlign: 'center' },
  retryButton: { marginTop: 22, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14, backgroundColor: '#4F46E5' },
  retryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
