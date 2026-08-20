import { Ionicons } from '@expo/vector-icons';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppData } from '@/context/app-data-context';
import { getThemePalette, useTheme } from '@/context/theme-context';

export default function CustomersScreen() {
  const { isDarkMode } = useTheme();
  const { customers, addCustomer } = useAppData();
  const palette = getThemePalette(isDarkMode);
  const [showComposer, setShowComposer] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const softSurface = isDarkMode ? '#172033' : '#F7F9FD';
  const softInset = isDarkMode ? '#111A2B' : '#EEF2F8';
  const softBorder = isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.9)';
  const softShadow = isDarkMode ? '#020617' : '#A7B4C8';
  const accentSoft = isDarkMode ? '#29284B' : '#E9E8FF';

  const handleAddCustomer = () => {
    addCustomer({
      name,
      email,
      phone,
      location,
      notes,
    });

    setName('');
    setEmail('');
    setPhone('');
    setLocation('');
    setNotes('');
    setShowComposer(false);
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]}>
      <View pointerEvents="none" style={[styles.ambientOrb, styles.ambientOrbTop, { backgroundColor: isDarkMode ? '#293258' : '#E4E6FF' }]} />
      <View pointerEvents="none" style={[styles.ambientOrb, styles.ambientOrbSide, { backgroundColor: isDarkMode ? '#163B38' : '#DFF7EF' }]} />
      <View style={styles.headerRow}>
        <View style={styles.headerTitleGroup}>
          <View style={[styles.headerIcon, { backgroundColor: softSurface, borderColor: softBorder, shadowColor: softShadow }]}>
            <Ionicons name="people-outline" size={23} color={palette.accent} />
          </View>
          <View style={styles.headerCopy}>
            <Text style={[styles.eyebrow, { color: palette.accent }]}>Customers</Text>
            <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>Client database</Text>
          </View>
        </View>
        <Pressable style={[styles.primaryButton, { backgroundColor: palette.accent, shadowColor: palette.accent }]} onPress={() => setShowComposer(true)}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.primaryButtonText}>Add</Text>
        </Pressable>
      </View>

      <FlatList
        data={customers}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: softSurface, borderColor: softBorder, shadowColor: softShadow }]}>
            <View style={[styles.cardAccent, { backgroundColor: palette.accent }]} />
            <View style={styles.profileHeader}>
              <View style={[styles.avatar, { backgroundColor: accentSoft }]}>
                <Text style={[styles.avatarText, { color: palette.accent }]}>{item.name.charAt(0)}</Text>
              </View>
              <View style={styles.profileCopy}>
                <Text style={[styles.name, { color: palette.text }]} numberOfLines={1}>{item.name}</Text>
                <Text style={[styles.profileLabel, { color: palette.muter }]}>Customer profile</Text>
              </View>
            </View>

            <View style={[styles.contactPanel, { backgroundColor: softInset }]}>
              <View style={styles.contactRow}>
                <View style={[styles.contactIcon, { backgroundColor: softSurface }]}>
                  <Ionicons name="mail-outline" size={16} color={palette.accent} />
                </View>
                <Text style={[styles.meta, { color: palette.text }]} numberOfLines={1}>{item.email}</Text>
              </View>
              <View style={styles.contactRow}>
                <View style={[styles.contactIcon, { backgroundColor: softSurface }]}>
                  <Ionicons name="call-outline" size={16} color={palette.accent} />
                </View>
                <Text style={[styles.meta, { color: palette.text }]} numberOfLines={1}>{item.phone}</Text>
              </View>
              <View style={[styles.contactRow, styles.contactRowLast]}>
                <View style={[styles.contactIcon, { backgroundColor: softSurface }]}>
                  <Ionicons name="location-outline" size={16} color={palette.accent} />
                </View>
                <Text style={[styles.meta, { color: palette.text }]} numberOfLines={2}>{item.location}</Text>
              </View>
            </View>

            <View style={styles.notesRow}>
              <Ionicons name="document-text-outline" size={15} color={palette.muter} />
              <Text style={[styles.notes, { color: palette.muter }]} numberOfLines={3}>{item.notes}</Text>
            </View>
          </View>
        )}
      />

      <Modal visible={showComposer} transparent animationType="slide" onRequestClose={() => setShowComposer(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: softSurface, borderColor: softBorder, shadowColor: softShadow }]}>
            <View style={[styles.modalHandle, { backgroundColor: palette.border }]} />
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalEyebrow, { color: palette.accent }]}>Create</Text>
                <Text style={[styles.modalTitle, { color: palette.text }]}>Add customer</Text>
              </View>
              <Pressable onPress={() => setShowComposer(false)} style={[styles.closeButton, { backgroundColor: softInset }]}>
                <Ionicons name="close" size={24} color={palette.text} />
              </Pressable>
            </View>

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>Name</Text>
            <TextInput value={name} onChangeText={setName} style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]} placeholder="Nur Aisyah Rahman" placeholderTextColor={palette.muter} />

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>Email</Text>
            <TextInput value={email} onChangeText={setEmail} style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]} placeholder="aisyah@example.my" keyboardType="email-address" placeholderTextColor={palette.muter} />

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>Phone</Text>
            <TextInput value={phone} onChangeText={setPhone} style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]} placeholder="+60 12-345 6789" placeholderTextColor={palette.muter} />

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>Location</Text>
            <TextInput value={location} onChangeText={setLocation} style={[styles.input, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]} placeholder="Shah Alam, Selangor" placeholderTextColor={palette.muter} />

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>Notes</Text>
            <TextInput value={notes} onChangeText={setNotes} style={[styles.input, styles.notesInput, { backgroundColor: softInset, borderColor: softBorder, color: palette.text }]} placeholder="Wedding client, prefers WhatsApp updates" placeholderTextColor={palette.muter} multiline />

            <Pressable style={[styles.submitButton, { backgroundColor: palette.accent, shadowColor: palette.accent }]} onPress={handleAddCustomer}>
              <Text style={styles.submitButtonText}>Save customer</Text>
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
    overflow: 'hidden',
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  ambientOrb: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.72,
  },
  ambientOrbTop: {
    width: 220,
    height: 220,
    top: -118,
    right: -86,
  },
  ambientOrbSide: {
    width: 170,
    height: 170,
    top: 390,
    left: -126,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
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
  headerCopy: {
    flex: 1,
    minWidth: 0,
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
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    paddingHorizontal: 15,
    paddingVertical: 12,
    shadowOpacity: 0.24,
    shadowRadius: 12,
    shadowOffset: { width: 4, height: 7 },
    elevation: 5,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
    marginLeft: 6,
  },
  list: {
    paddingBottom: 116,
  },
  card: {
    position: 'relative',
    borderRadius: 26,
    borderWidth: 1,
    padding: 20,
    marginBottom: 16,
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 8, height: 10 },
    elevation: 5,
  },
  cardAccent: {
    position: 'absolute',
    top: 23,
    left: 0,
    width: 4,
    height: 40,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  avatarText: {
    fontWeight: '800',
    fontSize: 20,
  },
  profileCopy: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  profileLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.45,
    textTransform: 'uppercase',
  },
  contactPanel: {
    borderRadius: 18,
    padding: 10,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  contactRowLast: {
    marginBottom: 0,
  },
  contactIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  meta: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  notesRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 14,
    paddingHorizontal: 4,
  },
  notes: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    marginLeft: 8,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.58)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
    maxHeight: '92%',
    shadowOpacity: 0.32,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -8 },
    elevation: 14,
  },
  modalHandle: {
    width: 42,
    height: 5,
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  modalEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.65,
  },
  input: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    fontSize: 14,
  },
  notesInput: {
    minHeight: 92,
    textAlignVertical: 'top',
  },
  submitButton: {
    marginTop: 12,
    borderRadius: 17,
    paddingVertical: 15,
    alignItems: 'center',
    shadowOpacity: 0.24,
    shadowRadius: 12,
    shadowOffset: { width: 4, height: 7 },
    elevation: 5,
  },
  submitButtonText: {
    color: '#fff',
    fontWeight: '800',
  },
});
