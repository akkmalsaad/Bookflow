import { Ionicons } from '@expo/vector-icons';
import type { ImagePickerAsset } from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardDoneButton } from '@/components/KeyboardDoneButton';
import { modalScrollProps } from '@/components/modal-keyboard';
import { getSoftTokens } from '@/components/settings/tokens';
import { CURRENCY_OPTIONS, useAppData } from '@/context/app-data-context';
import { useRequirePro, useSubscription } from '@/context/subscription-context';
import { getThemePalette, useTheme } from '@/context/theme-context';

type Props = {
  visible: boolean;
  onClose: () => void;
};

/** The business profile editor, unchanged from the old settings card — now opened from a row. */
export function BusinessProfileModal({ visible, onClose }: Props) {
  const { isDarkMode } = useTheme();
  const {
    businessProfile,
    updateBusinessProfile,
    uploadBusinessLogo,
    removeBusinessLogo,
    currency,
    updateCurrency,
  } = useAppData();
  const { isPro, isLoadingSubscription } = useSubscription();
  const requirePro = useRequirePro();
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);
  const insets = useSafeAreaInsets();

  const [profileName, setProfileName] = useState(businessProfile.name);
  const [profileSsmRegistrationNo, setProfileSsmRegistrationNo] = useState(businessProfile.ssmRegistrationNo);
  const [profileNature, setProfileNature] = useState(businessProfile.nature);
  const [profilePhone, setProfilePhone] = useState(businessProfile.phone);
  const [profileEmail, setProfileEmail] = useState(businessProfile.email);
  const [profileAddress, setProfileAddress] = useState(businessProfile.address);
  const [profileCurrency, setProfileCurrency] = useState(currency);
  const [selectedLogo, setSelectedLogo] = useState<ImagePickerAsset | null>(null);
  const [isLogoRemoved, setIsLogoRemoved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (!visible) return;

    setProfileName(businessProfile.name);
    setProfileSsmRegistrationNo(businessProfile.ssmRegistrationNo);
    setProfileNature(businessProfile.nature);
    setProfilePhone(businessProfile.phone);
    setProfileEmail(businessProfile.email);
    setProfileAddress(businessProfile.address);
    setProfileCurrency(currency);
    setSelectedLogo(null);
    setIsLogoRemoved(false);
    setIsSaving(false);
    setSaveError('');
    // Re-seed the form from the saved profile each time the editor opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handleChooseLogo = async () => {
    if (!requirePro()) return;

    setSaveError('');
    try {
      // Load the native-backed package only when it is used. This keeps Settings usable when a
      // developer has installed the JS dependency but has not rebuilt their development client yet.
      const ImagePicker = await import('expo-image-picker');
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
        base64: true,
        selectionLimit: 1,
      });
      if (!result.canceled) {
        setSelectedLogo(result.assets[0]);
        setIsLogoRemoved(false);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSaveError(
        message.includes('ExponentImagePicker')
          ? 'Photo selection needs one native app rebuild. Rebuild and reinstall Bookflow, then try again.'
          : message || 'The photo library could not be opened.',
      );
    }
  };

  const handleSaveProfile = async () => {
    if (isSaving) return;

    setIsSaving(true);
    setSaveError('');
    try {
      let logoUrl = isLogoRemoved ? undefined : businessProfile.logoUrl;
      let logoPath = isLogoRemoved ? undefined : businessProfile.logoPath;

      if (selectedLogo) {
        const uploadedLogo = await uploadBusinessLogo({
          uri: selectedLogo.uri,
          fileName: selectedLogo.fileName,
          mimeType: selectedLogo.mimeType,
          base64: selectedLogo.base64,
        });
        logoUrl = uploadedLogo.logoUrl;
        logoPath = uploadedLogo.logoPath;
      } else if (isLogoRemoved && businessProfile.logoPath) {
        await removeBusinessLogo();
      }

      updateBusinessProfile({
        name: profileName.trim() || businessProfile.name,
        ssmRegistrationNo: profileSsmRegistrationNo.trim(),
        nature: profileNature.trim() || businessProfile.nature,
        phone: profilePhone.trim(),
        email: profileEmail.trim(),
        address: profileAddress.trim(),
        logoUrl,
        logoPath,
      });
      updateCurrency(profileCurrency);
      onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'The business profile could not be saved.');
    } finally {
      setIsSaving(false);
    }
  };

  const logoPreviewUri = selectedLogo?.uri ?? (!isLogoRemoved ? businessProfile.logoUrl : undefined);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={isSaving ? undefined : onClose}>
      {/* Insets live on the backdrop, not inside the card: padding within the card would push the
          content down but leave its rounded top edge sitting under the notch. */}
      <View style={[styles.modalBackdrop, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
        {/* No keyboard avoidance: the card holds still and the scroll area below absorbs it. */}
        <View style={styles.cardWrap}>
          <View
            style={[styles.modalCard, { backgroundColor: soft.surface, borderColor: soft.border, shadowColor: soft.shadow }]}>
            <ScrollView {...modalScrollProps} contentContainerStyle={styles.modalContent}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={[styles.modalEyebrow, { color: palette.accent }]}>Business</Text>
                  <Text style={[styles.modalTitle, { color: palette.text }]}>Edit business profile</Text>
                </View>
                <Pressable disabled={isSaving} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close business profile" style={[styles.closeButton, { backgroundColor: soft.inset }]}>
                  <Ionicons name="close" size={22} color={palette.text} />
                </Pressable>
              </View>

              <View style={[styles.logoCard, { backgroundColor: soft.inset, borderColor: soft.border }]}>
                <View style={[styles.logoPreview, { backgroundColor: soft.surface, borderColor: soft.border }]}>
                  <Image
                    source={logoPreviewUri ? { uri: logoPreviewUri } : require('@/assets/images/bookflow-logo.png')}
                    style={[styles.logoImage, !isPro && logoPreviewUri ? styles.inactiveLogo : null]}
                    resizeMode="contain"
                    accessibilityLabel={logoPreviewUri ? 'Business logo preview' : 'Bookflow default logo'}
                  />
                </View>
                <View style={styles.logoCopy}>
                  <View style={styles.logoTitleRow}>
                    <Text style={[styles.logoTitle, { color: palette.text }]}>Business logo</Text>
                    <View style={[styles.proBadge, { backgroundColor: isPro ? (isDarkMode ? '#15392F' : '#E8F7EF') : soft.accentSoft }]}>
                      <Ionicons name="star" size={10} color={isPro ? palette.success : palette.accent} />
                      <Text style={[styles.proBadgeText, { color: isPro ? palette.success : palette.accent }]}>PRO</Text>
                    </View>
                  </View>
                  <Text style={[styles.logoDescription, { color: palette.muter }]}>
                    {isPro
                      ? 'Shown on your dashboard and new invoices. JPG, PNG or WebP, up to 5 MB.'
                      : 'Upgrade to Pro to replace Bookflow branding on your dashboard and invoices.'}
                  </Text>
                  <View style={styles.logoActions}>
                    <Pressable
                      accessibilityRole="button"
                      disabled={isLoadingSubscription || isSaving}
                      onPress={handleChooseLogo}
                      style={({ pressed }) => [
                        styles.logoAction,
                        { backgroundColor: palette.accent },
                        pressed && styles.pressed,
                      ]}>
                      <Ionicons name={isPro ? 'image-outline' : 'lock-closed-outline'} size={15} color="#fff" />
                      <Text style={styles.logoActionText}>
                        {isLoadingSubscription ? 'Checking…' : isPro ? (logoPreviewUri ? 'Change' : 'Choose logo') : 'Unlock with Pro'}
                      </Text>
                    </Pressable>
                    {logoPreviewUri ? (
                      <Pressable
                        accessibilityRole="button"
                        disabled={isSaving}
                        onPress={() => {
                          setSelectedLogo(null);
                          setIsLogoRemoved(true);
                        }}
                        style={({ pressed }) => [styles.removeLogoButton, pressed && styles.pressed]}>
                        <Text style={[styles.removeLogoText, { color: palette.danger }]}>Remove</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              </View>

              <Text style={[styles.fieldLabel, { color: palette.muter }]}>Business name</Text>
              <TextInput
                value={profileName}
                onChangeText={setProfileName}
                style={[styles.input, { backgroundColor: soft.inset, borderColor: soft.border, color: palette.text }]}
                placeholder="Studio Lensa KL"
                placeholderTextColor={palette.muter}
                returnKeyType="next"
                submitBehavior="submit"
              />

              <Text style={[styles.fieldLabel, { color: palette.muter }]}>SSM Registration No.</Text>
              <TextInput
                value={profileSsmRegistrationNo}
                onChangeText={setProfileSsmRegistrationNo}
                style={[styles.input, { backgroundColor: soft.inset, borderColor: soft.border, color: palette.text }]}
                placeholder="202301012345 (1234567-A)"
                placeholderTextColor={palette.muter}
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="next"
                submitBehavior="submit"
              />

              <Text style={[styles.fieldLabel, { color: palette.muter }]}>Nature of business</Text>
              <TextInput
                value={profileNature}
                onChangeText={setProfileNature}
                style={[styles.input, { backgroundColor: soft.inset, borderColor: soft.border, color: palette.text }]}
                placeholder="Photographer"
                placeholderTextColor={palette.muter}
                returnKeyType="next"
                submitBehavior="submit"
              />

              <Text style={[styles.fieldLabel, { color: palette.muter }]}>Phone number</Text>
              <TextInput
                value={profilePhone}
                onChangeText={setProfilePhone}
                style={[styles.input, { backgroundColor: soft.inset, borderColor: soft.border, color: palette.text }]}
                keyboardType="phone-pad"
                placeholder="+60 12-345 6789"
                placeholderTextColor={palette.muter}
                returnKeyType="next"
                submitBehavior="submit"
              />

              <Text style={[styles.fieldLabel, { color: palette.muter }]}>Email</Text>
              <TextInput
                value={profileEmail}
                onChangeText={setProfileEmail}
                style={[styles.input, { backgroundColor: soft.inset, borderColor: soft.border, color: palette.text }]}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholder="hello@studiolensakl.com"
                placeholderTextColor={palette.muter}
                returnKeyType="next"
                submitBehavior="submit"
              />

              <Text style={[styles.fieldLabel, { color: palette.muter }]}>Address</Text>
              <TextInput
                value={profileAddress}
                onChangeText={setProfileAddress}
                style={[styles.input, styles.multilineInput, { backgroundColor: soft.inset, borderColor: soft.border, color: palette.text }]}
                placeholder="Business address"
                placeholderTextColor={palette.muter}
                multiline
                textAlignVertical="top"
              />

              <Text style={[styles.fieldLabel, { color: palette.muter }]}>Currency</Text>
              <View style={styles.currencyOptions}>
                {CURRENCY_OPTIONS.map((option) => {
                  const isSelected = option.code === profileCurrency;
                  return (
                    <Pressable
                      key={option.code}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: isSelected }}
                      onPress={() => setProfileCurrency(option.code)}
                      style={[
                        styles.currencyOption,
                        {
                          backgroundColor: isSelected ? palette.accent : soft.inset,
                          borderColor: isSelected ? palette.accent : soft.border,
                        },
                      ]}>
                      <Text style={[styles.currencyOptionLabel, { color: isSelected ? '#fff' : palette.text }]}>{option.label}</Text>
                      <Text style={[styles.currencyOptionCode, { color: isSelected ? 'rgba(255,255,255,0.85)' : palette.muter }]}>
                        {option.code}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Above the button, not below it: as the last row in the scroll view an error was
                  landing off screen, so a failed save looked like a dead button. */}
              {saveError ? (
                <View
                  accessibilityLiveRegion="polite"
                  style={[styles.saveErrorBox, { backgroundColor: soft.dangerSoft }]}>
                  <Ionicons name="alert-circle-outline" size={17} color={palette.danger} />
                  <Text style={[styles.saveError, { color: palette.danger }]}>{saveError}</Text>
                </View>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: isSaving }}
                disabled={isSaving}
                style={[styles.submitButton, { backgroundColor: palette.accent, shadowColor: palette.accent }, isSaving && styles.pressed]}
                onPress={handleSaveProfile}>
                {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>Save changes</Text>}
              </Pressable>
            </ScrollView>
          </View>
        </View>

        <KeyboardDoneButton />
      </View>
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
    paddingBottom: 12,
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
  logoCard: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    padding: 14,
  },
  logoPreview: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    height: 84,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 84,
  },
  logoImage: {
    height: 70,
    width: 70,
  },
  inactiveLogo: {
    opacity: 0.45,
  },
  logoCopy: {
    flex: 1,
    minWidth: 0,
  },
  logoTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  logoTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  proBadge: {
    alignItems: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  proBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.45,
  },
  logoDescription: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 5,
  },
  logoActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginTop: 9,
  },
  logoAction: {
    alignItems: 'center',
    borderRadius: 11,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  logoActionText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  removeLogoButton: {
    paddingHorizontal: 2,
    paddingVertical: 8,
  },
  removeLogoText: {
    fontSize: 11,
    fontWeight: '800',
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.65,
    marginBottom: 8,
    marginTop: 12,
    textTransform: 'uppercase',
  },
  input: {
    borderRadius: 16,
    borderWidth: 1,
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 14,
    paddingVertical: 12,
    width: '100%',
  },
  multilineInput: {
    minHeight: 84,
  },
  currencyOptions: {
    gap: 10,
  },
  currencyOption: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  currencyOptionLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  currencyOptionCode: {
    fontSize: 12,
    fontWeight: '700',
  },
  submitButton: {
    alignItems: 'center',
    borderRadius: 17,
    elevation: 4,
    marginTop: 18,
    paddingVertical: 14,
    shadowOffset: { height: 6, width: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
  },
  submitButtonText: {
    color: '#fff',
    fontWeight: '800',
  },
  saveErrorBox: {
    alignItems: 'flex-start',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    marginTop: 10,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  saveError: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '700',
    lineHeight: 18,
  },
  pressed: {
    opacity: 0.72,
  },
});
