import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ServiceFormValues } from '@/components/settings/ServiceForm';
import { ServiceFormModal } from '@/components/settings/ServiceFormModal';
import { modalScrollProps } from '@/components/modal-keyboard';
import { getSoftTokens } from '@/components/settings/tokens';
import { getCurrencyFormatter, type PackageOption, useAppData } from '@/context/app-data-context';
import { getThemePalette, useTheme } from '@/context/theme-context';

type Props = {
  visible: boolean;
  onClose: () => void;
};

/** Services / event packages manager, unchanged from the old settings card. */
export function ServicesManagerModal({ visible, onClose }: Props) {
  const { isDarkMode } = useTheme();
  const { packages, addPackage, updatePackage, removePackage, currency } = useAppData();
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);
  const currencyFormatter = useMemo(() => getCurrencyFormatter(currency), [currency]);
  const insets = useSafeAreaInsets();

  const [showServiceForm, setShowServiceForm] = useState(false);
  // Null while the sheet is open in create mode; set to the package being edited otherwise.
  const [editingService, setEditingService] = useState<PackageOption | null>(null);
  const [toast, setToast] = useState('');
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  /** Subtle confirmation pill above the list; fades itself out. */
  const showToast = (message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastOpacity.setValue(0);
    Animated.timing(toastOpacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    toastTimer.current = setTimeout(() => {
      Animated.timing(toastOpacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(({ finished }) => {
        if (finished) setToast('');
      });
    }, 2200);
  };

  const handleClose = () => {
    setShowServiceForm(false);
    setEditingService(null);
    onClose();
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
      showToast('Package updated successfully');
    } else {
      addPackage(values);
    }
    setShowServiceForm(false);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      {/* Insets live on the backdrop, not inside the card: padding within the card would push the
          content down but leave its rounded top edge sitting under the notch. */}
      <View style={[styles.modalBackdrop, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
        {/* No keyboard avoidance: the card holds still and the scroll area below absorbs it. */}
        <View style={styles.cardWrap}>
          <View
            style={[styles.modalCard, { backgroundColor: soft.surface, borderColor: soft.border, shadowColor: soft.shadow }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalEyebrow, { color: palette.accent }]}>Services</Text>
                <Text style={[styles.modalTitle, { color: palette.text }]}>Event packages</Text>
              </View>
              <Pressable onPress={handleClose} accessibilityRole="button" style={[styles.closeButton, { backgroundColor: soft.inset }]} accessibilityLabel="Close services editor">
                <Ionicons name="close" size={22} color={palette.text} />
              </Pressable>
            </View>

            {toast ? (
              <Animated.View
                accessibilityLiveRegion="polite"
                style={[styles.toast, { backgroundColor: soft.accentSoft, opacity: toastOpacity }]}>
                <Ionicons name="checkmark-circle" size={16} color={palette.accent} />
                <Text style={[styles.toastText, { color: palette.accent }]}>{toast}</Text>
              </Animated.View>
            ) : null}

            <ScrollView {...modalScrollProps} contentContainerStyle={styles.modalContent}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add new service"
                style={[styles.addServiceButton, { backgroundColor: palette.accent, shadowColor: palette.accent }]}
                onPress={openCreateForm}>
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={styles.addButtonText}>Add new service</Text>
              </Pressable>

              <View style={styles.packageList}>
                    {packages.length > 0 ? (
                      packages.map((item) => (
                        <View key={item.id} style={[styles.packageItem, { backgroundColor: soft.inset, borderColor: soft.border }]}>
                          <View style={styles.serviceItemHeader}>
                            <View style={styles.packageInfo}>
                              <Text style={[styles.packageName, { color: palette.text }]}>{item.name}</Text>
                              <Text style={[styles.packagePrice, { color: palette.accent }]}>{currencyFormatter.format(item.price)}</Text>
                            </View>
                            <View style={styles.packageActions}>
                              <Pressable
                                accessibilityRole="button"
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
                                onPress={() => removePackage(item.id)}
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
                          <Text style={[styles.serviceDetails, { color: palette.muter }]}>{item.details}</Text>
                          <View style={styles.serviceMetaRow}>
                            <Ionicons name="time-outline" size={14} color={palette.muter} />
                            <Text style={[styles.serviceMetaText, { color: palette.muter }]}>{item.duration}</Text>
                          </View>
                          {item.info ? (
                            <View style={[styles.termsPreview, { backgroundColor: soft.surface, borderColor: soft.border }]}>
                              <Text style={[styles.termsLabel, { color: palette.muter }]}>Invoice info</Text>
                              <Text style={[styles.termsText, { color: palette.text }]}>{item.info}</Text>
                            </View>
                          ) : null}
                        </View>
                      ))
                    ) : (
                      <View style={[styles.emptyServices, { backgroundColor: soft.inset, borderColor: soft.border }]}>
                        <Ionicons name="cube-outline" size={24} color={palette.muter} />
                        <Text style={[styles.emptyServicesText, { color: palette.muter }]}>No services yet</Text>
                      </View>
                    )}
              </View>
            </ScrollView>
          </View>
        </View>
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
    gap: 5,
    marginTop: 8,
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
  toast: {
    alignItems: 'center',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  toastText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
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
