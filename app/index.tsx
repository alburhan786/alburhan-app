import { Redirect } from 'expo-router';
  import { useAuth } from '../contexts/AuthContext';
  import { View, ActivityIndicator } from 'react-native';
  import { Colors } from '../constants/Colors';

  export default function Index() {
    const { user, loading } = useAuth();

    if (loading) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      );
    }

    if (user) {
      return <Redirect href="/(tabs)" />;
    }

    return <Redirect href="/(auth)/login" />;
  }
  