import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, Modal, Share, Platform, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CURRENCY_OPTIONS, getCurrencyFormatter, useAppData } from '@/context/app-data-context';
import { useAuth } from '@/context/auth-context';
import { getThemePalette, useTheme } from '@/context/theme-context';

export default function SettingsScreen() {
  const { isDarkMode, toggleTheme } = useTheme();
  const { signOut, user, verifyPassword, deleteAccount } = useAuth();
  const { packages, addPackage, removePackage, businessProfile, updateBusinessProfile, currency, updateCurrency, customers, bookings, invoices, financeEntries, deleteAllData, deleteWorkspace } = useAppData();
  const currencyFormatter = getCurrencyFormatter(currency);

  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [profileName, setProfileName] = useState(businessProfile.name);
  const [profileSsmRegistrationNo, setProfileSsmRegistrationNo] = useState(businessProfile.ssmRegistrationNo);
  const [profileNature, setProfileNature] = useState(businessProfile.nature);
  const [profilePhone, setProfilePhone] = useState(businessProfile.phone);
  const [profileEmail, setProfileEmail] = useState(businessProfile.email);
  const [profileAddress, setProfileAddress] = useState(businessProfile.address);
  const [profileCurrency, setProfileCurrency] = useState(currency);

  const [showServicesManager, setShowServicesManager] = useState(false);
  const [showSignOut, setShowSignOut] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deletePasswordError, setDeletePasswordError] = useState('');
  const [showServiceForm, setShowServiceForm] = useState(false);
  const [serviceName, setServiceName] = useState('');
  const [serviceDetails, setServiceDetails] = useState('');
  const [serviceTime, setServiceTime] = useState('');
  const [servicePrice, setServicePrice] = useState('');
  const [serviceInfo, setServiceInfo] = useState('');

  const palette = getThemePalette(isDarkMode);
  const appVersion = Constants.expoConfig?.version ?? 'Unknown';
  const softSurface = isDarkMode ? '#172033' : '#F7F9FD';
  const softInset = isDarkMode ? '#111A2B' : '#EEF2F8';
  const softBorder = isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.9)';
  const softShadow = isDarkMode ? '#020617' : '#A7B4C8';
  const accentSoft = isDarkMode ? '#29284B' : '#E9E8FF';

  const openProfileEditor = () => {
    setProfileName(businessProfile.name);
    setProfileSsmRegistrationNo(businessProfile.ssmRegistrationNo);
    setProfileNature(businessProfile.nature);
    setProfilePhone(businessProfile.phone);
    setProfileEmail(businessProfile.email);
    setProfileAddress(businessProfile.address);
    setProfileCurrency(currency);
    setShowProfileEditor(true);
  };

  const resetServiceForm = () => {
    setServiceName('');
    setServiceDetails('');
    setServiceTime('');
    setServicePrice('');
    setServiceInfo('');
  };

  const closeServicesManager = () => {
    resetServiceForm();
    setShowServiceForm(false);
    setShowServicesManager(false);
  };

  const closeDeleteAccount = () => {
    setShowDeleteAccount(false);
    setDeletePassword('');
    setDeletePasswordError('');
  };

  const handleDeleteAccount = async () => {
    const isValid = await verifyPassword(deletePassword);
    if (!isValid) {
      setDeletePasswordError('Incorrect password. Please try again.');
      return;
    }

    try {
      await deleteWorkspace();
      await deleteAccount();
    } catch (error) {
      setDeletePasswordError(error instanceof Error ? error.message : 'We could not delete your account. Please try again.');
      return;
    }

    closeDeleteAccount();
    deleteAllData();
    await signOut();
  };

  const handleAddService = () => {
    const parsedPrice = Number(servicePrice);

    if (!serviceName.trim() || !serviceDetails.trim() || !serviceTime.trim() || Number.isNaN(parsedPrice) || parsedPrice <= 0) {
      return;
    }

    addPackage({
      name: serviceName,
      details: serviceDetails,
      duration: serviceTime,
      price: parsedPrice,
      info: serviceInfo,
    });
    resetServiceForm();
    setShowServiceForm(false);
  };

  const handleSaveProfile = () => {
    updateBusinessProfile({
      name: profileName.trim() || businessProfile.name,
      ssmRegistrationNo: profileSsmRegistrationNo.trim(),
      nature: profileNature.trim() || businessProfile.nature,
      phone: profilePhone.trim(),
      email: profileEmail.trim(),
      address: profileAddress.trim(),
    });
    updateCurrency(profileCurrency);
    setShowProfileEditor(false);
  };

  const exportDataAsPdf = async () => {
    // Prepare a simple HTML summary that can be printed to PDF by the user from their device's share/print UI
    const html = `
      <html>
      <head><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Bookflow Export</title></head>
      <body>
        <h1>Bookflow Export - ${businessProfile.name}</h1>
        <h2>Packages</h2>
        <ul>
          ${packages.map((p) => `<li><strong>${p.name}</strong> — ${p.duration} — ${currencyFormatter.format(p.price)}<br/>${p.details}<br/>${p.info}</li>`).join('')}
        </ul>
        <h2>Customers</h2>
        <ul>
          ${customers.map((c) => `<li>${c.name} — ${c.email} — ${c.phone}</li>`).join('')}
        </ul>
        <h2>Bookings</h2>
        <ul>
          ${bookings.map((b) => `<li>${b.date} — ${b.title} — ${b.packageName} — ${currencyFormatter.format(b.price)}</li>`).join('')}
        </ul>
        <h2>Invoices</h2>
        <ul>
          ${invoices.map((i) => `<li>${i.id} — ${i.status} — ${currencyFormatter.format(i.amount)} — Due ${i.dueDate}</li>`).join('')}
        </ul>
        <h2>Finance</h2>
        <ul>
          ${financeEntries.map((f) => `<li>${f.date} — ${f.category} — ${currencyFormatter.format(f.amount)} — ${f.type}</li>`).join('')}
        </ul>
      </body>
      </html>
    `;

    try {
      // Share the HTML as text/URL so the user can open and print to PDF on their device
      if (Platform.OS === 'web') {
        const w = window.open();
        w?.document.write(html);
        w?.document.close();
      } else {
        await Share.share({ title: 'Bookflow Export', message: 'Open this HTML in a browser to print/save as PDF.', url: `data:text/html,${encodeURIComponent(html)}` });
      }
    } catch {
      // ignore errors silently — sharing is best-effort in this prototype
    }
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerRow}>
          <View style={[styles.headerIcon, { backgroundColor: softSurface, borderColor: softBorder, shadowColor: softShadow }]}>
            <Ionicons name="settings-outline" size={23} color={palette.accent} />
          </View>
          <View>
            <Text style={[styles.eyebrow, { color: palette.accent }]}>Settings</Text>
            <Text style={[styles.title, { color: palette.text }]}>Business setup</Text>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: softSurface, borderColor: softBorder, shadowColor: softShadow }]}>
          <View style={styles.summaryRow}>
            <View style={[styles.iconWrap, { backgroundColor: accentSoft }]}>
              <Ionicons name="business-outline" size={22} color={palette.accent} />
            </View>
            <View style={styles.summaryCopy}>
              <Text style={[styles.label, { color: palette.muter }]}>Business profile</Text>
              <Text style={[styles.summaryTitle, { color: palette.text }]}>{businessProfile.name}</Text>
              <Text style={[styles.summarySubtitle, { color: palette.muter }]}>{businessProfile.nature}</Text>
            </View>
            <Pressable
              onPress={openProfileEditor}
              style={[styles.editButton, { backgroundColor: softInset }]}
              accessibilityLabel="Edit business profile">
              <Ionicons name="pencil" size={15} color={palette.accent} />
              <Text style={[styles.editButtonText, { color: palette.accent }]}>Edit</Text>
            </Pressable>
          </View>
        </View>

        <View style={[styles.card, styles.themeCard, { backgroundColor: softSurface, borderColor: softBorder, shadowColor: softShadow }]}>
          <View style={styles.themeRow}>
            <View style={[styles.iconWrap, styles.themeIconWrap, { backgroundColor: accentSoft }]}>
              <Ionicons name={isDarkMode ? 'moon' : 'sunny'} size={22} color={palette.accent} />
            </View>
            <View style={styles.themeCopy}>
              <Text style={[styles.label, { color: palette.muter }]}>Appearance</Text>
              <Text style={[styles.value, { color: palette.text }]}>Dark mode</Text>
              <Text style={[styles.themeDescription, { color: palette.muter }]}>
                {isDarkMode ? 'On — optimized for low light' : 'Off — using light appearance'}
              </Text>
            </View>
            <View
              style={[
                styles.switchWrap,
                {
                  backgroundColor: isDarkMode ? accentSoft : softInset,
                  borderColor: isDarkMode ? palette.accent : softBorder,
                },
              ]}>
              <Switch
                value={isDarkMode}
                onValueChange={toggleTheme}
                trackColor={{ false: '#94A3B8', true: palette.accent }}
                thumbColor="#FFFFFF"
                ios_backgroundColor="#94A3B8"
                style={styles.themeSwitch}
                accessibilityLabel="Dark mode"
                accessibilityHint="Switches between light and dark appearance"
              />
            </View>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: softSurface, borderColor: softBorder, shadowColor: softShadow, marginTop: 18 }]}>
          <View style={styles.summaryRow}>
            <View style={[styles.iconWrap, { backgroundColor: accentSoft }]}>
              <Ionicons name="cube-outline" size={22} color={palette.accent} />
            </View>
            <View style={styles.summaryCopy}>
              <Text style={[styles.label, { color: palette.muter }]}>Services</Text>
              <Text style={[styles.summaryTitle, { color: palette.text }]}>Event packages</Text>
              <Text style={[styles.summarySubtitle, { color: palette.muter }]}>
                {packages.length} {packages.length === 1 ? 'service' : 'services'} available
              </Text>
            </View>
            <Pressable
              onPress={() => setShowServicesManager(true)}
              style={[styles.editButton, { backgroundColor: softInset }]}
              accessibilityLabel="Edit event packages">
              <Ionicons name="pencil" size={15} color={palette.accent} />
              <Text style={[styles.editButtonText, { color: palette.accent }]}>Edit</Text>
            </Pressable>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: softSurface, borderColor: softBorder, shadowColor: softShadow, marginTop: 18 }]}>
          <View style={styles.dataHeader}>
            <View style={[styles.iconWrap, { backgroundColor: accentSoft }]}>
              <Ionicons name="download-outline" size={22} color={palette.accent} />
            </View>
            <View style={styles.dataHeaderCopy}>
              <Text style={[styles.label, { color: palette.muter }]}>Data</Text>
              <Text style={[styles.sectionTitle, { color: palette.text }]}>Export records</Text>
            </View>
          </View>
          <View style={styles.dataCopy}>
            <Text style={[styles.label, { color: palette.muter }]}>Extract / Export</Text>
            <Text style={[styles.value, { color: palette.text }]}>Export a tax-ready summary (HTML) which you can print/save as PDF</Text>
          </View>
          <Pressable style={[styles.addButton, { backgroundColor: palette.accent, shadowColor: palette.accent }]} onPress={exportDataAsPdf}>
            <Text style={styles.addButtonText}>Export as PDF</Text>
          </Pressable>
        </View>

        <View style={[styles.card, { backgroundColor: softSurface, borderColor: softBorder, shadowColor: softShadow, marginTop: 18 }]}>
          <View style={styles.accountRow}>
            <View style={[styles.iconWrap, { backgroundColor: accentSoft }]}>
              <Ionicons name="person-circle-outline" size={23} color={palette.accent} />
            </View>
            <View style={styles.summaryCopy}>
              <Text style={[styles.label, { color: palette.muter }]}>Account</Text>
              <Text style={[styles.summaryTitle, { color: palette.text }]}>{user?.name ?? 'Bookflow user'}</Text>
              <Text style={[styles.summarySubtitle, { color: palette.muter }]}>{user?.email ?? 'Signed out'}</Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => setShowSignOut(true)}
            style={[styles.signOutButton, { backgroundColor: softInset, borderColor: palette.border }]}>
            <Ionicons name="log-out-outline" size={18} color={palette.danger} />
            <Text style={[styles.signOutText, { color: palette.danger }]}>Sign out</Text>
          </Pressable>
        </View>

        <View style={[styles.card, { backgroundColor: softSurface, borderColor: softBorder, shadowColor: softShadow, marginTop: 18 }]}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setShowDeleteAccount(true)}
            style={[styles.signOutButton, styles.deleteAccountButton, { borderColor: palette.danger }]}>
            <Ionicons name="trash-outline" size={18} color={palette.danger} />
            <Text style={[styles.signOutText, { color: palette.danger }]}>Delete account</Text>
          </Pressable>
        </View>

        <View style={styles.versionFooter}>
          <Image source={require('../../assets/images/bookflow-logo.png')} style={styles.versionLogo} resizeMode="contain" />
          <Text style={[styles.versionText, { color: palette.muter }]}>Bookflow version {appVersion}</Text>
        </View>

      </ScrollView>
        {/* Profile editor modal */}
        <Modal visible={showProfileEditor} transparent animationType="slide" onRequestClose={() => setShowProfileEditor(false)}>
          <View style={styles.modalBackdrop}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%' }} keyboardVerticalOffset={80}>
              <SafeAreaView edges={["top","left","right","bottom"]} style={[styles.modalCard, { backgroundColor: softSurface, borderColor: softBorder, shadowColor: softShadow }]}>
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingBottom: 12 }}>
                  <View style={styles.modalHeader}>
                    <View>
                      <Text style={[styles.modalEyebrow, { color: palette.accent }]}>Business</Text>
                      <Text style={[styles.modalTitle, { color: palette.text }]}>Edit business profile</Text>
                    </View>
                    <Pressable onPress={() => setShowProfileEditor(false)} style={[styles.closeButton, { backgroundColor: softInset }]}>
                      <Ionicons name="close" size={22} color={palette.text} />
                    </Pressable>
                  </View>

                  <Text style={[styles.fieldLabel, { color: palette.muter }]}>Business name</Text>
                  <TextInput
                    value={profileName}
                    onChangeText={setProfileName}
                    style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
                    placeholder="Studio Lensa KL"
                    placeholderTextColor={palette.muter}
                    returnKeyType="next"
                    blurOnSubmit={false}
                  />

                  <Text style={[styles.fieldLabel, { color: palette.muter }]}>SSM Registration No.</Text>
                  <TextInput
                    value={profileSsmRegistrationNo}
                    onChangeText={setProfileSsmRegistrationNo}
                    style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
                    placeholder="202301012345 (1234567-A)"
                    placeholderTextColor={palette.muter}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    returnKeyType="next"
                    blurOnSubmit={false}
                  />

                  <Text style={[styles.fieldLabel, { color: palette.muter }]}>Nature of business</Text>
                  <TextInput
                    value={profileNature}
                    onChangeText={setProfileNature}
                    style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
                    placeholder="Photographer"
                    placeholderTextColor={palette.muter}
                    returnKeyType="next"
                    blurOnSubmit={false}
                  />

                  <Text style={[styles.fieldLabel, { color: palette.muter }]}>Phone number</Text>
                  <TextInput
                    value={profilePhone}
                    onChangeText={setProfilePhone}
                    style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
                    keyboardType="phone-pad"
                    placeholder="+60 12-345 6789"
                    placeholderTextColor={palette.muter}
                    returnKeyType="next"
                    blurOnSubmit={false}
                  />

                  <Text style={[styles.fieldLabel, { color: palette.muter }]}>Email</Text>
                  <TextInput
                    value={profileEmail}
                    onChangeText={setProfileEmail}
                    style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    placeholder="hello@studiolensakl.com"
                    placeholderTextColor={palette.muter}
                    returnKeyType="next"
                    blurOnSubmit={false}
                  />

                  <Text style={[styles.fieldLabel, { color: palette.muter }]}>Address</Text>
                  <TextInput
                    value={profileAddress}
                    onChangeText={setProfileAddress}
                    style={[styles.input, styles.multilineInput, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
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
                          onPress={() => setProfileCurrency(option.code)}
                          style={[
                            styles.currencyOption,
                            {
                              backgroundColor: isSelected ? palette.accent : softInset,
                              borderColor: isSelected ? palette.accent : softBorder,
                            },
                          ]}>
                          <Text style={[styles.currencyOptionLabel, { color: isSelected ? '#fff' : palette.text }]}>
                            {option.label}
                          </Text>
                          <Text style={[styles.currencyOptionCode, { color: isSelected ? 'rgba(255,255,255,0.85)' : palette.muter }]}>
                            {option.code}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <Pressable style={[styles.submitButton, { backgroundColor: palette.accent, shadowColor: palette.accent }]} onPress={handleSaveProfile}>
                    <Text style={styles.submitButtonText}>Save changes</Text>
                  </Pressable>
                </ScrollView>
              </SafeAreaView>
            </KeyboardAvoidingView>
          </View>
        </Modal>

        <Modal visible={showServicesManager} transparent animationType="slide" onRequestClose={closeServicesManager}>
          <View style={styles.modalBackdrop}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardAvoider} keyboardVerticalOffset={48}>
              <SafeAreaView edges={["top", "left", "right", "bottom"]} style={[styles.modalCard, styles.servicesModalCard, { backgroundColor: softSurface, borderColor: softBorder, shadowColor: softShadow }]}>
                <View style={styles.modalHeader}>
                  <View>
                    <Text style={[styles.modalEyebrow, { color: palette.accent }]}>Services</Text>
                    <Text style={[styles.modalTitle, { color: palette.text }]}>{showServiceForm ? 'New service' : 'Event packages'}</Text>
                  </View>
                  <Pressable onPress={closeServicesManager} style={[styles.closeButton, { backgroundColor: softInset }]} accessibilityLabel="Close services editor">
                    <Ionicons name="close" size={22} color={palette.text} />
                  </Pressable>
                </View>

                <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalContent}>
                  {showServiceForm ? (
                    <>
                      <Text style={[styles.fieldLabel, { color: palette.muter }]}>Service name</Text>
                      <TextInput
                        value={serviceName}
                        onChangeText={setServiceName}
                        style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
                        placeholder="Wedding photography"
                        placeholderTextColor={palette.muter}
                      />

                      <Text style={[styles.fieldLabel, { color: palette.muter }]}>Details of service</Text>
                      <TextInput
                        value={serviceDetails}
                        onChangeText={setServiceDetails}
                        style={[styles.input, styles.multilineInput, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
                        placeholder="Describe what is included"
                        placeholderTextColor={palette.muter}
                        multiline
                        textAlignVertical="top"
                      />

                      <Text style={[styles.fieldLabel, { color: palette.muter }]}>Time</Text>
                      <TextInput
                        value={serviceTime}
                        onChangeText={setServiceTime}
                        style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
                        placeholder="e.g. 4 hours"
                        placeholderTextColor={palette.muter}
                      />

                      <Text style={[styles.fieldLabel, { color: palette.muter }]}>Price</Text>
                      <TextInput
                        value={servicePrice}
                        onChangeText={setServicePrice}
                        style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
                        placeholder="1200"
                        placeholderTextColor={palette.muter}
                        keyboardType="numeric"
                      />

                      <Text style={[styles.fieldLabel, { color: palette.muter }]}>Info / invoice terms</Text>
                      <TextInput
                        value={serviceInfo}
                        onChangeText={setServiceInfo}
                        style={[styles.input, styles.termsInput, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
                        placeholder="Add payment, cancellation, delivery, or other customer-facing terms"
                        placeholderTextColor={palette.muter}
                        multiline
                        textAlignVertical="top"
                      />
                      <Text style={[styles.helperText, { color: palette.muter }]}>This information will be included in invoices that use this service.</Text>

                      <View style={styles.formActions}>
                        <Pressable
                          style={[styles.secondaryButton, { backgroundColor: softInset, borderColor: softBorder }]}
                          onPress={() => {
                            resetServiceForm();
                            setShowServiceForm(false);
                          }}>
                          <Text style={[styles.secondaryButtonText, { color: palette.text }]}>Cancel</Text>
                        </Pressable>
                        <Pressable style={[styles.saveServiceButton, { backgroundColor: palette.accent, shadowColor: palette.accent }]} onPress={handleAddService}>
                          <Text style={styles.submitButtonText}>Save service</Text>
                        </Pressable>
                      </View>
                    </>
                  ) : (
                    <>
                      <Pressable
                        style={[styles.addServiceButton, { backgroundColor: palette.accent, shadowColor: palette.accent }]}
                        onPress={() => {
                          resetServiceForm();
                          setShowServiceForm(true);
                        }}>
                        <Ionicons name="add" size={18} color="#fff" />
                        <Text style={styles.addButtonText}>Add new service</Text>
                      </Pressable>

                      <View style={styles.packageList}>
                        {packages.length > 0 ? packages.map((item) => (
                          <View key={item.id} style={[styles.packageItem, { backgroundColor: softInset, borderColor: softBorder }]}>
                            <View style={styles.serviceItemHeader}>
                              <View style={styles.packageInfo}>
                                <Text style={[styles.packageName, { color: palette.text }]}>{item.name}</Text>
                                <Text style={[styles.packagePrice, { color: palette.accent }]}>{currencyFormatter.format(item.price)}</Text>
                              </View>
                              <Pressable
                                onPress={() => removePackage(item.id)}
                                style={[styles.removeButton, { backgroundColor: softSurface }]}
                                accessibilityLabel={`Delete ${item.name}`}>
                                <Ionicons name="trash-outline" size={17} color="#E11D48" />
                              </Pressable>
                            </View>
                            <Text style={[styles.serviceDetails, { color: palette.muter }]}>{item.details}</Text>
                            <View style={styles.serviceMetaRow}>
                              <Ionicons name="time-outline" size={14} color={palette.muter} />
                              <Text style={[styles.serviceMetaText, { color: palette.muter }]}>{item.duration}</Text>
                            </View>
                            {item.info ? (
                              <View style={[styles.termsPreview, { backgroundColor: softSurface, borderColor: softBorder }]}>
                                <Text style={[styles.termsLabel, { color: palette.muter }]}>Invoice info</Text>
                                <Text style={[styles.termsText, { color: palette.text }]}>{item.info}</Text>
                              </View>
                            ) : null}
                          </View>
                        )) : (
                          <View style={[styles.emptyServices, { backgroundColor: softInset, borderColor: softBorder }]}>
                            <Ionicons name="cube-outline" size={24} color={palette.muter} />
                            <Text style={[styles.emptyServicesText, { color: palette.muter }]}>No services yet</Text>
                          </View>
                        )}
                      </View>
                    </>
                  )}
                </ScrollView>
              </SafeAreaView>
            </KeyboardAvoidingView>
          </View>
        </Modal>

        <Modal visible={showSignOut} transparent animationType="fade" onRequestClose={() => setShowSignOut(false)}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.signOutModal, { backgroundColor: softSurface, borderColor: softBorder, shadowColor: softShadow }]}>
              <View style={[styles.signOutModalIcon, { backgroundColor: isDarkMode ? '#3B1F2B' : '#FFF1F2' }]}>
                <Ionicons name="log-out-outline" size={25} color={palette.danger} />
              </View>
              <Text style={[styles.signOutModalTitle, { color: palette.text }]}>Sign out of Bookflow?</Text>
              <Text style={[styles.signOutModalCopy, { color: palette.muter }]}>You will return to the login screen. Your local business data will stay on this device.</Text>
              <View style={styles.formActions}>
                <Pressable
                  style={[styles.secondaryButton, { backgroundColor: softInset, borderColor: softBorder }]}
                  onPress={() => setShowSignOut(false)}>
                  <Text style={[styles.secondaryButtonText, { color: palette.text }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.saveServiceButton, { backgroundColor: palette.danger, shadowColor: palette.danger }]}
                  onPress={() => {
                    setShowSignOut(false);
                    signOut();
                  }}>
                  <Text style={styles.submitButtonText}>Sign out</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <Modal visible={showDeleteAccount} transparent animationType="fade" onRequestClose={closeDeleteAccount}>
          <View style={styles.modalBackdrop}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%' }} keyboardVerticalOffset={80}>
              <View style={[styles.signOutModal, { backgroundColor: softSurface, borderColor: softBorder, shadowColor: softShadow }]}>
                <View style={[styles.signOutModalIcon, { backgroundColor: isDarkMode ? '#3B1F2B' : '#FFF1F2' }]}>
                  <Ionicons name="warning-outline" size={25} color={palette.danger} />
                </View>
                <Text style={[styles.signOutModalTitle, { color: palette.text }]}>Delete your account?</Text>
                <Text style={[styles.signOutModalCopy, { color: palette.muter }]}>
                  This will permanently delete your account. All customers, bookings, invoices, and finance data will be lost and cannot be recovered.
                </Text>

                <Text style={[styles.fieldLabel, styles.deletePasswordLabel, { color: palette.muter }]}>Confirm your password</Text>
                <TextInput
                  value={deletePassword}
                  onChangeText={(value) => {
                    setDeletePassword(value);
                    setDeletePasswordError('');
                  }}
                  placeholder="Enter your password"
                  placeholderTextColor={palette.muter}
                  secureTextEntry
                  autoCapitalize="none"
                  style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]}
                />
                {deletePasswordError ? <Text style={styles.formError}>{deletePasswordError}</Text> : null}

                <View style={styles.formActions}>
                  <Pressable
                    style={[styles.secondaryButton, { backgroundColor: softInset, borderColor: softBorder }]}
                    onPress={closeDeleteAccount}>
                    <Text style={[styles.secondaryButtonText, { color: palette.text }]}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.saveServiceButton, { backgroundColor: palette.danger, shadowColor: palette.danger }]}
                    onPress={handleDeleteAccount}>
                    <Text style={styles.submitButtonText}>Delete account</Text>
                  </Pressable>
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    overflow: 'hidden',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 120,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  headerIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 6, height: 7 },
    elevation: 5,
  },
  eyebrow: {
    textTransform: 'uppercase',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 5,
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.45,
  },
  card: {
    borderRadius: 26,
    padding: 20,
    borderWidth: 1,
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 8, height: 10 },
    elevation: 5,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 10,
  },
  summaryTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  summarySubtitle: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 3,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 13,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  editButtonText: {
    fontSize: 12,
    fontWeight: '800',
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  label: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  value: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  dataHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  dataHeaderCopy: {
    flex: 1,
  },
  dataCopy: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: '600',
  },
  multilineInput: {
    minHeight: 84,
  },
  termsInput: {
    minHeight: 112,
  },
  helperText: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
  },
  addButton: {
    borderRadius: 17,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 4, height: 6 },
    elevation: 4,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
  },
  currencyOptions: {
    gap: 10,
  },
  currencyOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 16,
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
  packageList: {
    gap: 10,
  },
  packageItem: {
    borderWidth: 1,
    borderRadius: 18,
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
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  serviceDetails: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
  serviceMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
  },
  serviceMetaText: {
    fontSize: 12,
    fontWeight: '700',
  },
  termsPreview: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 11,
    marginTop: 10,
  },
  termsLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  termsText: {
    fontSize: 12,
    lineHeight: 17,
  },
  removeButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  themeCard: {
    marginTop: 18,
  },
  themeIconWrap: {
    marginBottom: 0,
  },
  themeCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 12,
  },
  themeDescription: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 3,
  },
  switchWrap: {
    minWidth: 66,
    minHeight: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  themeSwitch: {
    transform: [{ scaleX: 1.08 }, { scaleY: 1.08 }],
  },
  versionFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 26,
  },
  versionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  versionLogo: {
    width: 20,
    height: 20,
  },
  accountRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  signOutButton: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    marginTop: 16,
    paddingVertical: 13,
  },
  signOutText: {
    fontSize: 14,
    fontWeight: '800',
  },
  deleteAccountButton: {
    backgroundColor: 'transparent',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.58)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 720,
    maxHeight: '90%',
    borderRadius: 28,
    padding: 20,
    borderWidth: 1,
    shadowOpacity: 0.32,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 14,
  },
  signOutModal: {
    alignItems: 'center',
    borderRadius: 28,
    borderWidth: 1,
    maxWidth: 440,
    padding: 22,
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    width: '100%',
  },
  signOutModalIcon: {
    alignItems: 'center',
    borderRadius: 18,
    height: 56,
    justifyContent: 'center',
    marginBottom: 15,
    width: 56,
  },
  signOutModalTitle: {
    fontSize: 21,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  signOutModalCopy: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 20,
    marginTop: 7,
    textAlign: 'center',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.35,
  },
  modalEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.65,
  },
  deletePasswordLabel: {
    alignSelf: 'flex-start',
  },
  formError: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  keyboardAvoider: {
    width: '100%',
    maxWidth: 720,
  },
  servicesModalCard: {
    alignSelf: 'center',
  },
  modalContent: {
    paddingBottom: 8,
  },
  addServiceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 17,
    paddingVertical: 14,
    marginBottom: 14,
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 4, height: 6 },
    elevation: 4,
  },
  emptyServices: {
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 30,
  },
  emptyServicesText: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 8,
  },
  formActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 16,
    alignItems: 'center',
    paddingVertical: 13,
  },
  secondaryButtonText: {
    fontWeight: '800',
  },
  saveServiceButton: {
    flex: 1,
    borderRadius: 16,
    alignItems: 'center',
    paddingVertical: 13,
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 4, height: 6 },
    elevation: 4,
  },
  submitButton: {
    marginTop: 18,
    paddingVertical: 14,
    borderRadius: 17,
    alignItems: 'center',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 4, height: 6 },
    elevation: 4,
  },
  submitButtonText: {
    color: '#fff',
    fontWeight: '800',
  },
});
