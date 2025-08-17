import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { COLORS } from '../theme/colors';

export default function SecureAccountScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const { data: auth } = await supabase.auth.getUser();
        if (!auth.user) {
          Alert.alert('Not signed in', 'Please try again.');
          router.back();
          return;
        }
        if (!mounted) return;
        setEmail(auth.user.email ?? '');
      } catch (e: any) {
        if (mounted) Alert.alert('Error', e?.message ?? 'Failed to load');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  async function handleSecure() {
    try {
      setSaving(true);
      const targetEmail = email.trim();
      const targetPassword = password.trim();
      if (!targetEmail || !targetPassword) {
        Alert.alert('Missing info', 'Enter email and password.');
        return;
      }
      const { error } = await supabase.auth.updateUser({ email: targetEmail, password: targetPassword });
      if (error) throw error;
      Alert.alert('Check your email', 'Confirm the change to finish securing your account.');
      router.back();
    } catch (e: any) {
      Alert.alert('Update failed', e?.message ?? 'Unknown error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 24, fontWeight: '800' }}>Secure account</Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6' }}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={20} color="#111" />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={{ paddingVertical: 20 }}>
            <ActivityIndicator />
          </View>
        ) : (
          <>
            <Text style={{ color: '#6b7280' }}>
              Convert this anonymous session into a password-protected account. You can use the same account on other devices after verifying your email.
            </Text>
            <View style={{ gap: 8 }}>
              <Text style={{ fontWeight: '700' }}>Email</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12 }}
              />
            </View>
            <View style={{ gap: 8 }}>
              <Text style={{ fontWeight: '700' }}>Password</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                secureTextEntry
                style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12 }}
              />
            </View>

            <TouchableOpacity
              disabled={saving}
              onPress={handleSecure}
              style={{ backgroundColor: saving ? '#cbd5e1' : COLORS.brandPrimary, padding: 16, borderRadius: 14, alignItems: 'center' }}
            >
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Secure my account</Text>}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}


