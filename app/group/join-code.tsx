import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, View, Text, TextInput, TouchableOpacity } from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { COLORS } from '../../theme/colors';
import { useGroupsStore } from '../../state/groups';

function isLikelyUuid(input: string) {
  const s = input.trim();
  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
  return uuidRegex.test(s);
}

function isLikelyShortCode(input: string) {
  const s = input.trim();
  return /^[a-zA-Z0-9]{4}$/.test(s);
}

export default function GroupJoinCodeScreen() {
  const { setSelectedGroup } = useGroupsStore();
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = (isLikelyUuid(code) || isLikelyShortCode(code)) && !submitting;

  async function onSubmit() {
    const raw = code.trim();
    if (!isLikelyUuid(raw) && !isLikelyShortCode(raw)) return;
    try {
      setSubmitting(true);
      let resolved: { id: string; name: string | null } | null = null;

      if (isLikelyShortCode(raw)) {
        const shortCode = raw.toUpperCase();
        const { data: byCode, error: codeErr } = await supabase
          .from('groups')
          .select('id, name')
          .eq('short_code', shortCode)
          .maybeSingle();
        if (codeErr) throw codeErr;
        if (byCode?.id) {
          resolved = { id: byCode.id as string, name: (byCode.name as string) ?? null };
        }
      }

      if (!resolved && isLikelyUuid(raw)) {
        const { data: byId, error: idErr } = await supabase
          .from('groups')
          .select('id, name')
          .eq('id', raw)
          .maybeSingle();
        if (idErr) throw idErr;
        if (byId?.id) {
          resolved = { id: byId.id as string, name: (byId.name as string) ?? null };
        }
      }

      if (!resolved) {
        throw new Error('Group not found for this code');
      }

      await setSelectedGroup(resolved.id, resolved.name ?? resolved.id);
      router.replace('/group/join');
    } catch (e: any) {
      Alert.alert('Join failed', e?.message ?? 'Could not join this group. Check the code and try again.');
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', android: undefined })} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 24, fontWeight: '800' }}>Join a group</Text>
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

          <Text style={{ color: '#6b7280' }}>Enter the group code you received.</Text>

          <View style={{ gap: 8 }}>
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="Group code (e.g. 4C9X or UUID)"
              autoCapitalize="none"
              autoCorrect={false}
              inputMode="text"
              style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}
            />
            <TouchableOpacity
              disabled={!canSubmit}
              onPress={onSubmit}
              style={{
                backgroundColor: canSubmit ? COLORS.brandPrimary : '#cbd5e1',
                paddingHorizontal: 16,
                paddingVertical: 14,
                borderRadius: 12,
                alignItems: 'center',
                marginTop: 8,
              }}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: '#fff', fontWeight: '800' }}>Join</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}


