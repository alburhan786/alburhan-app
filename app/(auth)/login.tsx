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

type LoginMode = 'email' | 'otp';
type OtpStep = 'phone' | 'verify';

export default function LoginScreen() {
  const [mode, setMode] = useState<LoginMode>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpStep, setOtpStep] = useState<OtpStep>('phone');
  const [loading, setLoading] = useState(false);
  const [fallbackOtp, setFallbackOtp] = useState<string | null>(null);
  const [phoneNotFound, setPhoneNotFound] = useState(false);
  const { login, loginWithOtp, verifyLoginOtp, continueAsGuest } = useAuth();
  const router = useRouter();

  const handleEmailLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      await login(email, password);
      router.replace('/(tabs)');
    } catch (error: any) {
      Alert.alert('Login Failed', error.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  const handleSendLoginOtp = async () => {
    if (!phone) {
      Alert.alert('Error', 'Please enter your phone number');
      return;
    }

    setPhoneNotFound(false);
    setLoading(true);
    try {
      const result = await loginWithOtp(phone);
      setFallbackOtp(result.fallbackOtp || null);
      setOtpStep('verify');
    } catch (error: any) {
      if (error.errorCode === 'PHONE_NOT_REGISTERED') {
        setPhoneNotFound(true);
      } else {
        Alert.alert('Error', error.message || 'Failed to send OTP');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyLoginOtp = async () => {
    if (!otp || otp.length !== 6) {
      Alert.alert('Error', 'Please enter a valid 6-digit OTP');
      return;
    }

    setLoading(true);
    try {
      await verifyLoginOtp(phone, otp);
      router.replace('/(tabs)');
    } catch (error: any) {
      Alert.alert('Verification Failed', error.message || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleContinueAsGuest = async () => {
    await continueAsGuest();
    router.replace('/(tabs)');
  };

  const handleDemoLogin = async () => {
    setLoading(true);
    try {
      await login('test@alburhantravels.com', '123456');
      router.replace('/(tabs)');
    } catch (error: any) {
      Alert.alert('Demo Login Failed', error.message || 'Please try again');
    } finally {
      setLoading(false);
    }
  };

  const renderEmailLogin = () => (
    <>
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
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholderTextColor={Colors.textSecondary}
      />

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleEmailLogin}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <Text style={styles.buttonText}>Sign In</Text>
        )}
      </TouchableOpacity>
    </>
  );

  const renderOtpLogin = () => {
    if (otpStep === 'phone') {
      return (
        <>
          <TextInput
            style={styles.input}
            placeholder="Phone Number"
            value={phone}
            onChangeText={(t) => { setPhone(t); setPhoneNotFound(false); }}
            keyboardType="phone-pad"
            placeholderTextColor={Colors.textSecondary}
          />

          {phoneNotFound && (
            <View style={styles.notFoundBanner}>
              <Ionicons name="information-circle-outline" size={18} color="#b45309" />
              <View style={{ flex: 1 }}>
                <Text style={styles.notFoundText}>Phone number not registered yet.</Text>
                <TouchableOpacity onPress={() => router.push('/(auth)/register')} style={styles.notFoundRegisterBtn}>
                  <Text style={styles.notFoundRegisterText}>Create an account →</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSendLoginOtp}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <View style={styles.buttonRow}>
                <Ionicons name="send-outline" size={18} color="#FFFFFF" />
                <Text style={styles.buttonText}>Send OTP</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.whatsappHelpButton}
            onPress={() => Linking.openURL(WHATSAPP_BUSINESS_LINK)}
          >
            <Ionicons name="logo-whatsapp" size={16} color="#25D366" />
            <Text style={styles.whatsappHelpText}>Message us on WhatsApp for assistance</Text>
          </TouchableOpacity>
        </>
      );
    }

    return (
      <>
        {fallbackOtp ? (
          <View style={styles.fallbackOtpBox}>
            <Ionicons name="warning-outline" size={18} color="#92400e" />
            <View style={styles.fallbackOtpContent}>
              <Text style={styles.fallbackOtpTitle}>SMS/WhatsApp delivery failed</Text>
              <Text style={styles.fallbackOtpText}>Your OTP is shown below. Please use it to sign in.</Text>
              <Text style={styles.fallbackOtpCode}>{fallbackOtp}</Text>
              <Text style={styles.fallbackOtpNote}>Contact us if you need help: 9893225590</Text>
            </View>
          </View>
        ) : (
          <View style={styles.otpInfoBox}>
            <Ionicons name="information-circle-outline" size={18} color="#047857" />
            <Text style={styles.otpInfoText}>
              OTP sent to <Text style={styles.otpPhone}>+91 {phone}</Text>{'\n'}
              Check your <Text style={styles.otpBold}>SMS</Text> and <Text style={styles.otpBold}>WhatsApp</Text>
            </Text>
          </View>
        )}

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
          onPress={handleVerifyLoginOtp}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <View style={styles.buttonRow}>
              <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" />
              <Text style={styles.buttonText}>Verify & Sign In</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.resendButton}
          onPress={() => { setFallbackOtp(null); handleSendLoginOtp(); }}
          disabled={loading}
        >
          <Text style={styles.resendText}>Resend OTP</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.changeButton}
          onPress={() => { setOtpStep('phone'); setOtp(''); setFallbackOtp(null); }}
        >
          <Ionicons name="arrow-back" size={16} color={Colors.primary} />
          <Text style={styles.changeButtonText}>Change Number</Text>
        </TouchableOpacity>
      </>
    );
  };

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
          <Text style={styles.tagline}>Your Journey to the Holy Lands</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.title}>Welcome Back</Text>

          <View style={styles.modeToggle}>
            <TouchableOpacity
              style={[styles.modeButton, mode === 'email' && styles.modeButtonActive]}
              onPress={() => { setMode('email'); setOtpStep('phone'); setOtp(''); }}
            >
              <Ionicons name="mail-outline" size={16} color={mode === 'email' ? '#FFFFFF' : Colors.primary} />
              <Text style={[styles.modeButtonText, mode === 'email' && styles.modeButtonTextActive]}>
                Email
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modeButton, mode === 'otp' && styles.modeButtonActive]}
              onPress={() => setMode('otp')}
            >
              <Ionicons name="phone-portrait-outline" size={16} color={mode === 'otp' ? '#FFFFFF' : Colors.primary} />
              <Text style={[styles.modeButtonText, mode === 'otp' && styles.modeButtonTextActive]}>
                OTP
              </Text>
            </TouchableOpacity>
          </View>

          {mode === 'email' ? renderEmailLogin() : renderOtpLogin()}

          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => router.push('/(auth)/register')}
          >
            <Text style={styles.linkText}>
              Don't have an account? <Text style={styles.linkTextBold}>Register</Text>
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.guestSection}>
          <View style={styles.guestDividerRow}>
            <View style={styles.guestDivider} />
            <Text style={styles.guestDividerText}>or</Text>
            <View style={styles.guestDivider} />
          </View>
          <TouchableOpacity
            style={styles.guestButton}
            onPress={handleContinueAsGuest}
          >
            <Ionicons name="eye-outline" size={18} color={Colors.primary} />
            <Text style={styles.guestButtonText}>Continue as Guest</Text>
          </TouchableOpacity>
          <Text style={styles.guestNote}>Browse packages without signing in</Text>

          <TouchableOpacity
            style={styles.demoButton}
            onPress={handleDemoLogin}
            disabled={loading}
          >
            <Ionicons name="flask-outline" size={14} color={Colors.textSecondary} />
            <Text style={styles.demoButtonText}>Demo Login (App Review)</Text>
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
    marginBottom: 40,
  },
  logoImage: {
    width: 180,
    height: 120,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 8,
    fontStyle: 'italic' as const,
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
    marginBottom: 20,
    textAlign: 'center' as const,
  },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.background,
    borderRadius: 10,
    padding: 4,
    marginBottom: 20,
  },
  modeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  modeButtonActive: {
    backgroundColor: Colors.primary,
  },
  modeButtonText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.primary,
  },
  modeButtonTextActive: {
    color: '#FFFFFF',
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
  otpInfoBox: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#d1fae5',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  otpInfoText: {
    flex: 1,
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  otpPhone: {
    fontWeight: '700' as const,
    color: '#047857',
  },
  otpBold: {
    fontWeight: '700' as const,
    color: '#047857',
  },
  otpLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center' as const,
    marginBottom: 16,
  },
  button: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold' as const,
  },
  resendButton: {
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 8,
  },
  resendText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  whatsappHelpButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginTop: 12,
    paddingVertical: 6,
    gap: 6,
  },
  whatsappHelpText: {
    color: '#25D366',
    fontSize: 12,
    fontWeight: '500' as const,
  },
  fallbackOtpBox: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fcd34d',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  fallbackOtpContent: {
    flex: 1,
  },
  fallbackOtpTitle: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: '#92400e',
    marginBottom: 2,
  },
  fallbackOtpText: {
    fontSize: 12,
    color: '#78350f',
    marginBottom: 6,
  },
  fallbackOtpCode: {
    fontSize: 28,
    fontWeight: 'bold' as const,
    color: '#047857',
    letterSpacing: 8,
    textAlign: 'center' as const,
    marginVertical: 4,
    backgroundColor: '#f0fdf4',
    borderRadius: 8,
    paddingVertical: 6,
    overflow: 'hidden' as const,
  },
  fallbackOtpNote: {
    fontSize: 11,
    color: '#92400e',
    marginTop: 4,
    textAlign: 'center' as const,
  },
  changeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    gap: 4,
  },
  changeButtonText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '500' as const,
  },
  linkButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  linkText: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  linkTextBold: {
    color: Colors.primary,
    fontWeight: 'bold' as const,
  },
  notFoundBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    gap: 8,
  },
  notFoundText: {
    fontSize: 13,
    color: '#92400e',
    fontWeight: '600' as const,
    marginBottom: 4,
  },
  notFoundRegisterBtn: {
    alignSelf: 'flex-start',
  },
  notFoundRegisterText: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '700' as const,
  },
  guestSection: {
    marginTop: 24,
    alignItems: 'center',
  },
  guestDividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: 16,
    gap: 12,
  },
  guestDivider: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  guestDividerText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  guestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    gap: 8,
    backgroundColor: Colors.card,
    width: '100%',
  },
  guestButtonText: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '600' as const,
  },
  guestNote: {
    marginTop: 8,
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center' as const,
  },
  demoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    paddingVertical: 8,
    gap: 6,
    opacity: 0.6,
  },
  demoButtonText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '500' as const,
  },
});
