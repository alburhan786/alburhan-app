import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, Platform, Modal, FlatList, SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { packageService, bookingService } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { INDIA_LOCATIONS, getDistricts, getCities } from '../../data/indiaLocations';

function PickerModal({
  visible, title, items, onSelect, onClose, selected,
}: {
  visible: boolean; title: string; items: string[]; selected: string;
  onSelect: (v: string) => void; onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(
    () => items.filter(i => i.toLowerCase().includes(search.toLowerCase())),
    [items, search]
  );
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={pm.container}>
        <View style={pm.header}>
          <Text style={pm.title}>{title}</Text>
          <TouchableOpacity onPress={onClose} style={pm.closeBtn}>
            <Ionicons name="close" size={22} color="#374151" />
          </TouchableOpacity>
        </View>
        <View style={pm.searchWrap}>
          <Ionicons name="search" size={16} color="#9ca3af" style={{ marginRight: 8 }} />
          <TextInput
            style={pm.searchInput}
            placeholder={`Search ${title.toLowerCase()}...`}
            placeholderTextColor="#9ca3af"
            value={search}
            onChangeText={setSearch}
            autoFocus
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color="#9ca3af" />
            </TouchableOpacity>
          )}
        </View>
        <FlatList
          data={filtered}
          keyExtractor={item => item}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[pm.item, item === selected && pm.itemSelected]}
              onPress={() => { onSelect(item); setSearch(''); onClose(); }}
            >
              <Text style={[pm.itemText, item === selected && pm.itemTextSelected]}>{item}</Text>
              {item === selected && <Ionicons name="checkmark" size={18} color="#047857" />}
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={pm.empty}>No results found</Text>}
        />
      </SafeAreaView>
    </Modal>
  );
}

function SelectField({
  label, value, placeholder, onPress, required,
}: { label: string; value: string; placeholder: string; onPress: () => void; required?: boolean }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}{required && <Text style={styles.required}> *</Text>}</Text>
      <TouchableOpacity style={styles.selectBtn} onPress={onPress} activeOpacity={0.7}>
        <Text style={[styles.selectText, !value && styles.selectPlaceholder]}>
          {value || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color="#9ca3af" />
      </TouchableOpacity>
    </View>
  );
}

function InputField({ label, value, onChangeText, placeholder, keyboardType = 'default', required = false, multiline = false }: any) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}{required && <Text style={styles.required}> *</Text>}</Text>
      <TextInput
        style={[styles.input, multiline && styles.inputMulti]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder || label}
        placeholderTextColor="#9ca3af"
        keyboardType={keyboardType}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
        autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'}
      />
    </View>
  );
}

export default function CreateBookingScreen() {
  const { packageId } = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const [pkg, setPkg] = useState<any>(null);
  const [numberOfPeople, setNumberOfPeople] = useState('1');
  const [travelers, setTravelers] = useState<any[]>([
    { name: '', dateOfBirth: '', passportNumber: '', passportIssue: '', passportExpiry: '', age: '', gender: 'M' },
  ]);

  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [loading, setLoading] = useState(false);

  const [picker, setPicker] = useState<{ type: 'state' | 'district' | 'city' | null }>({ type: null });

  const { user } = useAuth();
  const router = useRouter();

  const stateNames = useMemo(() => INDIA_LOCATIONS.map(s => s.name), []);
  const districtNames = useMemo(() => getDistricts(state).map(d => d.name), [state]);
  const cityNames = useMemo(() => getCities(state, district), [state, district]);

  useEffect(() => { loadPackage(); }, [packageId]);
  useEffect(() => {
    if (user) {
      setContactName(user.name || '');
      setContactEmail(user.email || '');
      setContactPhone(user.phone || '');
    }
  }, [user]);
  useEffect(() => {
    const count = parseInt(numberOfPeople) || 1;
    setTravelers(prev =>
      Array(count).fill(null).map((_, i) =>
        prev[i] || { name: '', dateOfBirth: '', passportNumber: '', passportIssue: '', passportExpiry: '', age: '', gender: 'M' }
      )
    );
  }, [numberOfPeople]);

  const loadPackage = async () => {
    try {
      const r = await packageService.getPackageById(parseInt(packageId as string));
      if (r.success) setPkg(r.package);
    } catch { Alert.alert('Error', 'Could not load package'); }
  };

  const updateTraveler = (index: number, field: string, value: string) => {
    setTravelers(prev => prev.map((t, i) => i === index ? { ...t, [field]: value } : t));
  };

  const autoFormatDate = (text: string): string => {
    const d = text.replace(/\D/g, '').slice(0, 8);
    if (d.length <= 2) return d;
    if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
    return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
  };

  const handleSubmit = async () => {
    if (!contactName.trim() || !contactPhone.trim() || !address.trim() || !city || !state || !pincode.trim()) {
      Alert.alert('Missing Info', 'Please fill in all required contact and address details');
      return;
    }
    const incomplete = travelers.some(t => !t.name.trim() || !t.dateOfBirth.trim() || !t.passportNumber.trim() || !t.passportIssue.trim() || !t.passportExpiry.trim());
    if (incomplete) {
      Alert.alert('Missing Info', 'Please complete all traveler passport details (Name, Date of Birth, Passport Number, Issue Date, Expiry Date)');
      return;
    }
    const passportFormatInvalid = travelers.some(t => !/^[A-Z][0-9]{7}$/.test(t.passportNumber.trim()));
    if (passportFormatInvalid) {
      Alert.alert('Invalid Passport', 'Indian passport number must be 1 letter followed by 7 digits (e.g. A1234567)');
      return;
    }

    setLoading(true);
    try {
      const totalAmount = parseFloat(pkg.price) * parseInt(numberOfPeople);
      const fullAddress = [address, city, district, state, pincode].filter(Boolean).join(', ');

      const response = await bookingService.createBooking({
        userId: user!.id,
        packageId: parseInt(packageId as string),
        numberOfPeople: parseInt(numberOfPeople),
        totalAmount: totalAmount.toString(),
        travelers: travelers.map(t => ({
          name: t.name, dateOfBirth: t.dateOfBirth,
          passportNumber: t.passportNumber.trim().toUpperCase(),
          passportIssue: t.passportIssue,
          passportExpiry: t.passportExpiry,
          age: parseInt(t.age) || 0, gender: t.gender,
        })),
        contactName, contactPhone, contactEmail,
        address: fullAddress, city, district, state, pincode,
      });

      if (response.success) {
        Alert.alert('Booking Created!', 'Proceed to payment.', [
          { text: 'OK', onPress: () => router.push(`/booking/${response.booking.id}`) },
        ]);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Could not create booking');
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price: string) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(parseFloat(price));

  if (!pkg) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#047857" />
      </View>
    );
  }

  const totalAmount = parseFloat(pkg.price) * parseInt(numberOfPeople || '1');

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.header, { paddingTop: Platform.OS === 'web' ? 87 : insets.top + 12 }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backRow}>
            <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.title}>Complete Booking</Text>
          <Text style={styles.subtitle}>{pkg.name}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Number of Travelers</Text>
          <InputField label="Number of People" value={numberOfPeople} onChangeText={setNumberOfPeople} keyboardType="number-pad" required />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Traveler Details</Text>
          {travelers.map((traveler, index) => (
            <View key={index} style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="person" size={16} color="#047857" />
                <Text style={styles.cardTitle}>  Traveler {index + 1}</Text>
              </View>
              <InputField label="Full Name" value={traveler.name} onChangeText={(v: string) => updateTraveler(index, 'name', v)} required />
              <InputField
                label="Date of Birth" value={traveler.dateOfBirth} placeholder="DD/MM/YYYY"
                onChangeText={(v: string) => updateTraveler(index, 'dateOfBirth', autoFormatDate(v))}
                keyboardType="number-pad" required
              />
              <InputField
                label="Passport Number" value={traveler.passportNumber} placeholder="e.g. A1234567 (1 letter + 7 digits)"
                onChangeText={(v: string) => updateTraveler(index, 'passportNumber', v.toUpperCase())}
                required
              />
              <InputField
                label="Date of Issue" value={traveler.passportIssue} placeholder="DD/MM/YYYY"
                onChangeText={(v: string) => updateTraveler(index, 'passportIssue', autoFormatDate(v))}
                keyboardType="number-pad" required
              />
              <InputField
                label="Date of Expiry" value={traveler.passportExpiry} placeholder="DD/MM/YYYY"
                onChangeText={(v: string) => updateTraveler(index, 'passportExpiry', autoFormatDate(v))}
                keyboardType="number-pad" required
              />
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contact Details</Text>
          <View style={styles.card}>
            <InputField label="Full Name" value={contactName} onChangeText={setContactName} required />
            <InputField label="Mobile Number" value={contactPhone} onChangeText={setContactPhone} keyboardType="phone-pad" required />
            <InputField label="Email Address" value={contactEmail} onChangeText={setContactEmail} keyboardType="email-address" />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Address</Text>
          <View style={styles.card}>
            <InputField label="Full Address" value={address} onChangeText={setAddress} multiline required placeholder="House No, Street, Area" />
            <SelectField label="State" value={state} placeholder="Select State" required onPress={() => setPicker({ type: 'state' })} />
            <SelectField
              label="District" value={district}
              placeholder={state ? 'Select District' : 'Select state first'}
              onPress={() => state ? setPicker({ type: 'district' }) : Alert.alert('', 'Please select a state first')}
            />
            <SelectField
              label="City" value={city}
              placeholder={district ? 'Select City' : 'Select district first'}
              required
              onPress={() => district ? setPicker({ type: 'city' }) : Alert.alert('', 'Please select a district first')}
            />
            <InputField label="Pincode" value={pincode} onChangeText={setPincode} keyboardType="number-pad" required />
          </View>
        </View>

        <View style={styles.summary}>
          <Text style={styles.sectionTitle}>Booking Summary</Text>
          <View style={styles.row}><Text style={styles.rowLabel}>Per Person</Text><Text style={styles.rowValue}>{formatPrice(pkg.price)}</Text></View>
          <View style={styles.row}><Text style={styles.rowLabel}>Travelers</Text><Text style={styles.rowValue}>{numberOfPeople}</Text></View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatPrice(totalAmount.toString())}</Text>
          </View>
        </View>

        <TouchableOpacity style={[styles.submitBtn, loading && { opacity: 0.6 }]} onPress={handleSubmit} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Create Booking →</Text>}
        </TouchableOpacity>
      </ScrollView>

      <PickerModal
        visible={picker.type === 'state'}
        title="Select State"
        items={stateNames}
        selected={state}
        onSelect={v => { setState(v); setDistrict(''); setCity(''); }}
        onClose={() => setPicker({ type: null })}
      />
      <PickerModal
        visible={picker.type === 'district'}
        title="Select District"
        items={districtNames}
        selected={district}
        onSelect={v => { setDistrict(v); setCity(''); }}
        onClose={() => setPicker({ type: null })}
      />
      <PickerModal
        visible={picker.type === 'city'}
        title="Select City"
        items={cityNames}
        selected={city}
        onSelect={setCity}
        onClose={() => setPicker({ type: null })}
      />
    </>
  );
}

const pm = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  title: { fontSize: 18, fontWeight: '700', color: '#1f2937' },
  closeBtn: { padding: 4 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', margin: 12, backgroundColor: '#f3f4f6', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  searchInput: { flex: 1, fontSize: 15, color: '#1f2937' },
  item: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  itemSelected: { backgroundColor: '#f0fdf4' },
  itemText: { fontSize: 15, color: '#374151' },
  itemTextSelected: { fontWeight: '600', color: '#047857' },
  empty: { textAlign: 'center', color: '#9ca3af', marginTop: 40, fontSize: 15 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0fdf4' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: '#047857', padding: 20 },
  backRow: { marginBottom: 12, alignSelf: 'flex-start', padding: 2 },
  title: { fontSize: 22, fontWeight: '700', color: '#fff', marginBottom: 2 },
  subtitle: { fontSize: 14, color: '#a7f3d0' },
  section: { paddingHorizontal: 16, paddingTop: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#047857', marginBottom: 12 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#d1fae5' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#047857' },
  fieldWrap: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  required: { color: '#ef4444' },
  input: { borderWidth: 1, borderColor: '#d1fae5', borderRadius: 8, padding: 12, fontSize: 15, color: '#1f2937', backgroundColor: '#f9fafb' },
  inputMulti: { height: 80, textAlignVertical: 'top' },
  selectBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#d1fae5', borderRadius: 8, padding: 12, backgroundColor: '#f9fafb' },
  selectText: { fontSize: 15, color: '#1f2937' },
  selectPlaceholder: { color: '#9ca3af' },
  summary: { backgroundColor: '#fff', margin: 16, marginTop: 20, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#d1fae5' },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  rowLabel: { fontSize: 14, color: '#6b7280' },
  rowValue: { fontSize: 14, fontWeight: '600', color: '#1f2937' },
  divider: { height: 1, backgroundColor: '#d1fae5', marginVertical: 10 },
  totalLabel: { fontSize: 16, fontWeight: '700', color: '#1f2937' },
  totalValue: { fontSize: 20, fontWeight: '800', color: '#047857' },
  submitBtn: { backgroundColor: '#047857', margin: 16, padding: 16, borderRadius: 12, alignItems: 'center' },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
