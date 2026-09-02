import { Image, StyleSheet, Text, View } from 'react-native';

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

function Line({ value, color }: { value?: string; color: string }) {
  if (!has(value)) return null;
  return <Text style={[styles.line, { color }]}>{value.trim()}</Text>;
}

function Row({ label, value, data }: { label: string; value?: string; data: InvoiceRenderData }) {
  if (!has(value)) return null;
  return (
    <View style={[styles.row, { borderBottomColor: data.tokens.border }]}>
      <Text style={[styles.rowLabel, { color: data.tokens.muted }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: data.tokens.text }]}>{value.trim()}</Text>
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

function Header({ data }: { data: InvoiceRenderData }) {
  const { business, invoice, design, tokens } = data;
  const logo = business.logoUrl ? (
    <Image source={{ uri: business.logoUrl }} style={styles.logo} resizeMode="contain" />
  ) : null;

  if (design.templateId === 'bold') {
    return (
      <View style={[styles.banner, { backgroundColor: tokens.accent }]}>
        <View style={styles.bannerBrand}>
          {business.logoUrl ? (
            <Image
              source={{ uri: business.logoUrl }}
              style={[styles.logo, styles.logoInvert, { backgroundColor: tokens.accentText }]}
              resizeMode="contain"
            />
          ) : null}
          <Text style={[styles.bannerName, { color: tokens.accentText }]} numberOfLines={2}>
            {business.name || 'Your business'}
          </Text>
          <Line value={business.email} color={tokens.accentText} />
          <Line value={business.phone} color={tokens.accentText} />
          {design.visibility.businessAddress ? <Line value={business.address} color={tokens.accentText} /> : null}
        </View>
        <View style={styles.bannerMeta}>
          <Text style={[styles.bannerTitle, { color: tokens.accentText }]}>INVOICE</Text>
          <Text style={[styles.bannerNumber, { color: tokens.accentText }]}>{invoice.number}</Text>
          {design.visibility.paymentStatus ? (
            <View style={[styles.badge, { backgroundColor: tokens.accentText }]}>
              <Text style={[styles.badgeText, { color: tokens.accent }]}>{invoice.paymentStatus}</Text>
            </View>
          ) : null}
        </View>
      </View>
    );
  }

  if (design.templateId === 'elegant') {
    return (
      <View style={styles.masthead}>
        {logo ? <View style={styles.logoCentre}>{logo}</View> : null}
        <Text style={[styles.mastheadName, { color: tokens.text }]} numberOfLines={2}>
          {(business.name || 'Your business').toUpperCase()}
        </Text>
        <View style={[styles.mastheadRule, { backgroundColor: tokens.accent }]} />
        <Text style={[styles.mastheadTitle, { color: tokens.accent }]}>INVOICE</Text>
        <Text style={[styles.mastheadNumber, { color: tokens.muted }]}>
          {invoice.number}
          {design.visibility.paymentStatus ? ` · ${invoice.paymentStatus}` : ''}
        </Text>
      </View>
    );
  }

  const minimal = design.templateId === 'minimal';

  return (
    <View style={styles.head}>
      <View style={styles.headMain}>
        {logo}
        {minimal || !business.logoUrl ? (
          <Text style={[styles.headBrand, { color: tokens.text }]} numberOfLines={2}>
            {business.name || 'Your business'}
          </Text>
        ) : null}
        {minimal ? null : (
          <Text style={[styles.headTitle, { color: tokens.accent }]}>Invoice</Text>
        )}
      </View>
      <View style={styles.headMeta}>
        {minimal ? <Text style={[styles.headTitleMinimal, { color: tokens.muted }]}>INVOICE</Text> : null}
        <Text style={[styles.headNumber, { color: tokens.text }]}>{invoice.number}</Text>
        <StatusBadge data={data} />
      </View>
    </View>
  );
}

export function InvoicePreview({ data }: { data: InvoiceRenderData }) {
  const { business, client, invoice, design, tokens, totals, payment } = data;
  const compact = design.templateId === 'compact';
  const bareTotal = design.templateId === 'minimal';
  const hasPayment =
    design.visibility.paymentInformation &&
    [payment.bankName, payment.accountHolder, payment.accountNumber, payment.duitNowId].some(has);

  return (
    <View style={[styles.sheet, compact && styles.sheetCompact, { backgroundColor: tokens.background }]}>
      {design.templateId === 'modern' ? (
        <View style={[styles.topRule, { backgroundColor: tokens.accent }]} />
      ) : null}

      <View style={[styles.body, compact && styles.bodyCompact, design.templateId === 'bold' && styles.bodyBold]}>
        <Header data={data} />

        <View style={[styles.parties, compact && styles.partiesCompact]}>
          {design.templateId === 'bold' ? null : (
            <View style={styles.party}>
              <Text style={[styles.label, { color: tokens.muted }]}>FROM</Text>
              <Text style={[styles.partyName, { color: tokens.text }]}>{business.name || 'Your business'}</Text>
              {has(business.registrationNumber) ? (
                <Line value={`SSM: ${business.registrationNumber}`} color={tokens.muted} />
              ) : null}
              <Line value={business.phone} color={tokens.muted} />
              <Line value={business.email} color={tokens.muted} />
              <Line value={business.website} color={tokens.muted} />
              {design.visibility.businessAddress ? <Line value={business.address} color={tokens.muted} /> : null}
            </View>
          )}
          <View style={styles.party}>
            <Text style={[styles.label, { color: tokens.muted }]}>BILL TO</Text>
            <Text style={[styles.partyName, { color: tokens.text }]}>{client.name || 'Client'}</Text>
            <Line value={client.email} color={tokens.muted} />
            <Line value={client.phone} color={tokens.muted} />
            {design.visibility.clientAddress ? <Line value={client.address} color={tokens.muted} /> : null}
          </View>
        </View>

        <View style={styles.meta}>
          <Row label="Invoice number" value={invoice.number} data={data} />
          <Row label="Issued" value={invoice.issuedOn} data={data} />
          {design.visibility.dueDate ? <Row label="Due" value={invoice.dueOn} data={data} /> : null}
          <Row label="Event date" value={invoice.eventDate} data={data} />
          <Row label="Event time" value={invoice.eventTime} data={data} />
          <Row label="Location" value={invoice.eventLocation} data={data} />
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
              <Text style={[styles.itemAmount, { color: tokens.text }]}>{item.amountLabel}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: tokens.muted }]}>Invoice total</Text>
            <Text style={[styles.totalValue, { color: tokens.text }]}>{totals.total}</Text>
          </View>
          {totals.hasDeposit ? (
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: tokens.muted }]}>Deposit paid</Text>
              <Text style={[styles.totalValue, { color: tokens.text }]}>{totals.depositPaid}</Text>
            </View>
          ) : null}
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: tokens.muted }]}>Amount paid</Text>
            <Text style={[styles.totalValue, { color: tokens.text }]}>{totals.amountPaid}</Text>
          </View>
          <View
            style={[
              styles.totalDue,
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
                styles.totalDueValue,
                { color: bareTotal ? tokens.text : design.templateId === 'elegant' ? tokens.accent : tokens.accentText },
              ]}>
              {totals.balance}
            </Text>
          </View>
        </View>

        {hasPayment ? (
          <Panel title="PAYMENT INFORMATION" data={data}>
            <Row label="Bank" value={payment.bankName} data={data} />
            <Row label="Account name" value={payment.accountHolder} data={data} />
            <Row label="Account number" value={payment.accountNumber} data={data} />
            <Row label="DuitNow" value={payment.duitNowId} data={data} />
          </Panel>
        ) : null}

        {design.visibility.paymentInstructions && has(data.paymentInstructions) ? (
          <Panel title="PAYMENT INSTRUCTIONS" data={data}>
            <Text style={[styles.copy, { color: tokens.muted }]}>{data.paymentInstructions.trim()}</Text>
          </Panel>
        ) : null}

        {design.visibility.terms && has(data.terms) ? (
          <Panel title="TERMS & CONDITIONS" data={data}>
            <Text style={[styles.copy, { color: tokens.muted }]}>{data.terms.trim()}</Text>
          </Panel>
        ) : null}

        {(design.visibility.thankYou && has(data.thankYouMessage)) || design.visibility.bookflowBranding ? (
          <View style={[styles.footer, { borderTopColor: tokens.border }]}>
            {design.visibility.thankYou && has(data.thankYouMessage) ? (
              <Text style={[styles.thankYou, { color: tokens.text }]}>{data.thankYouMessage.trim()}</Text>
            ) : null}
            {design.visibility.bookflowBranding ? (
              <Text style={[styles.branding, { color: tokens.muted }]}>Created with BookFlow</Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
  partyName: { fontSize: 13, fontWeight: '800', marginBottom: 2 },
  line: { fontSize: 11, lineHeight: 16 },

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
