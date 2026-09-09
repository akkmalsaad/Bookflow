import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SuccessFeedback } from '@/components/feedback/SuccessFeedback';
import type { ServiceFormValues } from '@/components/settings/ServiceForm';
import { ServiceFormModal } from '@/components/settings/ServiceFormModal';
import { modalScrollProps } from '@/components/modal-keyboard';
import { getSoftTokens } from '@/components/settings/tokens';
import { getCurrencyFormatter, type PackageOption, useAppData } from '@/context/app-data-context';
import { getThemePalette, useTheme } from '@/context/theme-context';
import { formatServiceDeposit } from '@/lib/service-defaults';
import { useTranslation } from '@/lib/use-translation';

type Props = {
  visible: boolean;
  onClose: () => void;
};

/** Services / event packages manager, unchanged from the old settings card. */
export function ServicesManagerModal({ visible, onClose }: Props) {
  const { isDarkMode } = useTheme();
  const { packages, addPackage, updatePackage, removePackage, currency } = useAppData();
  const palette = getThemePalette(isDarkMode);
  const { t } = useTranslation();
  const soft = getSoftTokens(isDarkMode);
  const currencyFormatter = useMemo(() => getCurrencyFormatter(currency), [currency]);
  const insets = useSafeAreaInsets();

  const [showServiceForm, setShowServiceForm] = useState(false);
  // Null while the sheet is open in create mode; set to the package being edited otherwise.
  const [editingService, setEditingService] = useState<PackageOption | null>(null);
  // Null when no confirmation is playing; otherwise the title the success animation is showing.
  const [successTitle, setSuccessTitle] = useState<string | null>(null);
  // The service the delete confirmation is asking about; null while no deletion is pending.
  const [pendingDelete, setPendingDelete] = useState<PackageOption | null>(null);

  const handleClose = () => {
    setShowServiceForm(false);
    setEditingService(null);
    // Closing mid-confirmation unmounts the animation, so clear it rather than letting it
    // reappear the next time the manager opens.
    setSuccessTitle(null);
    setPendingDelete(null);
    onClose();
  };

  /** Nothing is removed until this runs, so the trash button alone can no longer destroy a service. */
  const handleConfirmDelete = () => {
    if (!pendingDelete) return;

    removePackage(pendingDelete.id);
    setPendingDelete(null);
  };

  const openCreateForm = () => {
    setEditingService(null);
    setShowServiceForm(true);
  };

  const openEditForm = (service: PackageOption) => {
    setEditingService(service);
    setShowServiceForm(true);
  };

  const closeServiceForm = () => setShowServiceForm(false);

  const handleSubmitService = (values: ServiceFormValues, service: PackageOption | null) => {
    if (service) {
      updatePackage(service.id, values);
    } else {
      addPackage(values);
    }
    setShowServiceForm(false);
    setSuccessTitle(service ? t('services.updated') : t('services.added'));
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      {/* Insets live on the backdrop, not inside the card: padding within the card would push the
          content down but leave its rounded top edge sitting under the notch. */}
      <View style={[styles.modalBackdrop, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
        {/* No keyboard avoidance: the card holds still and the scroll area below absorbs it. */}
        <View style={[styles.cardWrap, successTitle !== null && styles.hiddenWhileConfirming]}>
          <View
            style={[styles.modalCard, { backgroundColor: soft.surface, borderColor: soft.border, shadowColor: soft.shadow }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalEyebrow, { color: palette.accent }]}>{t('services.eyebrow')}</Text>
                <Text style={[styles.modalTitle, { color: palette.text }]}>{t('services.title')}</Text>
              </View>
              <Pressable onPress={handleClose} hitSlop={8} accessibilityRole="button" style={[styles.closeButton, { backgroundColor: soft.inset }]} accessibilityLabel={t('a11y.closeServices')}>
                <Ionicons name="close" size={22} color={palette.text} />
              </Pressable>
            </View>

            <ScrollView {...modalScrollProps} contentContainerStyle={styles.modalContent}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('services.add')}
                style={[styles.addServiceButton, { backgroundColor: palette.accent, shadowColor: palette.accent }]}
                onPress={openCreateForm}>
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={styles.addButtonText}>{t('services.add')}</Text>
              </Pressable>

              <View style={styles.packageList}>
                    {packages.length > 0 ? (
                      packages.map((item) => {
                        // Only the defaults the service actually carries are shown, so a service
                        // saved before these fields existed simply prints its name and price.
                        const depositLabel = formatServiceDeposit(item, currencyFormatter);
                        const durationLabel = item.duration.trim();

                        return (
                        <View key={item.id} style={[styles.packageItem, { backgroundColor: soft.inset, borderColor: soft.border }]}>
                          <View style={styles.serviceItemHeader}>
                            <View style={styles.packageInfo}>
                              <Text style={[styles.packageName, { color: palette.text }]}>{item.name}</Text>
                              <Text style={[styles.packagePrice, { color: palette.accent }]}>{currencyFormatter.format(item.price)}</Text>
                            </View>
                            <View style={styles.packageActions}>
                              <Pressable
                                accessibilityRole="button"
                                hitSlop={6}
                                onPress={() => openEditForm(item)}
                                style={({ pressed }) => [
                                  styles.actionButton,
                                  { backgroundColor: soft.surface },
                                  pressed && styles.pressed,
                                ]}
                                accessibilityLabel={`Edit ${item.name}`}>
                                <Ionicons name="pencil" size={16} color={palette.accent} />
                              </Pressable>
                              <Pressable
                                accessibilityRole="button"
                                hitSlop={6}
                                onPress={() => setPendingDelete(item)}
                                style={({ pressed }) => [
                                  styles.actionButton,
                                  { backgroundColor: soft.surface },
                                  pressed && styles.pressed,
                                ]}
                                accessibilityLabel={`Delete ${item.name}`}>
                                <Ionicons name="trash-outline" size={17} color="#E11D48" />
                              </Pressable>
                            </View>
                          </View>
                          {item.details.trim() ? (
                            <Text style={[styles.serviceDetails, { color: palette.muter }]}>{item.details}</Text>
                          ) : null}
                          {/* Defaults for new bookings. Each is omitted when the service does not
                              set it, so services saved before these fields existed show neither. */}
                          {durationLabel || depositLabel ? (
                            <View style={styles.serviceMetaRow}>
                              {durationLabel ? (
                                <View style={styles.serviceMetaItem}>
                                  <Ionicons name="time-outline" size={14} color={palette.muter} />
                                  <Text style={[styles.serviceMetaText, { color: palette.muter }]}>{durationLabel}</Text>
                                </View>
                              ) : null}
                              {depositLabel ? (
                                <View style={styles.serviceMetaItem}>
                                  <Ionicons name="wallet-outline" size={14} color={palette.muter} />
                                  <Text style={[styles.serviceMetaText, { color: palette.muter }]}>{depositLabel}</Text>
                                </View>
                              ) : null}
                            </View>
                          ) : null}
                          {item.info ? (
                            <View style={[styles.termsPreview, { backgroundColor: soft.surface, borderColor: soft.border }]}>
                              <Text style={[styles.termsLabel, { color: palette.muter }]}>{t('services.invoiceInfo')}</Text>
                              <Text style={[styles.termsText, { color: palette.text }]}>{item.info}</Text>
                            </View>
                          ) : null}
                        </View>
                        );
                      })
                    ) : (
                      <View style={[styles.emptyServices, { backgroundColor: soft.inset, borderColor: soft.border }]}>
                        <Ionicons name="cube-outline" size={24} color={palette.muter} />
                        <Text style={[styles.emptyServicesText, { color: palette.muter }]}>{t('services.empty')}</Text>
                      </View>
                    )}
              </View>
            </ScrollView>
          </View>
        </View>

        {pendingDelete ? (
          <View style={styles.confirmOverlay}>
            <View style={[styles.confirmDialog, { backgroundColor: soft.surface, borderColor: soft.border, shadowColor: soft.shadow }]}>
              <View style={[styles.confirmIcon, { backgroundColor: soft.dangerSoft }]}>
                <Ionicons name="trash-outline" size={25} color={palette.danger} />
              </View>
              <Text style={[styles.confirmTitle, { color: palette.text }]}>{t('services.deleteTitle')}</Text>
              <Text style={[styles.confirmCopy, { color: palette.muter }]}>
                “{pendingDelete.name}” will be removed from your services. Bookings already made with it
                keep their own name and price, so they are not affected.
              </Text>
              <View style={styles.confirmActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Keep ${pendingDelete.name}`}
                  onPress={() => setPendingDelete(null)}
                  style={({ pressed }) => [
                    styles.confirmCancelButton,
                    { backgroundColor: soft.inset, borderColor: soft.border },
                    pressed && styles.pressed,
                  ]}>
                  <Text style={[styles.confirmCancelText, { color: palette.text }]}>{t('services.deleteCancel')}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${pendingDelete.name}`}
                  onPress={handleConfirmDelete}
                  style={({ pressed }) => [
                    styles.confirmDeleteButton,
                    { backgroundColor: palette.danger, shadowColor: palette.danger },
                    pressed && styles.pressed,
                  ]}>
                  <Text style={styles.confirmDeleteText}>{t('services.deleteConfirm')}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}

        <SuccessFeedback
          visible={successTitle !== null}
          title={successTitle ?? ''}
          message={successTitle === t('services.updated') ? t('services.updated.body') : t('services.added.body')}
          onComplete={() => setSuccessTitle(null)}
        />
      </View>

      <ServiceFormModal
        visible={showServiceForm}
        service={editingService}
        onClose={closeServiceForm}
        onSubmit={handleSubmitService}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.58)',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  cardWrap: {
    maxWidth: 720,
    width: '100%',
  },
  modalCard: {
    alignSelf: 'center',
    borderRadius: 28,
    borderWidth: 1,
    elevation: 14,
    // The backdrop already holds the safe area out of bounds, so this is 100% of what is left.
    maxHeight: '100%',
    maxWidth: 720,
    padding: 20,
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.32,
    shadowRadius: 24,
    width: '100%',
  },
  modalContent: {
    paddingBottom: 8,
  },
  modalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  modalEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.35,
  },
  closeButton: {
    alignItems: 'center',
    borderRadius: 14,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  addServiceButton: {
    alignItems: 'center',
    borderRadius: 17,
    elevation: 4,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    marginBottom: 14,
    paddingVertical: 14,
    shadowOffset: { height: 6, width: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  packageList: {
    gap: 10,
  },
  packageItem: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
  },
  packageInfo: {
    flex: 1,
  },
  packageName: {
    fontSize: 14,
    fontWeight: '800',
  },
  packagePrice: {
    fontSize: 12,
    fontWeight: '800',
    marginTop: 4,
  },
  serviceItemHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
  },
  serviceDetails: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
  serviceMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 8,
  },
  serviceMetaItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  serviceMetaText: {
    fontSize: 12,
    fontWeight: '700',
  },
  termsPreview: {
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 10,
    padding: 11,
  },
  termsLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  termsText: {
    fontSize: 12,
    lineHeight: 17,
  },
  packageActions: {
    alignItems: 'center',
    flexDirection: 'row',
    // Keeps the destructive button a deliberate reach away from Edit.
    gap: 12,
  },
  actionButton: {
    alignItems: 'center',
    borderRadius: 12,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  /** The sheet steps aside for the confirmation, leaving the card on the backdrop's own dim. */
  hiddenWhileConfirming: {
    display: 'none',
  },
  confirmOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.58)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  confirmDialog: {
    alignItems: 'center',
    borderRadius: 28,
    borderWidth: 1,
    elevation: 14,
    maxWidth: 440,
    padding: 22,
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    width: '100%',
  },
  confirmIcon: {
    alignItems: 'center',
    borderRadius: 18,
    height: 56,
    justifyContent: 'center',
    marginBottom: 15,
    width: 56,
  },
  confirmTitle: {
    fontSize: 21,
    fontWeight: '900',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  confirmCopy: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 20,
    marginTop: 7,
    textAlign: 'center',
  },
  confirmActions: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  confirmCancelButton: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  confirmCancelText: {
    fontWeight: '800',
  },
  confirmDeleteButton: {
    alignItems: 'center',
    borderRadius: 16,
    elevation: 4,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
    shadowOffset: { height: 6, width: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
  },
  confirmDeleteText: {
    color: '#fff',
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.75,
  },
  emptyServices: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 30,
  },
  emptyServicesText: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 8,
  },
});
