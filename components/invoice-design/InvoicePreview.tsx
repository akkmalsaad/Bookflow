import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { DEFAULT_INVOICE_DOCUMENT_LABELS } from '@/lib/i18n';
import type { InvoiceRenderData } from '@/lib/invoice-design';

/**
 * The in-app invoice preview.
 *
 * Consumes the very same `InvoiceRenderData` the PDF and the customer's page are built from, and
 * the same `tokens` resolved from the accent — so the figures, the wording, the hidden sections and
 * the colours are identical by construction. Only the layout primitives differ: this draws with
 * React Native views where the other two emit HTML, which is what lets the preview update instantly
 * as settings change without a WebView or a native dependency.
 */

function has(value?: string | null): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function Line({ value, color, centered = false }: { value?: string; color: string; centered?: boolean }) {
  if (!has(value)) return null;
  return <Text style={[styles.line, { color }, centered && styles.centeredText]}>{value.trim()}</Text>;
}

function Row({ label, value, data }: { label: string; value?: string; data: InvoiceRenderData }) {
  if (!has(value)) return null;
  return (
    <View style={[styles.row, { borderBottomColor: data.tokens.border }]}>
      <Text style={[styles.rowLabel, { color: data.tokens.muted }]}>{label}</Text>
      <Text style={[styles.rowValue, data.design.templateId !== 'standard' && styles.proRowValue, { color: data.tokens.text }]}>{value.trim()}</Text>
    </View>
  );
}

function Panel({ title, children, data }: { title: string; children: React.ReactNode; data: InvoiceRenderData }) {
  const { design, tokens } = data;
  const bare = design.templateId === 'minimal' || design.templateId === 'elegant';

  return (
    <View
      style={[
        styles.panel,
        bare
          ? { borderColor: tokens.border, borderWidth: design.templateId === 'elegant' ? 1 : 0, borderTopWidth: 1, borderRadius: design.templateId === 'elegant' ? 2 : 0 }
          : { backgroundColor: tokens.surface },
      ]}>
      <Text style={[styles.label, { color: tokens.muted }]}>{title}</Text>
      {children}
    </View>
  );
}

function StatusBadge({ data }: { data: InvoiceRenderData }) {
  if (!data.design.visibility.paymentStatus) return null;
  const { tokens, design } = data;
  const bare = design.templateId === 'minimal';

  return (
    <View style={[styles.badge, bare ? styles.badgeBare : { backgroundColor: tokens.accentSoft }]}>
      <Text style={[styles.badgeText, { color: bare ? tokens.muted : tokens.accent }]}>
        {data.invoice.paymentStatus}
      </Text>
    </View>
  );
}

function BusinessIdentity({ data, centered = false }: { data: InvoiceRenderData; centered?: boolean }) {
  const { business, tokens, design } = data;
  const L = data.labels ?? DEFAULT_INVOICE_DOCUMENT_LABELS;
  return (
    <View style={centered && styles.centeredIdentity}>
      <Text style={[styles.partyName, { color: tokens.text }, centered && styles.centeredText,
        design.templateId === 'elegant' && styles.mastheadName,
        design.templateId === 'minimal' && styles.headBrand]}>
        {design.templateId === 'elegant' && centered ? (business.name || L.yourBusiness).toUpperCase() : business.name || L.yourBusiness}
      </Text>
      {has(business.registrationNumber) ? <Line value={`SSM: ${business.registrationNumber}`} color={tokens.muted} centered={centered} /> : null}
      <Line value={business.phone} color={tokens.muted} centered={centered} />
      <Line value={business.email} color={tokens.muted} centered={centered} />
      <Line value={business.website} color={tokens.muted} centered={centered} />
      {design.visibility.businessAddress ? <Line value={business.address} color={tokens.muted} centered={centered} /> : null}
    </View>
  );
}

function Header({ data, narrow }: { data: InvoiceRenderData; narrow: boolean }) {
  const L = data.labels ?? DEFAULT_INVOICE_DOCUMENT_LABELS;
  const { business, invoice, design, tokens } = data;
  const logo = business.logoUrl ? (
    <Image source={{ uri: business.logoUrl }} style={styles.logo} resizeMode="contain" />
  ) : null;

  if (design.templateId !== 'standard') {
    const bold = design.templateId === 'bold';
    const elegant = design.templateId === 'elegant';
    const minimal = design.templateId === 'minimal';
    return (
      <View style={[bold && [styles.banner, styles.proBanner, { backgroundColor: tokens.accent }], elegant && styles.masthead]}>
        {business.logoUrl ? (
          <Image source={{ uri: business.logoUrl }} resizeMode="contain"
            style={[styles.logo, styles.proLogo, minimal && styles.smallLogo,
              bold && [styles.logoInvert, { backgroundColor: tokens.accentText }]]} />
        ) : null}
        <View style={[styles.proHeading, !narrow && (bold || minimal) && styles.proHeadingSplit, (narrow || elegant) && styles.proHeadingCentered]}>
          {bold ? (
            <View style={[styles.bannerBrand, narrow && styles.centeredIdentity]}>
              <Text style={[styles.bannerName, { color: tokens.accentText }, narrow && styles.centeredText]}>{business.name || L.yourBusiness}</Text>
              <Line value={business.email} color={tokens.accentText} centered={narrow} />
              <Line value={business.phone} color={tokens.accentText} centered={narrow} />
              {design.visibility.businessAddress ? <Line value={business.address} color={tokens.accentText} centered={narrow} /> : null}
            </View>
          ) : narrow ? <BusinessIdentity data={data} centered /> : (
            minimal || elegant || !business.logoUrl ? <Text style={[elegant ? styles.mastheadName : styles.headBrand, styles.proName, { color: tokens.text }]}>{elegant ? (business.name || L.yourBusiness).toUpperCase() : business.name || L.yourBusiness}</Text> : null
          )}
          {elegant ? <View style={[styles.mastheadRule, { backgroundColor: tokens.accent }]} /> : null}
          <Text style={[bold ? styles.bannerTitle : elegant ? styles.mastheadTitle : minimal ? styles.headTitleMinimal : styles.headTitle,
            { color: bold ? tokens.accentText : minimal ? tokens.muted : tokens.accent }, narrow && styles.centeredText]}>
            {bold || elegant || minimal ? L.invoice.toUpperCase() : L.invoice}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.head}>
      <View style={styles.headMain}>
        {logo}
        {!business.logoUrl ? (
          <Text style={[styles.headBrand, { color: tokens.text }]} numberOfLines={2}>
            {business.name || L.yourBusiness}
          </Text>
        ) : null}
        <Text style={[styles.headTitle, { color: tokens.accent }]}>{L.invoice}</Text>
      </View>
      <View style={styles.headMeta}>
        <Text style={[styles.headNumber, { color: tokens.text }]}>{invoice.number}</Text>
        <StatusBadge data={data} />
      </View>
    </View>
  );
}

export function InvoicePreview({ data }: { data: InvoiceRenderData }) {
  const L = data.labels ?? DEFAULT_INVOICE_DOCUMENT_LABELS;
  const { business, client, invoice, design, tokens, totals, payment } = data;
  const [previewWidth, setPreviewWidth] = useState(0);
  const narrow = previewWidth <= 560;
  const proNarrow = design.templateId !== 'standard' && narrow;
  const compact = design.templateId === 'compact';
  const bareTotal = design.templateId === 'minimal';
  const hasPayment =
    design.visibility.paymentInformation &&
    [payment.bankName, payment.accountHolder, payment.accountNumber, payment.duitNowId].some(has);

  return (
    <View onLayout={(event) => setPreviewWidth(event.nativeEvent.layout.width)} style={[styles.sheet, compact && styles.sheetCompact, { backgroundColor: tokens.background }]}>
      {design.templateId === 'modern' ? (
        <View style={[styles.topRule, { backgroundColor: tokens.accent }]} />
      ) : null}

      <View style={[styles.body, compact && styles.bodyCompact, design.templateId === 'bold' && styles.bodyBold]}>
        <Header data={data} narrow={narrow} />

        <View style={[styles.parties, compact && styles.partiesCompact]}>
          {design.templateId === 'bold' || proNarrow ? null : (
            <View style={[styles.party, proNarrow && styles.narrowParty]}>
              <Text style={[styles.label, { color: tokens.muted }]}>{L.from}</Text>
              <Text style={[styles.partyName, { color: tokens.text }]}>{business.name || L.yourBusiness}</Text>
              {has(business.registrationNumber) ? (
                <Line value={`SSM: ${business.registrationNumber}`} color={tokens.muted} />
              ) : null}
              <Line value={business.phone} color={tokens.muted} />
              <Line value={business.email} color={tokens.muted} />
              <Line value={business.website} color={tokens.muted} />
              {design.visibility.businessAddress ? <Line value={business.address} color={tokens.muted} /> : null}
            </View>
          )}
          <View style={[styles.party, proNarrow && styles.narrowParty]}>
            <Text style={[styles.label, { color: tokens.muted }]}>{L.billTo}</Text>
            <Text style={[styles.partyName, { color: tokens.text }]}>{client.name || 'Client'}</Text>
            <Line value={client.email} color={tokens.muted} />
            <Line value={client.phone} color={tokens.muted} />
            {design.visibility.clientAddress ? <Line value={client.address} color={tokens.muted} /> : null}
          </View>
        </View>

        <View style={styles.meta}>
          <Row label={L.invoiceNumber} value={invoice.number} data={data} />
          <Row label={L.issued} value={invoice.issuedOn} data={data} />
          {design.visibility.dueDate ? <Row label={L.due} value={invoice.dueOn} data={data} /> : null}
          <Row label={L.eventDate} value={invoice.eventDate} data={data} />
          <Row label={L.eventTime} value={invoice.eventTime} data={data} />
          <Row label={L.location} value={invoice.eventLocation} data={data} />
        </View>

        <View style={styles.items}>
          <View
            style={[
              styles.itemsHead,
              design.templateId === 'bold'
                ? { backgroundColor: tokens.text }
                : design.templateId === 'minimal' || design.templateId === 'elegant'
                  ? { borderBottomColor: tokens.text, borderBottomWidth: 1 }
                  : { backgroundColor: tokens.accentSoft },
            ]}>
            <Text
              style={[
                styles.itemsHeadText,
                { color: design.templateId === 'bold' ? '#FFFFFF' : design.templateId === 'modern' || design.templateId === 'standard' || design.templateId === 'compact' ? tokens.accent : tokens.muted },
              ]}>
              DESCRIPTION
            </Text>
            <Text
              style={[
                styles.itemsHeadText,
                styles.amountText,
                { color: design.templateId === 'bold' ? '#FFFFFF' : design.templateId === 'modern' || design.templateId === 'standard' || design.templateId === 'compact' ? tokens.accent : tokens.muted },
              ]}>
              AMOUNT
            </Text>
          </View>
          {data.items.map((item) => (
            <View key={item.description} style={[styles.itemRow, { borderBottomColor: tokens.border }]}>
              <View style={styles.itemCopy}>
                <Text style={[styles.itemName, { color: tokens.text }]}>{item.description}</Text>
                {has(item.detail) ? (
                  <Text style={[styles.itemDetail, { color: tokens.muted }]}>{item.detail}</Text>
                ) : null}
              </View>
              <Text style={[styles.itemAmount, { color: tokens.text }, proNarrow && styles.narrowAmount]}>{item.amountLabel}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.totals, proNarrow && styles.narrowTotals]}>
          <View style={[styles.totalRow, proNarrow && styles.narrowTotalRow]}>
            <Text style={[styles.totalLabel, { color: tokens.muted }]}>{L.invoiceTotal}</Text>
            <Text style={[styles.totalValue, proNarrow && styles.narrowTotalValue, { color: tokens.text }]}>{totals.total}</Text>
          </View>
          {totals.hasDeposit ? (
            <View style={[styles.totalRow, proNarrow && styles.narrowTotalRow]}>
              <Text style={[styles.totalLabel, { color: tokens.muted }]}>{L.depositPaid}</Text>
              <Text style={[styles.totalValue, proNarrow && styles.narrowTotalValue, { color: tokens.text }]}>{totals.depositPaid}</Text>
            </View>
          ) : null}
          <View style={[styles.totalRow, proNarrow && styles.narrowTotalRow]}>
            <Text style={[styles.totalLabel, { color: tokens.muted }]}>{L.amountPaid}</Text>
            <Text style={[styles.totalValue, proNarrow && styles.narrowTotalValue, { color: tokens.text }]}>{totals.amountPaid}</Text>
          </View>
          <View
            style={[
              styles.totalDue,
              proNarrow && styles.narrowTotalRow,
              bareTotal
                ? { borderTopColor: tokens.text, borderTopWidth: 2 }
                : design.templateId === 'elegant'
                  ? { borderColor: tokens.accent, borderWidth: 1, borderRadius: 2 }
                  : { backgroundColor: tokens.accent },
            ]}>
            <Text
              style={[
                styles.totalDueLabel,
                { color: bareTotal || design.templateId === 'elegant' ? tokens.text : tokens.accentText },
              ]}>
              Balance due
            </Text>
            <Text
              style={[
                styles.totalDueValue, proNarrow && styles.narrowTotalValue,
                { color: bareTotal ? tokens.text : design.templateId === 'elegant' ? tokens.accent : tokens.accentText },
              ]}>
              {totals.balance}
            </Text>
          </View>
        </View>

        {hasPayment ? (
          <Panel title={L.paymentInformation.toUpperCase()} data={data}>
            <Row label={L.bank} value={payment.bankName} data={data} />
            <Row label={L.accountName} value={payment.accountHolder} data={data} />
            <Row label={L.accountNumber} value={payment.accountNumber} data={data} />
            <Row label={L.duitNow} value={payment.duitNowId} data={data} />
          </Panel>
        ) : null}

        {design.visibility.paymentInstructions && has(data.paymentInstructions) ? (
          <Panel title={L.paymentInstructions.toUpperCase()} data={data}>
            <Text style={[styles.copy, { color: tokens.muted }]}>{data.paymentInstructions.trim()}</Text>
          </Panel>
        ) : null}

        {design.visibility.terms && has(data.terms) ? (
          <Panel title={L.terms.toUpperCase()} data={data}>
            <Text style={[styles.copy, { color: tokens.muted }]}>{data.terms.trim()}</Text>
          </Panel>
        ) : null}

        {(design.visibility.thankYou && has(data.thankYouMessage)) || design.visibility.bookflowBranding ? (
          <View style={[styles.footer, { borderTopColor: tokens.border }]}>
            {design.visibility.thankYou && has(data.thankYouMessage) ? (
              <Text style={[styles.thankYou, { color: tokens.text }]}>{data.thankYouMessage.trim()}</Text>
            ) : null}
            {design.visibility.bookflowBranding ? (
              <Text style={[styles.branding, { color: tokens.muted }]}>{L.createdWith}</Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  proBanner: { flexDirection: 'column', gap: 0, marginBottom: 0 },
  proLogo: { alignSelf: 'center', maxWidth: '100%', marginBottom: 12 },
  smallLogo: { width: 104, height: 40 },
  proHeading: { gap: 14, width: '100%', minWidth: 0 },
  proName: { minWidth: 0, maxWidth: '100%', flexShrink: 1 },
  proHeadingSplit: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  proRowValue: { minWidth: 0, flexBasis: '58%' },
  proHeadingCentered: { alignItems: 'center' },
  centeredIdentity: { alignItems: 'center', width: '100%', minWidth: 0 },
  centeredText: { textAlign: 'center', maxWidth: '100%' },
  narrowParty: { minWidth: 0, flexBasis: '100%' },
  narrowAmount: { width: '40%', flexShrink: 1, textAlign: 'right' },
  narrowTotals: { minWidth: 0, width: '100%' },
  narrowTotalRow: { flexWrap: 'wrap' },
  narrowTotalValue: { flexShrink: 1, marginLeft: 'auto', textAlign: 'right' },
  sheet: { borderRadius: 14, overflow: 'hidden' },
  sheetCompact: {},
  topRule: { height: 5 },
  body: { paddingHorizontal: 22, paddingVertical: 22 },
  bodyCompact: { paddingHorizontal: 16, paddingVertical: 16 },
  bodyBold: { paddingTop: 0 },

  head: { flexDirection: 'row', gap: 16, justifyContent: 'space-between' },
  headMain: { flex: 1, minWidth: 0 },
  headBrand: { fontSize: 14, fontWeight: '800', letterSpacing: -0.2, marginBottom: 4 },
  headTitle: { fontSize: 28, fontWeight: '800', letterSpacing: -0.9 },
  headTitleMinimal: { fontSize: 11, fontWeight: '700', letterSpacing: 2.4 },
  headMeta: { alignItems: 'flex-end' },
  headNumber: { fontSize: 12.5, fontWeight: '800', marginTop: 3 },
  logo: { width: 110, height: 42, marginBottom: 8 },
  logoInvert: { borderRadius: 6, padding: 4 },
  logoCentre: { alignItems: 'center' },

  banner: { flexDirection: 'row', gap: 16, justifyContent: 'space-between', marginHorizontal: -22, marginBottom: 20, paddingHorizontal: 22, paddingVertical: 20 },
  bannerBrand: { flex: 1, minWidth: 0 },
  bannerName: { fontSize: 17, fontWeight: '800', letterSpacing: -0.3, marginBottom: 4 },
  bannerMeta: { alignItems: 'flex-end' },
  bannerTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 2.6, opacity: 0.85 },
  bannerNumber: { fontSize: 16, fontWeight: '800', marginTop: 2 },

  masthead: { alignItems: 'center', paddingBottom: 18 },
  mastheadName: { fontSize: 15, fontWeight: '700', letterSpacing: 2.2, textAlign: 'center' },
  mastheadRule: { height: 1, marginVertical: 11, width: 46 },
  mastheadTitle: { fontSize: 10.5, fontWeight: '700', letterSpacing: 4 },
  mastheadNumber: { fontSize: 11, letterSpacing: 0.5, marginTop: 5 },

  badge: { alignSelf: 'flex-end', borderRadius: 999, marginTop: 7, paddingHorizontal: 9, paddingVertical: 3 },
  badgeBare: { paddingHorizontal: 0 },
  badgeText: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.6 },

  parties: { flexDirection: 'row', flexWrap: 'wrap', gap: 18, marginTop: 22 },
  partiesCompact: { gap: 12, marginTop: 16 },
  party: { flexBasis: '44%', flexGrow: 1, minWidth: 150 },
  label: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.9, marginBottom: 5 },
  partyName: { minWidth: 0, maxWidth: '100%', fontSize: 13, fontWeight: '800', marginBottom: 2 },
  line: { minWidth: 0, maxWidth: '100%', fontSize: 11, lineHeight: 16 },

  meta: { marginTop: 18 },
  row: { borderBottomWidth: 1, flexDirection: 'row', gap: 14, justifyContent: 'space-between', paddingVertical: 6 },
  rowLabel: { flexShrink: 1, fontSize: 11 },
  rowValue: { flexShrink: 1, fontSize: 11, fontWeight: '700', textAlign: 'right' },

  items: { marginTop: 20 },
  itemsHead: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 8 },
  itemsHeadText: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.9 },
  itemRow: { borderBottomWidth: 1, flexDirection: 'row', gap: 12, justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 10 },
  itemCopy: { flex: 1, minWidth: 0 },
  itemName: { fontSize: 12, fontWeight: '700' },
  itemDetail: { fontSize: 11, lineHeight: 15, marginTop: 2 },
  itemAmount: { fontSize: 12, fontWeight: '700' },
  amountText: { textAlign: 'right' },

  totals: { alignSelf: 'flex-end', marginTop: 16, minWidth: 220 },
  totalRow: { flexDirection: 'row', gap: 16, justifyContent: 'space-between', paddingVertical: 4 },
  totalLabel: { fontSize: 11.5 },
  totalValue: { fontSize: 11.5, fontWeight: '700' },
  totalDue: { alignItems: 'center', borderRadius: 10, flexDirection: 'row', gap: 16, justifyContent: 'space-between', marginTop: 9, paddingHorizontal: 13, paddingVertical: 11 },
  totalDueLabel: { fontSize: 12.5, fontWeight: '800' },
  totalDueValue: { fontSize: 15, fontWeight: '800' },

  panel: { borderRadius: 10, marginTop: 16, paddingHorizontal: 14, paddingVertical: 12 },
  copy: { fontSize: 11, lineHeight: 16 },

  footer: { alignItems: 'center', borderTopWidth: 1, marginTop: 20, paddingTop: 14 },
  thankYou: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  branding: { fontSize: 9.5, letterSpacing: 0.3, marginTop: 5 },
});
