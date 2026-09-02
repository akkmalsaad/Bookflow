import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InvoiceActionSheet, type InvoiceActionSheetItem } from '@/components/invoice/InvoiceActionSheet';
import { InvoiceDeleteConfirmation } from '@/components/invoice/InvoiceDeleteConfirmation';
import { RecordDepositModal } from '@/components/RecordDepositModal';
import { StatusPill } from '@/components/StatusPill';
import { UpdatePaymentModal } from '@/components/UpdatePaymentModal';
import { Customer, getCurrencyFormatter, Invoice, useAppData } from '@/context/app-data-context';
import { useSnackbar } from '@/context/snackbar-context';
import { useSubscription } from '@/context/subscription-context';
import { getThemePalette, useTheme } from '@/context/theme-context';
import { getInvoiceRemovalAction, isInvoiceClosed } from '@/lib/invoice-lifecycle';
import { getInvoicePaymentSummary } from '@/lib/invoice-payments';
import { saveInvoiceAsPdf } from '@/lib/invoice-pdf';
import { getInvoiceNumber } from '@/lib/invoice-numbering';
import { shareInvoiceOnWhatsApp } from '@/lib/invoice-sharing';

function getInvoiceTone(status: Invoice['status']) {
  if (status === 'Paid') return 'green';
  if (status === 'Accepted') return 'blue';
  if (status === 'Overdue' || status === 'Partially Paid') return 'amber';
  if (status === 'Declined' || status === 'Cancelled' || status === 'Void') return 'red';
  return 'gray';
}

function formatEventDate(date?: string) {
  if (!date) return 'Not specified';

  const parsedDate = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) return date;

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(parsedDate);
}

function getProfileValue(value: string) {
  return value.trim() || 'Not provided';
}

export default function InvoiceAcceptanceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ invoiceId?: string }>();
  const { isDarkMode } = useTheme();
  const { isPro } = useSubscription();
  const {
    invoices,
    customers,
    bookings,
    packages,
    payments,
    businessProfile,
    invoiceSettings,
    updateInvoiceStatus,
    createInvoiceShareLink,
    trashInvoice,
    restoreInvoice,
    currency,
  } = useAppData();
  const { showSnackbar } = useSnackbar();
  const palette = getThemePalette(isDarkMode);
  const [isSavingPdf, setIsSavingPdf] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [depositInvoiceId, setDepositInvoiceId] = useState<string | null>(null);
  const [paymentInvoiceId, setPaymentInvoiceId] = useState<string | null>(null);
  const [showActions, setShowActions] = useState(false);
  // Two RN modals must never be on screen at once, so the confirmation waits for the menu's exit.
  const [removalQueued, setRemovalQueued] = useState(false);
  const [showRemoveConfirmation, setShowRemoveConfirmation] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const currencyFormatter = useMemo(() => getCurrencyFormatter(currency), [currency]);
  const foundInvoice = invoices.find((item) => item.id === params.invoiceId);
  const foundCustomer = foundInvoice ? customers.find((person) => person.id === foundInvoice.customerId) : undefined;
  // Removing an invoice takes it out of the active list immediately, which would otherwise flash
  // "Invoice not found" for the moment between the state change and this screen popping back.
  const lastLoadedRef = useRef<{ invoice: Invoice; customer: Customer } | null>(null);
  if (foundInvoice && foundCustomer) {
    lastLoadedRef.current = { invoice: foundInvoice, customer: foundCustomer };
  }
  const invoice = foundInvoice ?? (isRemoving ? lastLoadedRef.current?.invoice : undefined);
  const customer = foundCustomer ?? (isRemoving ? lastLoadedRef.current?.customer : undefined);
  const booking = invoice ? bookings.find((item) => item.id === invoice.bookingId) : undefined;
  const packageName = invoice?.serviceName ?? booking?.packageName;
  const packageOption = packages.find((item) => item.name === packageName)
    ?? packages.find((item) => item.price === invoice?.amount);
  const packageDetails = invoice?.packageDetails ?? packageOption?.details ?? 'No package description available.';
  const eventLocation = invoice?.eventLocation ?? booking?.location ?? 'Not specified';
  const eventDate = invoice?.eventDate ?? booking?.date;
  const eventStartTime = invoice?.eventStartTime ?? booking?.startTime ?? invoice?.eventTime ?? booking?.time ?? 'Not specified';
  const eventEndTime = invoice?.eventEndTime ?? booking?.endTime ?? 'Not specified';
  const paymentSummary = invoice ? getInvoicePaymentSummary(invoice, payments) : null;
  const depositPaid = paymentSummary?.amountPaid ?? 0;
  const remainingBalance = paymentSummary?.outstanding ?? 0;
  const canRecordPayments = Boolean(invoice && invoice.status !== 'Paid' && !isInvoiceClosed(invoice));
  const removalAction = invoice ? getInvoiceRemovalAction(invoice, payments) : null;
  const hasLogoSnapshot = invoice?.snapshot
    ? Object.prototype.hasOwnProperty.call(invoice.snapshot, 'businessLogoUrl')
    : false;
  const invoiceLogoUrl = isPro
    ? hasLogoSnapshot
      ? invoice?.snapshot?.businessLogoUrl ?? undefined
      : businessProfile.logoUrl
    : undefined;

  if (!invoice || !customer) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]}>
        <View style={styles.notFoundWrap}>
          <Text style={[styles.title, { color: palette.text }]}>Invoice not found</Text>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const handleAction = (status: 'Accepted' | 'Declined') => {
    updateInvoiceStatus(invoice.id, status);
    router.back();
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/(tabs)/invoices');
  };

  const handleSavePdf = async () => {
    if (isSavingPdf) return;

    setIsSavingPdf(true);
    try {
      await saveInvoiceAsPdf({
        invoice,
        customer,
        businessProfile,
        currency,
        payments,
        design: invoiceSettings.design,
        paymentInstructions: invoiceSettings.paymentInstructions,
        allowBusinessLogo: isPro,
        serviceName: packageName,
        packageDetails,
        eventLocation,
        eventDate,
        eventStartTime,
        eventEndTime,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The PDF could not be created. Please try again.';
      Alert.alert('Unable to save invoice', message);
    } finally {
      setIsSavingPdf(false);
    }
  };

  const handleShare = async () => {
    if (isSharing) return;

    setIsSharing(true);
    try {
      await shareInvoiceOnWhatsApp({
        invoice,
        customer,
        currencyFormatter,
        createShareLink: createInvoiceShareLink,
      });
    } finally {
      setIsSharing(false);
    }
  };

  /**
   * Removing an invoice always lands it in Dustbin. The list updates from the shared context, so the
   * screen simply pops back and hands the user an Undo that restores the very same record.
   */
  const handleRemoveInvoice = async (reason?: string) => {
    if (!removalAction || isRemoving) return;

    const invoiceId = invoice.id;
    const invoiceNumber = getInvoiceNumber(invoice);
    setRemoveError(null);
    setIsRemoving(true);
    const result = await trashInvoice({ invoiceId, mode: removalAction.mode, reason });

    if (!result.ok) {
      setIsRemoving(false);
      setRemoveError(result.error ?? 'The invoice could not be moved to the Dustbin.');
      return;
    }

    setShowRemoveConfirmation(false);
    handleBack();
    showSnackbar({
      message: result.error ?? (removalAction.mode === 'void' ? 'Invoice voided' : 'Invoice moved to the Dustbin'),
      tone: result.error ? 'danger' : 'default',
      action: {
        label: 'Undo',
        onPress: () => {
          restoreInvoice(invoiceId).then((undone) => {
            showSnackbar({
              message: undone.ok && !undone.error ? `${invoiceNumber} restored` : undone.error ?? 'The invoice could not be restored.',
              tone: undone.ok && !undone.error ? 'success' : 'danger',
            });
          });
        },
      },
    });
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to invoices"
          onPress={handleBack}
          style={({ pressed }) => [styles.navigationBackButton, pressed && styles.navigationBackButtonPressed]}>
          <Ionicons name="chevron-back" size={21} color={palette.accent} />
          <Text style={[styles.navigationBackText, { color: palette.accent }]}>Back</Text>
        </Pressable>

        <View style={styles.header}>
          <View>
            <Text style={[styles.eyebrow, { color: palette.accent }]}>Invoice details</Text>
            <Text style={[styles.title, { color: palette.text }]}>{getInvoiceNumber(invoice)}</Text>
          </View>
          <View style={styles.headerActions}>
            <StatusPill label={invoice.status} tone={getInvoiceTone(invoice.status)} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`More actions for invoice ${getInvoiceNumber(invoice)}`}
              accessibilityHint="Share, save as PDF, or remove this invoice"
              hitSlop={8}
              onPress={() => setShowActions(true)}
              style={({ pressed }) => [
                styles.overflowButton,
                { backgroundColor: palette.surface, borderColor: palette.border },
                pressed && styles.overflowButtonPressed,
              ]}>
              <Ionicons name="ellipsis-horizontal" size={20} color={palette.text} />
            </Pressable>
          </View>
        </View>

        <View
          style={[
            styles.card,
            {
              backgroundColor: palette.surface,
              borderColor: palette.border,
              shadowColor: isDarkMode ? '#020617' : '#101828',
            },
          ]}>
          {invoiceLogoUrl ? (
            <Image
              source={{ uri: invoiceLogoUrl }}
              style={styles.businessLogo}
              resizeMode="contain"
              accessibilityLabel={`${businessProfile.name || 'Business'} logo`}
            />
          ) : null}
          <Text style={[styles.sectionLabel, { color: palette.muter }]}>Business details</Text>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: palette.muter }]}>Business name</Text>
            <Text style={[styles.detailValue, { color: palette.text }]}>{getProfileValue(businessProfile.name)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: palette.muter }]}>SSM Registration No.</Text>
            <Text style={[styles.detailValue, { color: palette.text }]}>{getProfileValue(businessProfile.ssmRegistrationNo)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: palette.muter }]}>Contact number</Text>
            <Text style={[styles.detailValue, { color: palette.text }]}>{getProfileValue(businessProfile.phone)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: palette.muter }]}>Email</Text>
            <Text style={[styles.detailValue, { color: palette.text }]}>{getProfileValue(businessProfile.email)}</Text>
          </View>
          <View style={[styles.detailRow, styles.lastDetailRow]}>
            <Text style={[styles.detailLabel, { color: palette.muter }]}>Address</Text>
            <Text style={[styles.detailValue, { color: palette.text }]}>{getProfileValue(businessProfile.address)}</Text>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border, shadowColor: isDarkMode ? '#020617' : '#101828' }]}>
          <Text style={[styles.sectionLabel, { color: palette.muter }]}>Bill to</Text>
          <Text style={[styles.customerName, { color: palette.text }]}>{customer.name}</Text>
          <Text style={[styles.customerMeta, { color: palette.muter }]}>{customer.email}</Text>
          {customer.phone ? <Text style={[styles.customerMeta, { color: palette.muter }]}>{customer.phone}</Text> : null}

          <View style={[styles.divider, { backgroundColor: palette.border }]} />

          <Text style={[styles.sectionLabel, { color: palette.muter }]}>Amount</Text>
          <Text style={[styles.amount, { color: palette.text }]}>{currencyFormatter.format(invoice.amount)}</Text>
          {depositPaid > 0 ? (
            <View style={[styles.paymentBox, { backgroundColor: palette.surfaceAlt, borderColor: palette.border }]}>
              <View style={styles.paymentRow}>
                <Text style={[styles.paymentLabel, { color: palette.muter }]}>Amount paid</Text>
                <Text style={[styles.paymentValue, { color: palette.success }]}>{currencyFormatter.format(depositPaid)}</Text>
              </View>
              <View style={[styles.paymentDivider, { backgroundColor: palette.border }]} />
              <View style={[styles.paymentRow, styles.paymentRowLast]}>
                <Text style={[styles.paymentLabel, { color: palette.muter }]}>Remaining balance</Text>
                <Text style={[styles.balanceValue, { color: palette.text }]}>{currencyFormatter.format(remainingBalance)}</Text>
              </View>
            </View>
          ) : null}
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: palette.muter }]}>Issued</Text>
            <Text style={[styles.detailValue, { color: palette.text }]}>{formatEventDate(invoice.sentAt)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: palette.muter }]}>Due date</Text>
            <Text style={[styles.detailValue, { color: palette.text }]}>{formatEventDate(invoice.dueDate)}</Text>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border, shadowColor: isDarkMode ? '#020617' : '#101828' }]}>
          <Text style={[styles.sectionLabel, { color: palette.muter }]}>Package</Text>
          <Text style={[styles.packageName, { color: palette.text }]}>{packageName ?? 'Custom service'}</Text>
          <Text style={[styles.packageDetails, { color: palette.muter }]}>{packageDetails}</Text>

          <View style={[styles.divider, { backgroundColor: palette.border }]} />

          <Text style={[styles.sectionLabel, { color: palette.muter }]}>Event details</Text>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: palette.muter }]}>Location</Text>
            <Text style={[styles.detailValue, { color: palette.text }]}>{eventLocation}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: palette.muter }]}>Date</Text>
            <Text style={[styles.detailValue, { color: palette.text }]}>{formatEventDate(eventDate)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: palette.muter }]}>Start time</Text>
            <Text style={[styles.detailValue, { color: palette.text }]}>{eventStartTime}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: palette.muter }]}>Finish time</Text>
            <Text style={[styles.detailValue, { color: palette.text }]}>{eventEndTime}</Text>
          </View>

          {invoice.terms ? (
            <View style={[styles.termsBox, { backgroundColor: palette.surfaceAlt, borderColor: palette.border }]}>
              <Text style={[styles.termsLabel, { color: palette.muter }]}>Information & terms</Text>
              <Text style={[styles.termsText, { color: palette.text }]}>{invoice.terms}</Text>
            </View>
          ) : null}
        </View>

        {canRecordPayments ? (
          <View style={styles.paymentActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Record the deposit for this invoice"
              onPress={() => setDepositInvoiceId(invoice.id)}
              style={({ pressed }) => [
                styles.paymentActionButton,
                { backgroundColor: palette.iconWrap, borderColor: palette.accent },
                pressed && styles.paymentActionPressed,
              ]}>
              <Ionicons name="wallet-outline" size={18} color={palette.accent} />
              <Text style={[styles.paymentActionText, { color: palette.accent }]} numberOfLines={1}>
                Deposit paid
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Update payment for this invoice"
              onPress={() => setPaymentInvoiceId(invoice.id)}
              style={({ pressed }) => [
                styles.paymentActionButton,
                { backgroundColor: palette.surface, borderColor: palette.border },
                pressed && styles.paymentActionPressed,
              ]}>
              <Ionicons name="cash-outline" size={18} color={palette.accent} />
              <Text style={[styles.paymentActionText, { color: palette.text }]} numberOfLines={1}>
                Update payment
              </Text>
            </Pressable>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Save invoice ${getInvoiceNumber(invoice)} as PDF`}
          disabled={isSavingPdf}
          onPress={handleSavePdf}
          style={({ pressed }) => [
            styles.pdfButton,
            { backgroundColor: palette.surface, borderColor: palette.accent },
            pressed && styles.pdfButtonPressed,
            isSavingPdf && styles.pdfButtonDisabled,
          ]}>
          <Ionicons name={isSavingPdf ? 'hourglass-outline' : 'download-outline'} size={20} color={palette.accent} />
          <View style={styles.pdfButtonCopy}>
            <Text style={[styles.pdfButtonTitle, { color: palette.text }]}>
              {isSavingPdf ? 'Preparing PDF…' : 'Save as PDF'}
            </Text>
            <Text style={[styles.pdfButtonSubtitle, { color: palette.muter }]}>Keep a copy for future reference</Text>
          </View>
        </Pressable>

        {invoice.status !== 'Accepted' && invoice.status !== 'Paid' && invoice.status !== 'Void' && (
          <View style={styles.actions}>
            <Pressable style={styles.declineButton} onPress={() => handleAction('Declined')}>
              <Ionicons name="close-circle-outline" size={18} color="#fff" />
              <Text style={styles.buttonText}>Decline</Text>
            </Pressable>
            <Pressable style={styles.acceptButton} onPress={() => handleAction('Accepted')}>
              <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
              <Text style={styles.buttonText}>Accept</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      <RecordDepositModal invoiceId={depositInvoiceId} onClose={() => setDepositInvoiceId(null)} />

      <UpdatePaymentModal invoiceId={paymentInvoiceId} onClose={() => setPaymentInvoiceId(null)} />

      <InvoiceActionSheet
        visible={showActions}
        onClose={() => setShowActions(false)}
        onClosed={() => {
          if (!removalQueued) return;
          setRemovalQueued(false);
          setShowRemoveConfirmation(true);
        }}
        title={getInvoiceNumber(invoice)}
        subtitle={customer.name}
        items={[
          {
            key: 'share',
            icon: 'logo-whatsapp',
            label: isSharing ? 'Creating link…' : 'Share invoice',
            disabled: isSharing || isInvoiceClosed(invoice),
            accessibilityHint: 'Sends the secure invoice link over WhatsApp',
            onPress: () => {
              setShowActions(false);
              handleShare();
            },
          },
          {
            key: 'pdf',
            icon: 'download-outline',
            label: isSavingPdf ? 'Preparing PDF…' : 'Download PDF',
            disabled: isSavingPdf,
            onPress: () => {
              setShowActions(false);
              handleSavePdf();
            },
          },
          ...(removalAction
            ? ([
                {
                  key: 'remove',
                  icon: removalAction.mode === 'void' ? 'ban-outline' : 'trash-outline',
                  label: removalAction.menuLabel,
                  destructive: true,
                  separatedAbove: true,
                  accessibilityHint:
                    removalAction.mode === 'void'
                      ? 'Marks the invoice void and moves it to the Dustbin, keeping its payment history'
                      : 'Moves the invoice to the Dustbin, where you can restore it',
                  onPress: () => {
                    setRemoveError(null);
                    setRemovalQueued(true);
                    setShowActions(false);
                  },
                },
              ] satisfies InvoiceActionSheetItem[])
            : []),
        ]}
      />

      <InvoiceDeleteConfirmation
        visible={showRemoveConfirmation}
        action={removalAction}
        invoiceNumber={getInvoiceNumber(invoice)}
        clientName={customer.name}
        amount={currencyFormatter.format(invoice.amount)}
        amountPaidNote={
          depositPaid > 0 ? `${currencyFormatter.format(depositPaid)} already received` : undefined
        }
        isBusy={isRemoving}
        error={removeError}
        onConfirm={handleRemoveInvoice}
        onClose={() => {
          setShowRemoveConfirmation(false);
          setRemoveError(null);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  notFoundWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  overflowButton: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 44,
  },
  overflowButtonPressed: {
    opacity: 0.7,
  },
  navigationBackButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    marginBottom: 16,
    minHeight: 32,
    paddingRight: 10,
  },
  navigationBackButtonPressed: {
    opacity: 0.55,
  },
  navigationBackText: {
    fontSize: 15,
    fontWeight: '700',
  },
  eyebrow: {
    textTransform: 'uppercase',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
    marginBottom: 16,
  },
  businessLogo: {
    alignSelf: 'flex-start',
    height: 64,
    marginBottom: 16,
    width: 150,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  customerName: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 4,
  },
  customerMeta: {
    fontSize: 14,
    marginBottom: 3,
  },
  divider: {
    height: 1,
    marginVertical: 18,
  },
  amount: {
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 16,
  },
  paymentBox: {
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 18,
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  paymentRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  paymentRowLast: {
    paddingTop: 10,
  },
  paymentDivider: {
    height: StyleSheet.hairlineWidth,
    marginTop: 10,
  },
  paymentLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  paymentValue: {
    fontSize: 14,
    fontWeight: '900',
  },
  balanceValue: {
    fontSize: 17,
    fontWeight: '900',
  },
  packageName: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 7,
  },
  packageDetails: {
    fontSize: 14,
    lineHeight: 21,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 11,
  },
  lastDetailRow: {
    marginBottom: 0,
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginRight: 16,
  },
  detailValue: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
  },
  termsBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
  },
  termsLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  termsText: {
    fontSize: 13,
    lineHeight: 19,
  },
  paymentActions: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  paymentActionButton: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 12,
  },
  paymentActionText: {
    fontSize: 13,
    fontWeight: '800',
  },
  paymentActionPressed: {
    opacity: 0.75,
  },
  pdfButton: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  pdfButtonPressed: {
    opacity: 0.72,
  },
  pdfButtonDisabled: {
    opacity: 0.6,
  },
  pdfButtonCopy: {
    flex: 1,
  },
  pdfButtonTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  pdfButtonSubtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 6,
  },
  acceptButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#111827',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  declineButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#E11D48',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
  },
  backButton: {
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
    marginTop: 16,
  },
  backButtonText: {
    color: '#fff',
    fontWeight: '800',
  },
});
