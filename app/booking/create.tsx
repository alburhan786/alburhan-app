import React, { useState, useEffect } from 'react';
  import {
    View,
    Text,
    ScrollView,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    Alert,
    KeyboardAvoidingView,
    Platform,
  } from 'react-native';
  import { useLocalSearchParams, useRouter } from 'expo-router';
  import { packageService, bookingService, paymentService } from '../../services/api';
  import { useAuth } from '../../contexts/AuthContext';
  import { Colors } from '../../constants/Colors';

  export default function CreateBookingScreen() {
    const { packageId } = useLocalSearchParams();
    const [pkg, setPkg] = useState<any>(null);
    const [numberOfPeople, setNumberOfPeople] = useState('1');
    const [travelers, setTravelers] = useState<any[]>([{
      name: '', age: '', gender: 'male', passportNumber: '', passportExpiry: ''
    }]);
    const [contactName, setContactName] = useState('');
    const [contactPhone, setContactPhone] = useState('');
    const [contactEmail, setContactEmail] = useState('');
    const [address, setAddress] = useState('');
    const [specialRequests, setSpecialRequests] = useState('');
    const [loading, setLoading] = useState(false);
    const { user } = useAuth();
    const router = useRouter();

    useEffect(() => {
      loadPackage();
      if (user) {
        setContactName(user.name);
        setContactEmail(user.email);
        setContactPhone(user.phone);
      }
    }, [packageId]);

    useEffect(() => {
      const count = parseInt(numberOfPeople) || 1;
      const newTravelers = Array(count).fill(null).map((_, i) => 
        travelers[i] || { name: '', age: '', gender: 'male', passportNumber: '', passportExpiry: '' }
      );
      setTravelers(newTravelers);
    }, [numberOfPeople]);

    const loadPackage = async () => {
      try {
        const response = await packageService.getPackageById(parseInt(packageId as string));
        if (response.success) {
          setPkg(response.package);
        }
      } catch (error) {
        Alert.alert('Error', 'Could not load package');
      }
    };

    const handleSubmit = async () => {
      if (!contactName || !contactPhone || !contactEmail || !address) {
        Alert.alert('Error', 'Please fill in all contact details');
        return;
      }

      const hasIncompleteTravelers = travelers.some(t => 
        !t.name || !t.age || !t.passportNumber || !t.passportExpiry
      );

      if (hasIncompleteTravelers) {
        Alert.alert('Error', 'Please complete all traveler information');
        return;
      }

      setLoading(true);
      try {
        const totalAmount = parseFloat(pkg.price) * parseInt(numberOfPeople);
        
        const bookingData = {
          userId: user!.id,
          packageId: parseInt(packageId as string),
          numberOfPeople: parseInt(numberOfPeople),
          totalAmount: totalAmount.toString(),
          travelers: travelers.map(t => ({ ...t, age: parseInt(t.age) })),
          contactName,
          contactPhone,
          contactEmail,
          address,
          specialRequests,
        };

        const response = await bookingService.createBooking(bookingData);
        
        if (response.success) {
          Alert.alert('Success', 'Booking created successfully! Proceed to payment.', [
            {
              text: 'OK',
              onPress: () => router.push(`/booking/${response.booking.id}`),
            },
          ]);
        }
      } catch (error: any) {
        Alert.alert('Error', error.message || 'Could not create booking');
      } finally {
        setLoading(false);
      }
    };

    const formatPrice = (price: string) => {
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
      }).format(parseFloat(price));
    };

    if (!pkg) {
      return null;
    }

    const totalAmount = parseFloat(pkg.price) * parseInt(numberOfPeople || '1');

    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Complete Your Booking</Text>
            <Text style={styles.packageName}>{pkg.name}</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Number of Travelers</Text>
            <TextInput
              style={styles.input}
              value={numberOfPeople}
              onChangeText={setNumberOfPeople}
              keyboardType="number-pad"
              placeholder="Enter number of people"
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Traveler Details</Text>
            {travelers.map((traveler, index) => (
              <View key={index} style={styles.travelerCard}>
                <Text style={styles.travelerTitle}>Traveler {index + 1}</Text>
                <TextInput
                  style={styles.input}
                  value={traveler.name}
                  onChangeText={(val) => {
                    const newTravelers = [...travelers];
                    newTravelers[index].name = val;
                    setTravelers(newTravelers);
                  }}
                  placeholder="Full Name"
                />
                <TextInput
                  style={styles.input}
                  value={traveler.age}
                  onChangeText={(val) => {
                    const newTravelers = [...travelers];
                    newTravelers[index].age = val;
                    setTravelers(newTravelers);
                  }}
                  keyboardType="number-pad"
                  placeholder="Age"
                />
                <TextInput
                  style={styles.input}
                  value={traveler.passportNumber}
                  onChangeText={(val) => {
                    const newTravelers = [...travelers];
                    newTravelers[index].passportNumber = val;
                    setTravelers(newTravelers);
                  }}
                  placeholder="Passport Number"
                />
                <TextInput
                  style={styles.input}
                  value={traveler.passportExpiry}
                  onChangeText={(val) => {
                    const newTravelers = [...travelers];
                    newTravelers[index].passportExpiry = val;
                    setTravelers(newTravelers);
                  }}
                  placeholder="Passport Expiry (YYYY-MM-DD)"
                />
              </View>
            ))}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Contact Details</Text>
            <TextInput style={styles.input} value={contactName} onChangeText={setContactName} placeholder="Contact Name" />
            <TextInput style={styles.input} value={contactPhone} onChangeText={setContactPhone} placeholder="Phone" keyboardType="phone-pad" />
            <TextInput style={styles.input} value={contactEmail} onChangeText={setContactEmail} placeholder="Email" keyboardType="email-address" />
            <TextInput style={styles.input} value={address} onChangeText={setAddress} placeholder="Address" multiline />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Special Requests (Optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={specialRequests}
              onChangeText={setSpecialRequests}
              placeholder="Any special requirements..."
              multiline
              numberOfLines={4}
            />
          </View>

          <View style={styles.summary}>
            <Text style={styles.summaryTitle}>Booking Summary</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Package Price:</Text>
              <Text style={styles.summaryValue}>{formatPrice(pkg.price)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Number of People:</Text>
              <Text style={styles.summaryValue}>{numberOfPeople}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.summaryRow}>
              <Text style={styles.totalLabel}>Total Amount:</Text>
              <Text style={styles.totalValue}>{formatPrice(totalAmount.toString())}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.submitButton, loading && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            <Text style={styles.submitButtonText}>
              {loading ? 'Creating Booking...' : 'Create Booking'}
            </Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    content: { flex: 1 },
    header: { backgroundColor: Colors.card, padding: 20, borderBottomWidth: 1, borderBottomColor: Colors.border },
    title: { fontSize: 24, fontWeight: 'bold', color: Colors.text, marginBottom: 4 },
    packageName: { fontSize: 16, color: Colors.textSecondary },
    section: { padding: 16 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.text, marginBottom: 12 },
    input: { backgroundColor: Colors.card, borderRadius: 8, padding: 12, fontSize: 16, color: Colors.text, marginBottom: 12, borderWidth: 1, borderColor: Colors.border },
    textArea: { height: 100, textAlignVertical: 'top' },
    travelerCard: { backgroundColor: Colors.card, borderRadius: 12, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
    travelerTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.text, marginBottom: 12 },
    summary: { backgroundColor: Colors.card, margin: 16, padding: 16, borderRadius: 12 },
    summaryTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.text, marginBottom: 16 },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    summaryLabel: { fontSize: 14, color: Colors.textSecondary },
    summaryValue: { fontSize: 14, fontWeight: '600', color: Colors.text },
    divider: { height: 1, backgroundColor: Colors.border, marginVertical: 12 },
    totalLabel: { fontSize: 16, fontWeight: 'bold', color: Colors.text },
    totalValue: { fontSize: 20, fontWeight: 'bold', color: Colors.primary },
    submitButton: { backgroundColor: Colors.primary, margin: 16, padding: 16, borderRadius: 12, alignItems: 'center' },
    submitButtonDisabled: { opacity: 0.6 },
    submitButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  });
  