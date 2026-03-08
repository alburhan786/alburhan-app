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
  } from 'react-native';
  import { useRouter } from 'expo-router';
  import { useAuth } from '../../contexts/AuthContext';
  import { Colors } from '../../constants/Colors';

  export default function LoginScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const router = useRouter();

    const handleLogin = async () => {
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

    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Text style={styles.logo}>AL BURHAN</Text>
            <Text style={styles.subtitle}>Tours & Travels</Text>
            <Text style={styles.tagline}>Your Journey to the Holy Lands</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.title}>Welcome Back</Text>
            
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
              onPress={handleLogin}
              disabled={loading}
            >
              <Text style={styles.buttonText}>
                {loading ? 'Signing In...' : 'Sign In'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => router.push('/(auth)/register')}
            >
              <Text style={styles.linkText}>
                Don't have an account? <Text style={styles.linkTextBold}>Register</Text>
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
      marginBottom: 40,
    },
    logo: {
      fontSize: 36,
      fontWeight: 'bold',
      color: Colors.primary,
      letterSpacing: 2,
    },
    subtitle: {
      fontSize: 18,
      color: Colors.secondary,
      fontWeight: '600',
      marginTop: 4,
    },
    tagline: {
      fontSize: 14,
      color: Colors.textSecondary,
      marginTop: 8,
      fontStyle: 'italic',
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
      fontWeight: 'bold',
      color: Colors.text,
      marginBottom: 24,
      textAlign: 'center',
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
    buttonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: 'bold',
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
      fontWeight: 'bold',
    },
  });
  