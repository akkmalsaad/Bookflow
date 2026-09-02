import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { StatusPill } from '@/components/StatusPill';
import { getSoftTokens } from '@/components/settings/tokens';
import type { Invoice } from '@/context/app-data-context';
import { getThemePalette, useTheme } from '@/context/theme-context';
import { getDaysUntilPermanentDelete, isInvoiceVoided } from '@/lib/invoice-lifecycle';
import { getInvoiceNumber } from '@/lib/invoice-numbering';

type Props = {
  invoice: Invoice;
  clientName: string;
  amount: string;
  /** True while this card's own restore is in flight; other cards stay usable. */
  isRestoring: boolean;
  /** True while any mutation is running anywhere in Dustbin. */
  isBusy: boolean;
  onRestore: () => void;
  onOpenMenu: () => void;
};

/**
 * One invoice sitting in Dustbin. Same soft card, accent stripe and typography as the active invoice
 * list, reduced to what matters here: what it was, what it was worth, when it was deleted, and the
 * two ways out.
 */
export function InvoiceTrashCard({
  invoice,
  clientName,
  amount,
  isRestoring,
  isBusy,
  onRestore,
  onOpenMenu,
}: Props) {
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);
  const invoiceNumber = getInvoiceNumber(invoice);
  const service = invoice.serviceName?.trim();
  const voided = isInvoiceVoided(invoice);
  const daysLeft = getDaysUntilPermanentDelete(invoice.deletedAt);
  // Counts down to the automatic purge, and turns red on the last few days so the warning arrives
  // before the invoice does rather than after it is gone.
  const isExpiringSoon = daysLeft !== null && daysLeft <= 3;
  const retentionLabel =
    daysLeft === null
      ? null
      : daysLeft === 0
        ? 'Deletes today'
        : `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`;
  // The reason is optional at deletion, so the row says so plainly rather than sitting empty.
  const reasonLabel = invoice.deletionReason?.trim() || 'No reason given';

  return (
    <View style={[styles.card, { backgroundColor: soft.surface, borderColor: soft.border, shadowColor: soft.shadow }]}>
      <View style={[styles.accent, { backgroundColor: voided ? palette.danger : palette.muter }]} />

      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={[styles.invoiceNumber, { color: palette.text }]} numberOfLines={1}>
            {invoiceNumber}
          </Text>
          <Text style={[styles.client, { color: palette.muter }]} numberOfLines={1}>
            {clientName}
          </Text>
          {service ? (
            <Text style={[styles.service, { color: palette.muter }]} numberOfLines={1}>
              {service}
            </Text>
          ) : null}
        </View>
        <View style={styles.headerMeta}>
          <Text style={[styles.amount, { color: palette.text }]} numberOfLines={1}>
            {amount}
          </Text>
          {voided ? <StatusPill label="Void" tone="red" /> : null}
        </View>
      </View>

      <View style={[styles.metaPanel, { backgroundColor: soft.inset }]}>
        <Ionicons name="information-circle-outline" size={15} color={palette.muter} />
        <Text
          style={[styles.metaText, { color: palette.muter }, !invoice.deletionReason && styles.metaTextEmpty]}
          numberOfLines={1}>
          {reasonLabel}
        </Text>
        {retentionLabel ? (
          <View style={[styles.retentionPill, { backgroundColor: isExpiringSoon ? soft.dangerSoft : soft.surface }]}>
            <Ionicons
              name={isExpiringSoon ? 'alert-circle-outline' : 'hourglass-outline'}
              size={12}
              color={isExpiringSoon ? palette.danger : palette.muter}
            />
            <Text
              style={[styles.retentionText, { color: isExpiringSoon ? palette.danger : palette.muter }]}
              numberOfLines={1}>
              {retentionLabel}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.actionRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Restore invoice ${invoiceNumber}`}
          accessibilityHint="Returns this invoice to your active invoices"
          accessibilityState={{ disabled: isBusy, busy: isRestoring }}
          disabled={isBusy}
          onPress={onRestore}
          style={({ pressed }) => [
            styles.restoreButton,
            { backgroundColor: soft.accentSoft, borderColor: palette.accent },
            pressed && styles.pressed,
            isBusy && styles.disabled,
          ]}>
          {isRestoring ? (
            <ActivityIndicator color={palette.accent} size="small" />
          ) : (
            <Ionicons name="arrow-undo-outline" size={18} color={palette.accent} />
          )}
          <Text style={[styles.restoreText, { color: palette.accent }]} numberOfLines={1}>
            {isRestoring ? 'Restoring…' : 'Restore'}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`More actions for invoice ${invoiceNumber}`}
          accessibilityState={{ disabled: isBusy }}
          disabled={isBusy}
          hitSlop={6}
          onPress={onOpenMenu}
          style={({ pressed }) => [
            styles.menuButton,
            { backgroundColor: soft.inset, borderColor: soft.border },
            pressed && styles.pressed,
            isBusy && styles.disabled,
          ]}>
          <Ionicons name="ellipsis-horizontal" size={20} color={palette.text} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    borderWidth: 1,
    elevation: 3,
    marginBottom: 14,
    overflow: 'hidden',
    paddingBottom: 14,
    paddingHorizontal: 16,
    paddingTop: 16,
    shadowOffset: { height: 7, width: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
  },
  accent: {
    height: 4,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  headerRow: {
    flexDirection: 'row',
    gap: 12,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  headerMeta: {
    alignItems: 'flex-end',
    gap: 7,
  },
  invoiceNumber: {
    fontSize: 15.5,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  client: {
    fontSize: 13.5,
    fontWeight: '700',
    marginTop: 4,
  },
  service: {
    fontSize: 12.5,
    fontWeight: '500',
    marginTop: 3,
  },
  amount: {
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  metaPanel: {
    alignItems: 'center',
    borderRadius: 13,
    flexDirection: 'row',
    gap: 8,
    marginTop: 13,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  metaText: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '600',
  },
  metaTextEmpty: {
    // Reads as an absence rather than as a reason someone actually chose.
    fontStyle: 'italic',
    opacity: 0.75,
  },
  retentionPill: {
    alignItems: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  retentionText: {
    fontSize: 11,
    fontWeight: '800',
  },
  actionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginTop: 13,
  },
  restoreButton: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 12,
  },
  restoreText: {
    fontSize: 14,
    fontWeight: '800',
  },
  menuButton: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    height: 46,
    justifyContent: 'center',
    width: 52,
  },
  pressed: {
    opacity: 0.75,
  },
  disabled: {
    opacity: 0.5,
  },
});
