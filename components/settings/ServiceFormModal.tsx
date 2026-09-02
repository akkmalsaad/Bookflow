import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BottomSheetModal } from '@/components/BottomSheetModal';
import { ServiceForm, type ServiceFormValues } from '@/components/settings/ServiceForm';
import { getSoftTokens } from '@/components/settings/tokens';
import type { PackageOption } from '@/context/app-data-context';
import { getThemePalette, useTheme } from '@/context/theme-context';

type Props = {
  visible: boolean;
  /** The package being edited. Null opens the sheet in create mode. */
  service: PackageOption | null;
  onClose: () => void;
  onSubmit: (values: ServiceFormValues, service: PackageOption | null) => void;
};

/**
 * One sheet for both adding and editing a service. Create mode starts empty; edit mode seeds the
 * same ServiceForm from the selected package, so the two flows share a single form and a single
 * modal implementation.
 */
export function ServiceFormModal({ visible, service, onClose, onSubmit }: Props) {
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);
  const isEdit = service !== null;

  return (
    <BottomSheetModal visible={visible} onClose={onClose}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={[styles.eyebrow, { color: palette.accent }]}>Services</Text>
          <Text style={[styles.title, { color: palette.text }]}>{isEdit ? 'Edit service' : 'New service'}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isEdit ? 'Close service editor' : 'Close new service form'}
          onPress={onClose}
          style={[styles.closeButton, { backgroundColor: soft.inset }]}>
          <Ionicons name="close" size={22} color={palette.text} />
        </Pressable>
      </View>

      {/* ServiceForm owns its own scroll area and pinned actions, so there is no nested scroll. */}
      <ServiceForm
        // Remount per package so the fields always seed from whatever the sheet was opened for.
        key={service?.id ?? 'new-service'}
        mode={isEdit ? 'edit' : 'create'}
        initialValues={service ?? undefined}
        onSubmit={(values) => onSubmit(values, service)}
        onCancel={onClose}
      />
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 12,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  title: {
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
});
