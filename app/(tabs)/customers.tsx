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
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.eyebrow, { color: palette.accent }]}>Customers</Text>
          <Text style={[styles.title, { color: palette.text }]}>Client database</Text>
        </View>
        <Pressable style={styles.primaryButton} onPress={() => setShowComposer(true)}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.primaryButtonText}>Add</Text>
        </Pressable>
      </View>

      <FlatList
        data={customers}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <View style={[styles.avatar, { backgroundColor: palette.iconWrap }]}>
              <Text style={[styles.avatarText, { color: palette.accent }]}>{item.name.charAt(0)}</Text>
            </View>
            <View style={styles.info}>
              <Text style={[styles.name, { color: palette.text }]}>{item.name}</Text>
              <Text style={[styles.meta, { color: palette.muter }]}>{item.email}</Text>
              <Text style={[styles.meta, { color: palette.muter }]}>{item.phone}</Text>
              <Text style={[styles.meta, { color: palette.muter }]}>{item.location}</Text>
              <Text style={[styles.notes, { color: palette.muter }]}>{item.notes}</Text>
            </View>
          </View>
        )}
      />

      <Modal visible={showComposer} transparent animationType="slide" onRequestClose={() => setShowComposer(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: palette.text }]}>Add customer</Text>
              <Pressable onPress={() => setShowComposer(false)}>
                <Ionicons name="close" size={24} color={palette.text} />
              </Pressable>
            </View>

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>Name</Text>
            <TextInput value={name} onChangeText={setName} style={[styles.input, { backgroundColor: palette.surfaceAlt, borderColor: palette.border, color: palette.text }]} placeholder="Ava Thompson" placeholderTextColor={palette.muter} />

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>Email</Text>
            <TextInput value={email} onChangeText={setEmail} style={[styles.input, { backgroundColor: palette.surfaceAlt, borderColor: palette.border, color: palette.text }]} placeholder="ava@example.com" keyboardType="email-address" placeholderTextColor={palette.muter} />

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>Phone</Text>
            <TextInput value={phone} onChangeText={setPhone} style={[styles.input, { backgroundColor: palette.surfaceAlt, borderColor: palette.border, color: palette.text }]} placeholder="+1 (555) 123-4567" placeholderTextColor={palette.muter} />

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>Location</Text>
            <TextInput value={location} onChangeText={setLocation} style={[styles.input, { backgroundColor: palette.surfaceAlt, borderColor: palette.border, color: palette.text }]} placeholder="Austin, TX" placeholderTextColor={palette.muter} />

            <Text style={[styles.fieldLabel, { color: palette.muter }]}>Notes</Text>
            <TextInput value={notes} onChangeText={setNotes} style={[styles.input, styles.notesInput, { backgroundColor: palette.surfaceAlt, borderColor: palette.border, color: palette.text }]} placeholder="Wedding client, prefers email updates" placeholderTextColor={palette.muter} multiline />

            <Pressable style={styles.submitButton} onPress={handleAddCustomer}>
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
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
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
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
    marginLeft: 6,
  },
  list: {
    paddingBottom: 100,
  },
  card: {
    flexDirection: 'row',
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#101828',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  avatarText: {
    fontWeight: '800',
    fontSize: 18,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  meta: {
    fontSize: 13,
    marginBottom: 2,
  },
  notes: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 18,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    color: '#111827',
    fontSize: 14,
  },
  notesInput: {
    minHeight: 86,
    textAlignVertical: 'top',
  },
  submitButton: {
    marginTop: 8,
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#fff',
    fontWeight: '800',
  },
});
