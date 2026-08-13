import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, Modal, Share, Platform, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppData } from '@/context/app-data-context';
import { getThemePalette, useTheme } from '@/context/theme-context';

export default function SettingsScreen() {
  const { isDarkMode, toggleTheme } = useTheme();
  const { packages, addPackage, updatePackage, removePackage, businessProfile, updateBusinessProfile, customers, bookings, invoices, financeEntries } = useAppData();
  const [packageName, setPackageName] = useState('');
  const [packagePrice, setPackagePrice] = useState('');

  // Business profile modal state
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [profileName, setProfileName] = useState(businessProfile.name);
  const [profileEmail, setProfileEmail] = useState(businessProfile.email ?? '');
  const [profilePhone, setProfilePhone] = useState(businessProfile.phone ?? '');

  // Package edit modal state
  const [showPackageEditor, setShowPackageEditor] = useState(false);
  const [editingPackageId, setEditingPackageId] = useState(null as string | null);
  const [packageNotes, setPackageNotes] = useState('');

  const palette = getThemePalette(isDarkMode);

  const handleAddPackage = () => {
    const parsedPrice = Number(packagePrice);

    addPackage(packageName, parsedPrice, '');
    setPackageName('');
    setPackagePrice('');
  };

  const openEditPackage = (pkgId: string) => {
    const pkg = packages.find((p) => p.id === pkgId);
    if (!pkg) return;
    setEditingPackageId(pkg.id);
    setPackageName(pkg.name);
    setPackagePrice(String(pkg.price));
    setPackageNotes(pkg.notes ?? '');
    setShowPackageEditor(true);
  };

  const handleSaveEditedPackage = () => {
    if (!editingPackageId) return;
    const parsed = Number(packagePrice);
    updatePackage(editingPackageId, { name: packageName.trim(), price: parsed, notes: packageNotes });
    setShowPackageEditor(false);
    setEditingPackageId(null);
    setPackageName('');
    setPackagePrice('');
    setPackageNotes('');
  };

  const handleSaveProfile = () => {
    updateBusinessProfile({ name: profileName.trim() || 'Business', email: profileEmail.trim(), phone: profilePhone.trim() });
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
          ${packages.map((p) => `<li><strong>${p.name}</strong> - $${p.price}<br/>${(p.notes || '')}</li>`).join('')}
        </ul>
        <h2>Customers</h2>
        <ul>
          ${customers.map((c) => `<li>${c.name} — ${c.email} — ${c.phone}</li>`).join('')}
        </ul>
        <h2>Bookings</h2>
        <ul>
          ${bookings.map((b) => `<li>${b.date} — ${b.title} — ${b.packageName} — $${b.price}</li>`).join('')}
        </ul>
        <h2>Invoices</h2>
        <ul>
          ${invoices.map((i) => `<li>${i.id} — ${i.status} — $${i.amount} — Due ${i.dueDate}</li>`).join('')}
        </ul>
        <h2>Finance</h2>
        <ul>
          ${financeEntries.map((f) => `<li>${f.date} — ${f.category} — $${f.amount} — ${f.type}</li>`).join('')}
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
    } catch (err) {
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
          <View style={styles.row}>
            <View style={[styles.iconWrap, { backgroundColor: palette.iconWrap }]}>
              <Ionicons name="person-circle" size={22} color={palette.accent} />
            </View>
            <View>
              <Text style={[styles.label, { color: palette.muter }]}>Business profile</Text>
              <Text style={[styles.value, { color: palette.text }]}>{businessProfile.name}</Text>
            </View>
            <Pressable onPress={() => setShowProfileEditor(true)} style={{ marginLeft: 12, padding: 6 }}>
              <Ionicons name="pencil" size={18} color={palette.accent} />
            </Pressable>
          </View>

          <View style={styles.row}>
            <View style={[styles.iconWrap, { backgroundColor: palette.iconWrap }]}>
              <Ionicons name="mail" size={22} color={palette.accent} />
            </View>
            <View>
              <Text style={[styles.label, { color: palette.muter }]}>Invoice delivery</Text>
              <Text style={[styles.value, { color: palette.text }]}>Email + WhatsApp reminders</Text>
            </View>
          </View>

          <View style={styles.row}>
            <View style={[styles.iconWrap, { backgroundColor: palette.iconWrap }]}>
              <Ionicons name="notifications" size={22} color={palette.accent} />
            </View>
            <View>
              <Text style={[styles.label, { color: palette.muter }]}>Reminder schedule</Text>
              <Text style={[styles.value, { color: palette.text }]}>7 days before + overdue notices</Text>
            </View>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border, marginTop: 18 }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: palette.text }]}>Event packages</Text>
          </View>

          <View style={styles.formRow}>
            <TextInput
              value={packageName}
              onChangeText={setPackageName}
              placeholder="Package name"
              placeholderTextColor={palette.muter}
              style={[styles.input, { backgroundColor: palette.surfaceAlt, borderColor: palette.border, color: palette.text }]}
            />
            <TextInput
              value={packagePrice}
              onChangeText={setPackagePrice}
              placeholder="Price"
              keyboardType="numeric"
              placeholderTextColor={palette.muter}
              style={[styles.input, { backgroundColor: palette.surfaceAlt, borderColor: palette.border, color: palette.text, width: 110 }]}
            />
          </View>

          <Pressable style={[styles.addButton, { backgroundColor: palette.accent }]} onPress={handleAddPackage}>
            <Text style={styles.addButtonText}>Add package</Text>
          </Pressable>

          <View style={styles.packageList}>
            {packages.map((item) => (
              <View key={item.id} style={[styles.packageItem, { backgroundColor: palette.surfaceAlt, borderColor: palette.border }]}>
                <View style={styles.packageInfo}>
                  <Text style={[styles.packageName, { color: palette.text }]}>{item.name}</Text>
                  <Text style={[styles.packagePrice, { color: palette.accent }]}>
                    ${item.price.toLocaleString()}
                  </Text>
                  {item.notes ? <Text style={{ color: palette.muter, marginTop: 6 }}>{item.notes}</Text> : null}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Pressable onPress={() => openEditPackage(item.id)} style={{ marginRight: 8 }}>
                    <Ionicons name="pencil" size={16} color={palette.accent} />
                  </Pressable>
                  <Pressable onPress={() => removePackage(item.id)} style={styles.removeButton}>
                    <Ionicons name="trash-outline" size={16} color={palette.accent} />
                  </Pressable>
                </View>
              </View>
            ))}
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

          <View style={styles.themeRow}>
            <View>
              <Text style={[styles.label, { color: palette.muter }]}>Theme</Text>
              <Text style={[styles.value, { color: palette.text }]}>
                {isDarkMode ? 'Dark mode' : 'Normal mode'}
              </Text>
            </View>
            <Switch
              value={isDarkMode}
              onValueChange={toggleTheme}
              trackColor={{ false: '#CBD5E1', true: '#4F46E5' }}
              thumbColor="#FFFFFF"
            />
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
                    returnKeyType="next"
                    onSubmitEditing={() => { /* focus next */ }}
                    blurOnSubmit={false}
                  />

                  <Text style={[styles.fieldLabel, { color: palette.muter }]}>Email</Text>
                  <TextInput
                    value={profileEmail}
                    onChangeText={setProfileEmail}
                    style={[styles.input, { backgroundColor: palette.surfaceAlt, borderColor: palette.border, color: palette.text }]}
                    keyboardType="email-address"
                    returnKeyType="next"
                    blurOnSubmit={false}
                  />

                  <Text style={[styles.fieldLabel, { color: palette.muter }]}>Phone</Text>
                  <TextInput
                    value={profilePhone}
                    onChangeText={setProfilePhone}
                    style={[styles.input, { backgroundColor: palette.surfaceAlt, borderColor: palette.border, color: palette.text }]}
                    keyboardType="phone-pad"
                    returnKeyType="done"
                    onSubmitEditing={handleSaveProfile}
                  />

                  <Pressable style={styles.submitButton} onPress={handleSaveProfile}>
                    <Text style={styles.submitButtonText}>Save profile</Text>
                  </Pressable>
                </ScrollView>
              </SafeAreaView>
            </KeyboardAvoidingView>
          </View>
        </Modal>

        {/* Package editor modal */}
        <Modal visible={showPackageEditor} transparent animationType="slide" onRequestClose={() => setShowPackageEditor(false)}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, { backgroundColor: palette.surface, borderColor: palette.border }]}> 
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: palette.text }]}>{editingPackageId ? 'Edit package' : 'New package'}</Text>
                <Pressable onPress={() => setShowPackageEditor(false)}>
                  <Ionicons name="close" size={22} color={palette.text} />
                </Pressable>
              </View>

              <Text style={[styles.fieldLabel, { color: palette.muter }]}>Package name</Text>
              <TextInput value={packageName} onChangeText={setPackageName} style={[styles.input, { backgroundColor: palette.surfaceAlt, borderColor: palette.border, color: palette.text }]} />
              <Text style={[styles.fieldLabel, { color: palette.muter }]}>Price</Text>
              <TextInput value={packagePrice} onChangeText={setPackagePrice} keyboardType="numeric" style={[styles.input, { backgroundColor: palette.surfaceAlt, borderColor: palette.border, color: palette.text }]} />
              <Text style={[styles.fieldLabel, { color: palette.muter }]}>Notes</Text>
              <TextInput value={packageNotes} onChangeText={setPackageNotes} style={[styles.input, { backgroundColor: palette.surfaceAlt, borderColor: palette.border, color: palette.text }]} multiline />

              <Pressable style={styles.submitButton} onPress={editingPackageId ? handleSaveEditedPackage : handleAddPackage}>
                <Text style={styles.submitButtonText}>{editingPackageId ? 'Save package' : 'Add package'}</Text>
              </Pressable>
            </View>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
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
  formRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
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
  packageList: {
    gap: 8,
  },
  packageItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  packageInfo: {
    flex: 1,
  },
  packageName: {
    fontSize: 14,
    fontWeight: '700',
  },
  packagePrice: {
    fontSize: 14,
    fontWeight: '800',
    marginTop: 4,
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
    justifyContent: 'space-between',
    alignItems: 'center',
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
