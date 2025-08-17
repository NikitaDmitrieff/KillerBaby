import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { COLORS } from '../theme/colors';

export default function SettingsScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string>('');
  const [joinedAt, setJoinedAt] = useState<string>('');
  const [username, setUsername] = useState('');
  const [initialUsername, setInitialUsername] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const { data: sess } = await supabase.auth.getSession();
        console.log('[settings] getSession hasSession:', !!sess.session);
        if (!sess.session) {
          const { error } = await (supabase.auth as any).signInAnonymously?.();
          if (error) {
            console.warn('[settings] signInAnonymously failed:', (error as any)?.message);
          } else {
            console.log('[settings] signInAnonymously ok');
          }
        }
        let u = (await supabase.auth.getUser()).data.user;
        console.log('[settings] initial getUser uid:', u?.id);
        if (!u) {
          for (let i = 0; i < 5; i++) {
            await new Promise((r) => setTimeout(r, 150));
            const res = await supabase.auth.getUser();
            if (res.data.user) {
              u = res.data.user;
              console.log('[settings] retry getUser uid:', u?.id, 'iter', i);
              break;
            }
          }
        }
        if (!u) {
          console.warn('[settings] Could not obtain user after retries');
          return;
        }
        if (!mounted) return;
        setUserId(u.id);
        setEmail(u.email ?? '');
        try {
          const created = u.created_at ? new Date(u.created_at) : null;
          if (created) {
            setJoinedAt(
              created.toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })
            );
          } else {
            setJoinedAt('');
          }
        } catch {
          setJoinedAt('');
        }
        const { data, error } = await supabase
          .from('profiles')
          .select('username')
          .eq('id', u.id)
          .maybeSingle();
        if (error) throw error;
        if (!mounted) return;
        setUsername(((data as any)?.username ?? '') as string);
        setInitialUsername(((data as any)?.username ?? '') as string);
      } catch (e: any) {
        if (mounted) Alert.alert('Error', e?.message ?? 'Failed to load settings');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const usernameError = useMemo(() => {
    const value = username.trim();
    if (value.length === 0) return 'Required';
    if (value.length < 3 || value.length > 32) return '3–32 characters';
    if (!/^[A-Za-z0-9_]+$/.test(value)) return 'Letters, numbers, and _ only';
    return null;
  }, [username]);

  const canSave = useMemo(() => {
    if (!userId) return false;
    if (usernameError) return false;
    return username.trim() !== initialUsername.trim();
  }, [userId, username, initialUsername, usernameError]);

  const handleSave = async () => {
    if (!userId || usernameError) return;
    try {
      setSaving(true);
      const nextUsername = username.trim();
      const { error } = await supabase
        .from('profiles')
        .update({ username: nextUsername })
        .eq('id', userId);
      if (error) throw error;
      setInitialUsername(nextUsername);
      Alert.alert('Saved', 'Profile updated.');
      router.back();
    } catch (e: any) {
      const msg = e?.message ?? 'Unknown error';
      if (/(duplicate key|unique)/i.test(msg)) {
        Alert.alert('Username taken', 'Please choose a different username.');
      } else {
        Alert.alert('Update failed', msg);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 24, fontWeight: '800' }}>Settings</Text>
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
            <Text style={{ fontWeight: '800', fontSize: 20 }}>Account</Text>
            <View style={{ backgroundColor: '#f7f7fb', padding: 16, borderRadius: 16, gap: 10 }}>
              <View>
                <Text style={{ color: '#6b7280' }}>User ID</Text>
                <Text style={{ fontWeight: '600', marginTop: 2 }} numberOfLines={1} ellipsizeMode="middle">{userId || '—'}</Text>
              </View>
              <View>
                <Text style={{ color: '#6b7280' }}>Email</Text>
                <Text style={{ fontWeight: '600', marginTop: 2 }}>{email || '—'}</Text>
              </View>
              <View>
                <Text style={{ color: '#6b7280' }}>Joined</Text>
                <Text style={{ fontWeight: '600', marginTop: 2 }}>{joinedAt || '—'}</Text>
              </View>
            </View>

            <View style={{ gap: 8 }}>
              <Text style={{ fontWeight: '700' }}>Username</Text>
              <TextInput
                value={username}
                onChangeText={setUsername}
                placeholder="your_username"
                autoCapitalize="none"
                autoCorrect={false}
                style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12 }}
              />
              {!!usernameError && <Text style={{ color: '#ef4444' }}>{usernameError}</Text>}
            </View>

            <TouchableOpacity
              disabled={!canSave || saving}
              onPress={handleSave}
              style={{ backgroundColor: canSave && !saving ? COLORS.brandPrimary : '#cbd5e1', padding: 16, borderRadius: 14, alignItems: 'center' }}
            >
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Save</Text>}
            </TouchableOpacity>

            <View style={{ height: 1, backgroundColor: '#e5e7eb', marginVertical: 8 }} />
            <Text style={{ fontWeight: '800', fontSize: 20 }}>Security</Text>
            <TouchableOpacity onPress={() => router.push('/secure-account')} style={{ backgroundColor: '#111827', padding: 16, borderRadius: 14, alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Secure my account</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}


