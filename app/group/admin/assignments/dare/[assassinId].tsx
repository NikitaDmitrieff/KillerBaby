import { View, Text, TouchableOpacity, ActivityIndicator, Alert, TextInput, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useEffect, useMemo, useState } from 'react';
import { useGroupsStore } from '../../../../../state/groups';
import { supabase } from '../../../../../lib/supabase';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function getInitials(name: string | undefined | null) {
  const safe = (name ?? '').trim();
  if (!safe) return '?';
  const parts = safe.split(/\s+/).filter(Boolean);
  const initials = parts.map((p) => p[0] || '').join('').slice(0, 2).toUpperCase();
  return initials || '?';
}

function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const initials = useMemo(() => getInitials(name), [name]);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f3f4f6',
        borderWidth: 2,
        borderColor: '#ffffff',
      }}
    >
      <Text style={{ fontSize: Math.max(12, Math.floor(size * 0.42)), fontWeight: '800', color: '#111827' }}>{initials}</Text>
    </View>
  );
}

export default function DareDetailsScreen() {
  const router = useRouter();
  const { assassinId } = useLocalSearchParams<{ assassinId: string }>();
  const { id: groupId } = useGroupsStore();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [assassinName, setAssassinName] = useState('');
  const [targetName, setTargetName] = useState('');
  const [dareText, setDareText] = useState('');

  useEffect(() => {
    if (!groupId || !assassinId) return;
    (async () => {
      try {
        setLoading(true);
        const { data: assign, error: assignErr } = await supabase
          .from('assignments')
          .select('assassin_player_id, target_player_id, dare_text')
          .eq('group_id', groupId)
          .eq('assassin_player_id', assassinId)
          .eq('is_active', true)
          .maybeSingle();
        if (assignErr) throw assignErr;
        if (!assign) throw new Error('Assignment not found');
        const assassinPlayerId = assign.assassin_player_id as string;
        const targetPlayerId = assign.target_player_id as string;
        const { data: players, error: playersErr } = await supabase
          .from('group_players')
          .select('id, display_name')
          .in('id', [assassinPlayerId, targetPlayerId]);
        if (playersErr) throw playersErr;
        const nameById = new Map<string, string>((players ?? []).map((p: any) => [p.id as string, (p.display_name as string) || '—']));
        setAssassinName(nameById.get(assassinPlayerId) || '—');
        setTargetName(nameById.get(targetPlayerId) || '—');
        setDareText((assign.dare_text as string) || '');
      } catch (e: any) {
        Alert.alert('Error', e?.message ?? 'Failed to load dare');
      } finally {
        setLoading(false);
      }
    })();
  }, [groupId, assassinId]);

  async function save() {
    if (!groupId || !assassinId) return;
    try {
      setSaving(true);
      const { error } = await supabase.rpc('edit_active_dare', {
        p_group_id: groupId,
        p_assassin_player_id: assassinId,
        p_new_dare_text: dareText ?? '',
      });
      if (error) throw error;
      router.back();
    } catch (e: any) {
      Alert.alert('Update failed', e?.message ?? 'Could not update dare');
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
        <View
          style={{
            paddingTop: insets.top,
            paddingHorizontal: 16,
            paddingBottom: 12,
            borderBottomWidth: 1,
            borderColor: '#e5e7eb',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Text numberOfLines={1} style={{ fontSize: 20, fontWeight: '800', color: '#111827', flex: 1, paddingRight: 16 }}>
            {assassinName ? `${assassinName}'s Dare` : 'Dare'}
          </Text>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}>
            <Text style={{ fontSize: 20, color: '#111827' }}>✕</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
            <ActivityIndicator />
          </View>
        ) : (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <View style={{ backgroundColor: '#f9f9fb', borderRadius: 12, padding: 16, marginBottom: 12 }}>
              <Text style={{ fontWeight: '800', marginBottom: 10 }}>Participants</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Avatar name={assassinName} />
                <Text style={{ fontWeight: '700' }}>{assassinName}</Text>
                <Text>→</Text>
                <Avatar name={targetName} />
                <Text style={{ fontWeight: '700' }}>{targetName}</Text>
              </View>
            </View>

            <View style={{ backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 16, marginBottom: 12 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#6b7280' }}>Dare text</Text>
              <TextInput
                value={dareText}
                onChangeText={setDareText}
                placeholder="Enter dare"
                multiline
                textAlignVertical="top"
                style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12, minHeight: 140, marginTop: 8 }}
              />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                <TouchableOpacity onPress={() => router.back()} style={{ backgroundColor: '#e5e7eb', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10 }}>
                  <Text style={{ color: '#111827', fontWeight: '700' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={save} disabled={saving} style={{ backgroundColor: '#059669', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, opacity: saving ? 0.8 : 1 }}>
                  {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#ffffff', fontWeight: '800' }}>Save</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}


