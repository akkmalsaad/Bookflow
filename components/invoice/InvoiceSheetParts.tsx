import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { getSoftTokens } from '@/components/settings/tokens';
import { getThemePalette, useTheme } from '@/context/theme-context';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

/**
 * The invoice identity block every destructive sheet leads with: number, client, amount. Shown so
 * the user is always confirming against the invoice in front of them, never a remembered one.
 */
export function InvoiceIdentityCard({
  invoiceNumber,
  clientName,
  amount,
  note,
}: {
  invoiceNumber: string;
  clientName: string;
  amount: string;
  note?: string;
}) {
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);

  return (
    <View style={[styles.identity, { backgroundColor: soft.inset, borderColor: soft.border }]}>
      <Text style={[styles.identityNumber, { color: palette.text }]}>{invoiceNumber}</Text>
      <Text style={[styles.identityClient, { color: palette.muter }]} numberOfLines={1}>
        {clientName}
      </Text>
      <Text style={[styles.identityAmount, { color: palette.text }]}>{amount}</Text>
      {note ? <Text style={[styles.identityNote, { color: palette.muter }]}>{note}</Text> : null}
    </View>
  );
}

/** Amber "this cannot be undone" / "history is preserved" callout used above the confirm buttons. */
export function SheetCallout({ icon, tone, children }: { icon: IoniconName; tone: 'warning' | 'danger'; children: string }) {
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);
  const color = tone === 'danger' ? palette.danger : palette.warning;

  return (
    <View style={[styles.callout, { backgroundColor: tone === 'danger' ? soft.dangerSoft : soft.inset }]}>
      <Ionicons name={icon} size={17} color={color} />
      <Text style={[styles.calloutText, { color: palette.text }]}>{children}</Text>
    </View>
  );
}

export const invoiceSheetStyles = StyleSheet.create({
  header: {
    marginBottom: 12,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  description: {
    fontSize: 13.5,
    fontWeight: '500',
    lineHeight: 20,
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.65,
    marginBottom: 9,
    textTransform: 'uppercase',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  secondaryButton: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 52,
  },
  secondaryText: {
    fontSize: 15,
    fontWeight: '800',
  },
  destructiveButton: {
    alignItems: 'center',
    borderRadius: 16,
    elevation: 5,
    flex: 1.35,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 12,
    shadowOffset: { height: 7, width: 0 },
    shadowOpacity: 0.24,
    shadowRadius: 12,
  },
  destructiveText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  disabled: {
    opacity: 0.55,
  },
  pressed: {
    opacity: 0.8,
  },
});

const styles = StyleSheet.create({
  identity: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
    paddingHorizontal: 15,
    paddingVertical: 13,
  },
  identityNumber: {
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  identityClient: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 3,
  },
  identityAmount: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.4,
    marginTop: 8,
  },
  identityNote: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
  },
  callout: {
    alignItems: 'flex-start',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 9,
    marginTop: 14,
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  calloutText: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '600',
    lineHeight: 18,
  },
});
