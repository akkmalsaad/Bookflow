import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, Modal, Share, Platform, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CURRENCY_OPTIONS, getCurrencyFormatter, useAppData } from '@/context/app-data-context';
import { getThemePalette, useTheme } from '@/context/theme-context';

export default function SettingsScreen() {
  const { isDarkMode, toggleTheme } = useTheme();
  const { packages, addPackage, removePackage, businessProfile, updateBusinessProfile, currency, updateCurrency, customers, bookings, invoices, financeEntries } = useAppData();
  const currencyFormatter = getCurrencyFormatter(currency);

  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [profileName, setProfileName] = useState(businessProfile.name);
  const [profileNature, setProfileNature] = useState(businessProfile.nature);
  const [profilePhone, setProfilePhone] = useState(businessProfile.phone);
  const [profileEmail, setProfileEmail] = useState(businessProfile.email);
  const [profileAddress, setProfileAddress] = useState(businessProfile.address);
  const [profileCurrency, setProfileCurrency] = useState(currency);

  const [showServicesManager, setShowServicesManager] = useState(false);
  const [showServiceForm, setShowServiceForm] = useState(false);
  const [serviceName, setServiceName] = useState('');
  const [serviceDetails, setServiceDetails] = useState('');
  const [serviceTime, setServiceTime] = useState('');
  const [servicePrice, setServicePrice] = useState('');
  const [serviceInfo, setServiceInfo] = useState('');

  const palette = getThemePalette(isDarkMode);
  const appVersion = Constants.expoConfig?.version ?? 'Unknown';

  const openProfileEditor = () => {
    setProfileName(businessProfile.name);
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
        <Text style={[styles.eyebrow, { color: palette.accent }]}>Settings</Text>
        <Text style={[styles.title, { color: palette.text }]}>Business setup</Text>

        <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <View style={styles.summaryRow}>
            <View style={[styles.iconWrap, { backgroundColor: palette.iconWrap }]}>
              <Ionicons name="business-outline" size={22} color={palette.accent} />
            </View>
            <View style={styles.summaryCopy}>
              <Text style={[styles.label, { color: palette.muter }]}>Business profile</Text>
              <Text style={[styles.summaryTitle, { color: palette.text }]}>{businessProfile.name}</Text>
              <Text style={[styles.summarySubtitle, { color: palette.muter }]}>{businessProfile.nature}</Text>
            </View>
            <Pressable
              onPress={openProfileEditor}
              style={[styles.editButton, { backgroundColor: palette.iconWrap }]}
              accessibilityLabel="Edit business profile">
              <Ionicons name="pencil" size={15} color={palette.accent} />
              <Text style={[styles.editButtonText, { color: palette.accent }]}>Edit</Text>
            </Pressable>
          </View>
        </View>

        <View style={[styles.card, styles.themeCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <View style={styles.themeRow}>
            <View style={[styles.iconWrap, styles.themeIconWrap, { backgroundColor: palette.iconWrap }]}>
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
                  backgroundColor: isDarkMode ? palette.iconWrap : palette.surfaceAlt,
                  borderColor: isDarkMode ? palette.accent : palette.border,
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

        <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border, marginTop: 18 }]}>
          <View style={styles.summaryRow}>
            <View style={[styles.iconWrap, { backgroundColor: palette.iconWrap }]}>
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
              style={[styles.editButton, { backgroundColor: palette.iconWrap }]}
              accessibilityLabel="Edit event packages">
              <Ionicons name="pencil" size={15} color={palette.accent} />
              <Text style={[styles.editButtonText, { color: palette.accent }]}>Edit</Text>
            </Pressable>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border, marginTop: 18 }]}> 
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: palette.text }]}>Data</Text>
          </View>
          <View style={{ marginBottom: 8 }}>
            <Text style={[styles.label, { color: palette.muter }]}>Extract / Export</Text>
            <Text style={[styles.value, { color: palette.text }]}>Export a tax-ready summary (HTML) which you can print/save as PDF</Text>
          </View>
          <Pressable style={[styles.addButton, { backgroundColor: palette.accent }]} onPress={exportDataAsPdf}>
            <Text style={styles.addButtonText}>Export as PDF</Text>
          </Pressable>
        </View>

        <View style={styles.versionFooter}>
          <Ionicons name="information-circle-outline" size={15} color={palette.muter} />
          <Text style={[styles.versionText, { color: palette.muter }]}>Bookflow version {appVersion}</Text>
        </View>

      </ScrollView>
        {/* Profile editor modal */}
        <Modal visible={showProfileEditor} transparent animationType="slide" onRequestClose={() => setShowProfileEditor(false)}>
          <View style={styles.modalBackdrop}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%' }} keyboardVerticalOffset={80}>
              <SafeAreaView edges={["top","left","right","bottom"]} style={[styles.modalCard, { backgroundColor: palette.surface, borderColor: palette.border }]}> 
                <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 12 }}>
                  <View style={styles.modalHeader}>
                    <Text style={[styles.modalTitle, { color: palette.text }]}>Edit business profile</Text>
                    <Pressable onPress={() => setShowProfileEditor(false)}>
                      <Ionicons name="close" size={22} color={palette.text} />
                    </Pressable>
                  </View>

                  <Text style={[styles.fieldLabel, { color: palette.muter }]}>Business name</Text>
                  <TextInput
                    value={profileName}
                    onChangeText={setProfileName}
                    style={[styles.input, { backgroundColor: palette.surfaceAlt, borderColor: palette.border, color: palette.text }]}
                    placeholder="Studio Lensa KL"
                    placeholderTextColor={palette.muter}
                    returnKeyType="next"
                    blurOnSubmit={false}
                  />

                  <Text style={[styles.fieldLabel, { color: palette.muter }]}>Nature of business</Text>
                  <TextInput
                    value={profileNature}
                    onChangeText={setProfileNature}
                    style={[styles.input, { backgroundColor: palette.surfaceAlt, borderColor: palette.border, color: palette.text }]}
                    placeholder="Photographer"
                    placeholderTextColor={palette.muter}
                    returnKeyType="next"
                    blurOnSubmit={false}
                  />

                  <Text style={[styles.fieldLabel, { color: palette.muter }]}>Phone number</Text>
                  <TextInput
                    value={profilePhone}
                    onChangeText={setProfilePhone}
                    style={[styles.input, { backgroundColor: palette.surfaceAlt, borderColor: palette.border, color: palette.text }]}
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
                    style={[styles.input, { backgroundColor: palette.surfaceAlt, borderColor: palette.border, color: palette.text }]}
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
                    style={[styles.input, styles.multilineInput, { backgroundColor: palette.surfaceAlt, borderColor: palette.border, color: palette.text }]}
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
                              backgroundColor: isSelected ? palette.accent : palette.surfaceAlt,
                              borderColor: isSelected ? palette.accent : palette.border,
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

                  <Pressable style={styles.submitButton} onPress={handleSaveProfile}>
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
              <SafeAreaView edges={["top", "left", "right", "bottom"]} style={[styles.modalCard, styles.servicesModalCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                <View style={styles.modalHeader}>
                  <Text style={[styles.modalTitle, { color: palette.text }]}>{showServiceForm ? 'New service' : 'Event packages'}</Text>
                  <Pressable onPress={closeServicesManager} style={styles.closeButton} accessibilityLabel="Close services editor">
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
                        style={[styles.input, { backgroundColor: palette.surfaceAlt, borderColor: palette.border, color: palette.text }]}
                        placeholder="Wedding photography"
                        placeholderTextColor={palette.muter}
                      />

                      <Text style={[styles.fieldLabel, { color: palette.muter }]}>Details of service</Text>
                      <TextInput
                        value={serviceDetails}
                        onChangeText={setServiceDetails}
                        style={[styles.input, styles.multilineInput, { backgroundColor: palette.surfaceAlt, borderColor: palette.border, color: palette.text }]}
                        placeholder="Describe what is included"
                        placeholderTextColor={palette.muter}
                        multiline
                        textAlignVertical="top"
                      />

                      <Text style={[styles.fieldLabel, { color: palette.muter }]}>Time</Text>
                      <TextInput
                        value={serviceTime}
                        onChangeText={setServiceTime}
                        style={[styles.input, { backgroundColor: palette.surfaceAlt, borderColor: palette.border, color: palette.text }]}
                        placeholder="e.g. 4 hours"
                        placeholderTextColor={palette.muter}
                      />

                      <Text style={[styles.fieldLabel, { color: palette.muter }]}>Price</Text>
                      <TextInput
                        value={servicePrice}
                        onChangeText={setServicePrice}
                        style={[styles.input, { backgroundColor: palette.surfaceAlt, borderColor: palette.border, color: palette.text }]}
                        placeholder="1200"
                        placeholderTextColor={palette.muter}
                        keyboardType="numeric"
                      />

                      <Text style={[styles.fieldLabel, { color: palette.muter }]}>Info / invoice terms</Text>
                      <TextInput
                        value={serviceInfo}
                        onChangeText={setServiceInfo}
                        style={[styles.input, styles.termsInput, { backgroundColor: palette.surfaceAlt, borderColor: palette.border, color: palette.text }]}
                        placeholder="Add payment, cancellation, delivery, or other customer-facing terms"
                        placeholderTextColor={palette.muter}
                        multiline
                        textAlignVertical="top"
                      />
                      <Text style={[styles.helperText, { color: palette.muter }]}>This information will be included in invoices that use this service.</Text>

                      <View style={styles.formActions}>
                        <Pressable
                          style={[styles.secondaryButton, { backgroundColor: palette.surfaceAlt, borderColor: palette.border }]}
                          onPress={() => {
                            resetServiceForm();
                            setShowServiceForm(false);
                          }}>
                          <Text style={[styles.secondaryButtonText, { color: palette.text }]}>Cancel</Text>
                        </Pressable>
                        <Pressable style={[styles.saveServiceButton, { backgroundColor: palette.accent }]} onPress={handleAddService}>
                          <Text style={styles.submitButtonText}>Save service</Text>
                        </Pressable>
                      </View>
                    </>
                  ) : (
                    <>
                      <Pressable
                        style={[styles.addServiceButton, { backgroundColor: palette.accent }]}
                        onPress={() => {
                          resetServiceForm();
                          setShowServiceForm(true);
                        }}>
                        <Ionicons name="add" size={18} color="#fff" />
                        <Text style={styles.addButtonText}>Add new service</Text>
                      </Pressable>

                      <View style={styles.packageList}>
                        {packages.length > 0 ? packages.map((item) => (
                          <View key={item.id} style={[styles.packageItem, { backgroundColor: palette.surfaceAlt, borderColor: palette.border }]}>
                            <View style={styles.serviceItemHeader}>
                              <View style={styles.packageInfo}>
                                <Text style={[styles.packageName, { color: palette.text }]}>{item.name}</Text>
                                <Text style={[styles.packagePrice, { color: palette.accent }]}>{currencyFormatter.format(item.price)}</Text>
                              </View>
                              <Pressable
                                onPress={() => removePackage(item.id)}
                                style={[styles.removeButton, { backgroundColor: palette.iconWrap }]}
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
                              <View style={[styles.termsPreview, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                                <Text style={[styles.termsLabel, { color: palette.muter }]}>Invoice info</Text>
                                <Text style={[styles.termsText, { color: palette.text }]}>{item.info}</Text>
                              </View>
                            ) : null}
                          </View>
                        )) : (
                          <View style={[styles.emptyServices, { backgroundColor: palette.surfaceAlt, borderColor: palette.border }]}>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 120,
  },
  eyebrow: {
    textTransform: 'uppercase',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 6,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 18,
  },
  card: {
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    shadowColor: '#101828',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryCopy: {
    flex: 1,
    paddingRight: 10,
  },
  summaryTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  summarySubtitle: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 3,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  editButtonText: {
    fontSize: 12,
    fontWeight: '800',
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  value: {
    fontSize: 16,
    fontWeight: '700',
  },
  sectionHeader: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  multilineInput: {
    minHeight: 76,
  },
  termsInput: {
    minHeight: 104,
  },
  helperText: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
  },
  addButton: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
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
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
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
    gap: 8,
  },
  packageItem: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  packageInfo: {
    flex: 1,
  },
  packageName: {
    fontSize: 14,
    fontWeight: '700',
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
    borderRadius: 10,
    padding: 10,
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
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
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
    marginTop: 24,
  },
  versionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 720,
    maxHeight: '90%',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 6,
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
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 14,
  },
  emptyServices: {
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 28,
  },
  emptyServicesText: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 8,
  },
  formActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 12,
  },
  secondaryButtonText: {
    fontWeight: '800',
  },
  saveServiceButton: {
    flex: 1,
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 12,
  },
  submitButton: {
    marginTop: 14,
    backgroundColor: '#111827',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#fff',
    fontWeight: '800',
  },
});
