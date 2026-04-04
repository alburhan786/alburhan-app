import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Linking,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { Colors } from '../../constants/Colors';

const WHATSAPP_BUSINESS_LINK = 'https://wa.me/918989701701?text=Assalamu%20Alaikum%20I%20want%20to%20register%20for%20Hajj%202027%20package%20with%20Al%20Burhan%20Tours%20and%20Travels';

type Step = 'details' | 'otp';
type RegisterMode = 'direct' | 'otp';

export default function RegisterScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<Step>('details');
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpMessage, setOtpMessage] = useState('');
  const [registerMode, setRegisterMode] = useState<RegisterMode>('direct');
  const { register, sendOtp, sendWhatsAppOtp, verifyOtp } = useAuth();
  const router = useRouter();

  const validateFields = () => {
    if (!name || !email || !phone || !password || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all fields');
      return false;
    }
    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return false;
    }
    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return false;
    }
    return true;
  };

  const handleDirectRegister = async () => {
    if (!validateFields()) return;

    setLoading(true);
    try {
      await register({ name, email, phone, password });
      router.replace('/(tabs)');
    } catch (error: any) {
      Alert.alert('Registration Failed', error.message || 'Could not create account');
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = async (method: 'sms' | 'whatsapp') => {
    if (!validateFields()) return;

    setLoading(true);
    try {
      let response;
      if (method === 'whatsapp') {
        response = await sendWhatsAppOtp(phone);
      } else {
        response = await sendOtp(phone);
      }
      setOtpSent(true);
      setStep('otp');
      setOtpMessage(response.message || 'OTP sent successfully');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAndRegister = async () => {
    if (!otp || otp.length !== 6) {
      Alert.alert('Error', 'Please enter a valid 6-digit OTP');
      return;
    }

    setLoading(true);
    try {
      await verifyOtp(phone, otp, { name, email, password });
      router.replace('/(tabs)');
    } catch (error: any) {
      Alert.alert('Verification Failed', error.message || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  const renderDetailsStep = () => (
    <>
      <TextInput
        style={styles.input}
        placeholder="Full Name"
        value={name}
        onChangeText={setName}
        placeholderTextColor={Colors.textSecondary}
      />

      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        placeholderTextColor={Colors.textSecondary}
      />

      <TextInput
        style={styles.input}
        placeholder="Phone Number"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        placeholderTextColor={Colors.textSecondary}
      />

      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholderTextColor={Colors.textSecondary}
      />

      <TextInput
        style={styles.input}
        placeholder="Confirm Password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        placeholderTextColor={Colors.textSecondary}
      />

      {registerMode === 'direct' ? (
        <>
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleDirectRegister}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <View style={styles.buttonRow}>
                <Ionicons name="person-add-outline" size={20} color="#FFFFFF" />
                <Text style={styles.buttonText}>Create Account</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.switchModeButton}
            onPress={() => setRegisterMode('otp')}
          >
            <Text style={styles.switchModeText}>Register with OTP verification instead</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={() => handleSendOtp('sms')}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <View style={styles.buttonRow}>
                <Ionicons name="chatbubble-outline" size={20} color="#FFFFFF" />
                <Text style={styles.buttonText}>Send OTP via SMS</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.whatsappButton, loading && styles.buttonDisabled]}
            onPress={() => handleSendOtp('whatsapp')}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <View style={styles.buttonRow}>
                <Ionicons name="logo-whatsapp" size={20} color="#FFFFFF" />
                <Text style={styles.buttonText}>Send OTP via WhatsApp</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.whatsappHelpButton}
            onPress={() => Linking.openURL(WHATSAPP_BUSINESS_LINK)}
          >
            <Ionicons name="information-circle-outline" size={16} color="#25D366" />
            <Text style={styles.whatsappHelpText}>Message us on WhatsApp first to receive OTP</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.switchModeButton}
            onPress={() => setRegisterMode('direct')}
          >
            <Text style={styles.switchModeText}>Register directly without OTP</Text>
          </TouchableOpacity>
        </>
      )}
    </>
  );

  const renderOtpStep = () => (
    <>
      {otpMessage ? (
        <View style={styles.otpMessageContainer}>
          <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
          <Text style={styles.otpMessageText}>{otpMessage}</Text>
        </View>
      ) : null}

      <Text style={styles.otpLabel}>Enter the 6-digit OTP sent to {phone}</Text>

      <TextInput
        style={[styles.input, styles.otpInput]}
        placeholder="Enter OTP"
        value={otp}
        onChangeText={setOtp}
        keyboardType="number-pad"
        maxLength={6}
        placeholderTextColor={Colors.textSecondary}
      />

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleVerifyAndRegister}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <View style={styles.buttonRow}>
            <Ionicons name="checkmark-circle-outline" size={20} color="#FFFFFF" />
            <Text style={styles.buttonText}>Verify & Register</Text>
          </View>
        )}
      </TouchableOpacity>

      <View style={styles.resendRow}>
        <TouchableOpacity
          style={styles.resendButton}
          onPress={() => handleSendOtp('sms')}
          disabled={loading}
        >
          <Text style={styles.resendText}>Resend SMS</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.resendButton}
          onPress={() => handleSendOtp('whatsapp')}
          disabled={loading}
        >
          <Text style={styles.resendText}>Resend WhatsApp</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.backButton}
        onPress={() => { setStep('details'); setOtp(''); }}
      >
        <Ionicons name="arrow-back" size={18} color={Colors.primary} />
        <Text style={styles.backButtonText}>Change Details</Text>
      </TouchableOpacity>
    </>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Image
            source={require('../../assets/images/alburhan_logo.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
        </View>

        <View style={styles.form}>
          <Text style={styles.title}>
            {step === 'details' ? 'Create Account' : 'Verify OTP'}
          </Text>

          {step === 'details' ? renderDetailsStep() : renderOtpStep()}

          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => router.back()}
          >
            <Text style={styles.linkText}>
              Already have an account? <Text style={styles.linkTextBold}>Sign In</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoImage: {
    width: 180,
    height: 120,
    marginBottom: 8,
  },
  form: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold' as const,
    color: Colors.text,
    marginBottom: 24,
    textAlign: 'center' as const,
  },
  input: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: Colors.text,
    marginBottom: 16,
  },
  otpInput: {
    fontSize: 24,
    letterSpacing: 8,
    textAlign: 'center' as const,
  },
  otpLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center' as const,
    marginBottom: 16,
  },
  otpMessageContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: '#ECFDF5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  otpMessageText: {
    fontSize: 13,
    color: Colors.success,
    flex: 1,
  },
  button: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center' as const,
    marginTop: 8,
  },
  whatsappButton: {
    backgroundColor: '#25D366',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center' as const,
    marginTop: 8,
  },
  whatsappHelpButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginTop: 10,
    paddingVertical: 6,
    gap: 6,
  },
  whatsappHelpText: {
    color: '#25D366',
    fontSize: 12,
    fontWeight: '500' as const,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold' as const,
  },
  switchModeButton: {
    alignItems: 'center' as const,
    marginTop: 16,
    paddingVertical: 8,
  },
  switchModeText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '500' as const,
  },
  resendRow: {
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
    gap: 16,
    marginTop: 16,
  },
  resendButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  resendText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  backButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginTop: 12,
    gap: 4,
  },
  backButtonText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '500' as const,
  },
  linkButton: {
    marginTop: 16,
    alignItems: 'center' as const,
  },
  linkText: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  linkTextBold: {
    color: Colors.primary,
    fontWeight: 'bold' as const,
  },
});
