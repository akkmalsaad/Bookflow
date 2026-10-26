import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, StyleSheet, Text, View } from 'react-native';

import { BottomSheetModal } from '@/components/BottomSheetModal';
import { AddBookingModal } from '@/components/booking/AddBookingModal';
import { BookingFormDeleteConfirmation } from '@/components/booking/BookingFormDeleteConfirmation';
import { ChangeRequestSheet } from '@/components/booking/ChangeRequestSheet';
import { LinkReadyPanel } from '@/components/booking/LinkReadyPanel';
import { getBookingFormColors } from '@/components/booking/booking-form-styles';
import { SuccessFeedback } from '@/components/feedback/SuccessFeedback';
import { InvoiceActionSheet, type InvoiceActionSheetItem } from '@/components/invoice/InvoiceActionSheet';
import { getCurrencyFormatter, useAppData } from '@/context/app-data-context';
import { useSnackbar } from '@/context/snackbar-context';
import { getThemePalette, useTheme } from '@/context/theme-context';
import { captureEvent } from '@/lib/analytics';
import { canReviseOffer, getOfferTotals, type BookingOffer } from '@/lib/booking-offers';
import { useTranslation } from '@/lib/use-translation';

type Props = {
  /** The booking form whose actions are open, or null when the sheet is closed. */
  offer: BookingOffer | null;
  /** 'request' opens the form's change request straight away instead of the actions list. */
  view?: 'actions' | 'request';
  onClose: () => void;
};

type LinkSheet =
  | { status: 'loading'; offerId: string }
  | { status: 'ready'; offerId: string; url: string; expiresAt: string; customerId?: string };

/**
 * A booking form's actions — View Request, Edit Booking Form, Send Link, Turn Off Link, Delete Form — with everything
 * they open: the change request, the edit form, the link panel, the turn-off confirmation, the
 * delete confirmation and its success feedback. Shared by Quotes & forms and the Bookings calendar,
 * so a form behaves the same wherever it is tapped. Each sheet waits for the previous one to slide
 * away, so two are never on screen at once.
 */
export function BookingFormActionSheet({ offer: passedOffer, view = 'actions', onClose }: Props) {
  const router = useRouter();
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const colors = getBookingFormColors(isDarkMode, palette);
  const { t } = useTranslation();
  const { showSnackbar } = useSnackbar();
  const { offers, customers, currency, shareOffer, revokeOffer, deleteBookingForm, refreshOffers } = useAppData();
  const formatter = useMemo(() => getCurrencyFormatter(currency), [currency]);
  // Always the form as it is now, so a response pulled in while the sheet is open (a new change
  // request) updates its actions; callers may hold an older copy.
  const offer = passedOffer ? offers.find((item) => item.id === passedOffer.id) ?? passedOffer : null;
  const [sharing, setSharing] = useState(false);
  const [link, setLink] = useState<LinkSheet | null>(null);
  // Identifies the share in flight, so a result that lands after its sheet was closed is dropped.
  const shareAttempt = useRef(0);
  const editCustomerQueued = useRef<string | null>(null);
  // Actions that open another sheet run once the actions list has finished sliding away.
  const [shareQueued, setShareQueued] = useState<BookingOffer | null>(null);
  const [requestQueued, setRequestQueued] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const editQueued = useRef<BookingOffer | null>(null);
  const [editMenuQueued, setEditMenuQueued] = useState<BookingOffer | null>(null);
  const [editOffer, setEditOffer] = useState<BookingOffer | null>(null);
  const [deleteQueued, setDeleteQueued] = useState<BookingOffer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BookingOffer | null>(null);
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deletedPending = useRef(false);
  const [showDeleted, setShowDeleted] = useState(false);

  // Read live, so the request shown is always the form's current one.
  const requestOffer = requestId ? offers.find((item) => item.id === requestId) ?? null : null;

  // Each opening checks for customer responses, so a change request that arrived while the app
  // stayed open shows up here (the list below follows the live offer once it lands).
  useEffect(() => {
    if (!offer) return;
    refreshOffers().catch(() => {});
    // Once per opened form, not on every refresh of the function itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer?.id]);

  // Opened straight to the change request (the card's "View request"): the actions list is skipped.
  useEffect(() => {
    if (!offer || view !== 'request') return;
    setRequestId(offer.id);
    onClose();
  }, [offer, view, onClose]);

  const customerLabel = (form: BookingOffer) => {
    const customer = form.customerId ? customers.find((entry) => entry.id === form.customerId) : undefined;
    return customer ? t('of.forCustomer', { name: customer.name }) : form.response?.name ? t('of.forCustomer', { name: form.response.name }) : t('of.anyCustomer');
  };

  /**
   * Opens the link sheet at once, showing that the link is being prepared, and fills it in when it
   * arrives. Every outcome — ready, failed, or closed while waiting — leaves nothing spinning.
   */
  const share = async (form: BookingOffer) => {
    if (sharing) return;
    const attempt = ++shareAttempt.current;
    setSharing(true);
    setLink({ status: 'loading', offerId: form.id });
    try {
      const result = await shareOffer(form.id);
      if (attempt !== shareAttempt.current) return;
      if (!result.ok) {
        setLink(null);
        showSnackbar({ message: result.error, tone: 'danger' });
        return;
      }
      captureEvent('offer_shared', { kind: form.kind, version: form.version });
      setLink({ status: 'ready', offerId: form.id, url: result.url, expiresAt: result.expiresAt, customerId: form.customerId });
    } catch {
      if (attempt !== shareAttempt.current) return;
      setLink(null);
      showSnackbar({ message: t('app.error.connection'), tone: 'danger' });
    } finally {
      setSharing(false);
    }
  };

  const closeLink = () => {
    shareAttempt.current += 1;
    setLink(null);
  };

  const revoke = (form: BookingOffer) => {
    Alert.alert(t('of.revoke'), t('of.revoke.confirm'), [
      { text: t('of.cancel'), style: 'cancel' },
      {
        text: t('of.revoke'),
        style: 'destructive',
        onPress: async () => {
          const result = await revokeOffer(form.id);
          if (!result.ok) showSnackbar({ message: result.error ?? t('of.refreshFailed'), tone: 'danger' });
        },
      },
    ]);
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deletingRef.current) return;
    deletingRef.current = true;
    setDeleting(true);
    setDeleteError(null);
    try {
      const result = await deleteBookingForm(deleteTarget.id);
      if (!result.ok) {
        setDeleteError(result.error ?? t('of.deleteForm.failed'));
        return;
      }
      captureEvent('booking_form_deleted', { status: deleteTarget.status });
      deletedPending.current = true;
      setDeleteTarget(null);
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  };

  // All the standing actions are always listed; one the form's state rules out is disabled, not
  // hidden. View request and Edit booking form appear only while the customer's request is waiting.
  const linkOpen = Boolean(offer && offer.status !== 'revoked' && offer.status !== 'declined');
  const canTurnOff = Boolean(offer?.sharedAt && offer.status !== 'revoked' && offer.status !== 'converted');
  // A request whose status was reset to `sent` (by re-sharing) keeps its notes on the server. They
  // stay readable from the menu, but the form is not presented as having a pending request.
  const hasEarlierRequest = Boolean(offer && offer.status === 'sent' && offer.changeRequest?.trim());
  const items: InvoiceActionSheetItem[] = offer
    ? [
        ...(offer.status === 'change_requested'
          ? [
              { key: 'request', icon: 'chatbubble-ellipses-outline' as const, label: t('of.request.view'), onPress: () => { setRequestQueued(offer.id); onClose(); } },
              { key: 'edit-form', icon: 'create-outline' as const, label: t('of.request.edit'), disabled: !canReviseOffer(offer), onPress: () => { setEditMenuQueued(offer); onClose(); } },
            ]
          : hasEarlierRequest
            ? [{ key: 'request', icon: 'chatbubble-ellipses-outline' as const, label: t('of.request.viewEarlier'), onPress: () => { setRequestQueued(offer.id); onClose(); } }]
            : []),
        { key: 'share', icon: 'share-outline' as const, label: t('of.form.sendLink'), disabled: !linkOpen || sharing, onPress: () => { setShareQueued(offer); onClose(); } },
        { key: 'revoke', icon: 'close-circle-outline' as const, label: t('of.form.turnOff'), destructive: true, separatedAbove: true, disabled: !canTurnOff, onPress: () => { const form = offer; onClose(); revoke(form); } },
        { key: 'delete-form', icon: 'trash-outline' as const, label: t('of.form.delete'), destructive: true, onPress: () => { const form = offer; setDeleteError(null); setDeleteQueued(form); onClose(); } },
      ]
    : [];

  const linkCustomer = link?.status === 'ready' && link.customerId ? customers.find((item) => item.id === link.customerId) : undefined;

  return (
    <>
      <InvoiceActionSheet
        visible={offer !== null && view !== 'request'}
        onClose={onClose}
        onClosed={() => {
          if (shareQueued) {
            const form = shareQueued;
            setShareQueued(null);
            void share(form);
          }
          if (requestQueued) {
            setRequestId(requestQueued);
            setRequestQueued(null);
          }
          if (editMenuQueued) {
            setEditOffer(editMenuQueued);
            setEditMenuQueued(null);
          }
          if (deleteQueued) {
            setDeleteTarget(deleteQueued);
            setDeleteQueued(null);
          }
        }}
        title={offer ? t('of.label.booking_form') : ''}
        subtitle={offer?.details.title}
        items={items}
      />

      <ChangeRequestSheet
        offer={requestOffer}
        customerLabel={requestOffer ? customerLabel(requestOffer) : ''}
        onClose={() => setRequestId(null)}
        onEdit={() => {
          editQueued.current = requestOffer;
          setRequestId(null);
        }}
        onClosed={() => {
          const form = editQueued.current;
          editQueued.current = null;
          if (form) setEditOffer(form);
        }}
      />

      {/* The existing booking modal, prefilled from the form; saving revises this same form. */}
      {editOffer ? (
        <AddBookingModal
          mode="form"
          sourceOffer={editOffer}
          selectedDate={editOffer.details.date}
          onClose={() => setEditOffer(null)}
        />
      ) : null}

      <BookingFormDeleteConfirmation
        visible={deleteTarget !== null}
        title={deleteTarget?.details.title ?? ''}
        customerLabel={deleteTarget ? customerLabel(deleteTarget) : ''}
        amount={deleteTarget ? formatter.format(getOfferTotals(deleteTarget.details).totalCents / 100) : ''}
        isBusy={deleting}
        error={deleteError}
        onConfirm={confirmDelete}
        onClose={() => {
          setDeleteTarget(null);
          setDeleteError(null);
        }}
        onClosed={() => {
          if (!deletedPending.current) return;
          deletedPending.current = false;
          setShowDeleted(true);
        }}
      />

      <BottomSheetModal
        visible={link !== null}
        onClose={closeLink}
        onClosed={() => {
          // The customer's details open only once this sheet is gone, so no sheet is left over them.
          const customerId = editCustomerQueued.current;
          editCustomerQueued.current = null;
          if (customerId) router.push({ pathname: '/customer/[customerId]', params: { customerId, edit: '1' } });
        }}
        heightRatio={0.8}>
        {link?.status === 'loading' ? (
          <View accessibilityRole="progressbar" accessibilityLabel={t('link.preparing')} style={styles.loading}>
            <ActivityIndicator color={palette.accent} />
            <Text style={[styles.loadingText, { color: palette.muter }]}>{t('link.preparing')}</Text>
          </View>
        ) : link?.status === 'ready' ? (
          <View style={styles.linkBody}>
            <LinkReadyPanel
              title={t('bm.sendForm.title')}
              body={t('bm.sendForm.body')}
              url={link.url}
              expiresAt={link.expiresAt}
              phone={linkCustomer?.phone}
              onEditPhone={linkCustomer ? () => {
                editCustomerQueued.current = linkCustomer.id;
                closeLink();
              } : undefined}
              colors={colors}
              onDone={closeLink}
            />
          </View>
        ) : null}
      </BottomSheetModal>

      {/* The same presentation the Invoices screen uses for a confirmation outside any form. */}
      <Modal visible={showDeleted} transparent animationType="fade" onRequestClose={() => {}}>
        <View style={styles.successBackdrop}>
          <SuccessFeedback visible={showDeleted} title={t('of.deleteForm.done')} onComplete={() => setShowDeleted(false)} />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  linkBody: { paddingBottom: 24 },
  loading: { alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 160, paddingBottom: 24 },
  loadingText: { fontSize: 14, fontWeight: '700' },
  successBackdrop: { backgroundColor: 'rgba(15, 23, 42, 0.58)', flex: 1 },
});
