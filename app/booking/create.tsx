import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { packageService, bookingService } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { Colors } from '../../constants/Colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const INDIAN_STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat',
  'Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh',
  'Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab',
  'Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh',
  'Uttarakhand','West Bengal','Delhi','Jammu & Kashmir','Ladakh',
];

function InputField({
  label, value, onChangeText, placeholder, keyboardType = 'default',
  required = false, multiline = false,
}: any) {
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
        autoCapitalize={keyboardType === 'email-address' ? 'none' : 'words'}
      />
    </View>
  );
}

export default function CreateBookingScreen() {
  const { packageId } = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const [pkg, setPkg] = useState<any>(null);
  const [numberOfPeople, setNumberOfPeople] = useState('1');
  const [travelers, setTravelers] = useState<any[]>([{
    name: '', dateOfBirth: '', passportNumber: '', passportExpiry: '', age: '', gender: 'M',
  }]);

  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [specialRequests, setSpecialRequests] = useState('');
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const router = useRouter();

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
        prev[i] || { name: '', dateOfBirth: '', passportNumber: '', passportExpiry: '', age: '', gender: 'M' }
      )
    );
  }, [numberOfPeople]);

  const loadPackage = async () => {
    try {
      const response = await packageService.getPackageById(parseInt(packageId as string));
      if (response.success) setPkg(response.package);
    } catch {
      Alert.alert('Error', 'Could not load package');
    }
  };

  const updateTraveler = (index: number, field: string, value: string) => {
    setTravelers(prev => prev.map((t, i) => i === index ? { ...t, [field]: value } : t));
  };

  const formatDate = (text: string, prev: string) => {
    const clean = text.replace(/\D/g, '');
    if (clean.length <= 2) return clean;
    if (clean.length <= 4) return `${clean.slice(0, 2)}/${clean.slice(2)}`;
    return `${clean.slice(0, 2)}/${clean.slice(2, 4)}/${clean.slice(4, 8)}`;
  };

  const handleSubmit = async () => {
    if (!contactName.trim() || !contactPhone.trim() || !address.trim() || !city.trim() || !state.trim() || !pincode.trim()) {
      Alert.alert('Missing Info', 'Please fill in all required contact details (Name, Phone, Address, City, State, Pincode)');
      return;
    }

    const incomplete = travelers.some(t => !t.name.trim() || !t.dateOfBirth.trim() || !t.passportNumber.trim());
    if (incomplete) {
      Alert.alert('Missing Info', 'Please complete all traveler details (Name, Date of Birth, Passport Number)');
      return;
    }

    setLoading(true);
    try {
      const totalAmount = parseFloat(pkg.price) * parseInt(numberOfPeople);
      const fullAddress = [address, city, district, state, pincode].filter(Boolean).join(', ');

      const bookingData = {
        userId: user!.id,
        packageId: parseInt(packageId as string),
        numberOfPeople: parseInt(numberOfPeople),
        totalAmount: totalAmount.toString(),
        travelers: travelers.map(t => ({
          name: t.name,
          dateOfBirth: t.dateOfBirth,
          passportNumber: t.passportNumber,
          passportExpiry: t.passportExpiry,
          age: parseInt(t.age) || 0,
          gender: t.gender,
        })),
        contactName,
        contactPhone,
        contactEmail,
        address: fullAddress,
        city,
        district,
        state,
        pincode,
        specialRequests,
      };

      const response = await bookingService.createBooking(bookingData);
      if (response.success) {
        Alert.alert('Booking Created!', 'Your booking has been created. Proceed to payment.', [
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
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const totalAmount = parseFloat(pkg.price) * parseInt(numberOfPeople || '1');

  return (
    <KeyboardAwareScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      bottomOffset={20}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Text style={styles.title}>Complete Booking</Text>
        <Text style={styles.packageName}>{pkg.name}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Number of Travelers</Text>
        <InputField
          label="Number of People"
          value={numberOfPeople}
          onChangeText={setNumberOfPeople}
          keyboardType="number-pad"
          required
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Traveler Details</Text>
        {travelers.map((traveler, index) => (
          <View key={index} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Traveler {index + 1}</Text>
            </View>

            <InputField
              label="Full Name"
              value={traveler.name}
              onChangeText={(v: string) => updateTraveler(index, 'name', v)}
              required
            />
            <InputField
              label="Date of Birth"
              value={traveler.dateOfBirth}
              onChangeText={(v: string) => updateTraveler(index, 'dateOfBirth', formatDate(v, traveler.dateOfBirth))}
              placeholder="DD/MM/YYYY"
              keyboardType="number-pad"
              required
            />
            <InputField
              label="Passport Number"
              value={traveler.passportNumber}
              onChangeText={(v: string) => updateTraveler(index, 'passportNumber', v.toUpperCase())}
              placeholder="e.g. A1234567"
              required
            />
            <InputField
              label="Passport Expiry"
              value={traveler.passportExpiry}
              onChangeText={(v: string) => updateTraveler(index, 'passportExpiry', formatDate(v, traveler.passportExpiry))}
              placeholder="DD/MM/YYYY"
              keyboardType="number-pad"
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
          <InputField label="City" value={city} onChangeText={setCity} required />
          <InputField label="District" value={district} onChangeText={setDistrict} />
          <InputField label="State" value={state} onChangeText={setState} required />
          <InputField label="Pincode" value={pincode} onChangeText={setPincode} keyboardType="number-pad" required />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Special Requests (Optional)</Text>
        <TextInput
          style={[styles.input, styles.inputMulti]}
          value={specialRequests}
          onChangeText={setSpecialRequests}
          placeholder="Any special requirements..."
          placeholderTextColor="#9ca3af"
          multiline
          numberOfLines={4}
        />
      </View>

      <View style={styles.summary}>
        <Text style={styles.sectionTitle}>Booking Summary</Text>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Package:</Text>
          <Text style={styles.summaryValue} numberOfLines={1}>{pkg.name}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Per Person:</Text>
          <Text style={styles.summaryValue}>{formatPrice(pkg.price)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Travelers:</Text>
          <Text style={styles.summaryValue}>{numberOfPeople}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.summaryRow}>
          <Text style={styles.totalLabel}>Total Amount:</Text>
          <Text style={styles.totalValue}>{formatPrice(totalAmount.toString())}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.submitBtn, loading && { opacity: 0.6 }]}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Create Booking →</Text>}
      </TouchableOpacity>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0fdf4' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    backgroundColor: '#047857',
    padding: 20,
    paddingTop: Platform.OS === 'web' ? 87 : 20,
  },
  title: { fontSize: 22, fontWeight: '700', color: '#fff', marginBottom: 4 },
  packageName: { fontSize: 14, color: '#a7f3d0' },
  section: { paddingHorizontal: 16, paddingTop: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#047857', marginBottom: 12 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: { marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#d1fae5', paddingBottom: 8 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#047857' },
  fieldWrap: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  required: { color: '#ef4444' },
  input: {
    borderWidth: 1,
    borderColor: '#d1fae5',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#1f2937',
    backgroundColor: '#f9fafb',
  },
  inputMulti: { height: 80, textAlignVertical: 'top' },
  summary: {
    backgroundColor: '#fff',
    margin: 16,
    marginTop: 20,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d1fae5',
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  summaryLabel: { fontSize: 14, color: '#6b7280' },
  summaryValue: { fontSize: 14, fontWeight: '600', color: '#1f2937', flex: 1, textAlign: 'right' },
  divider: { height: 1, backgroundColor: '#d1fae5', marginVertical: 10 },
  totalLabel: { fontSize: 16, fontWeight: '700', color: '#1f2937' },
  totalValue: { fontSize: 20, fontWeight: '800', color: '#047857' },
  submitBtn: {
    backgroundColor: '#047857',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
