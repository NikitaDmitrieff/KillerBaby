import { router } from 'expo-router';
import { SafeAreaView, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { COLORS } from '../theme/colors';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useEffect, useState } from 'react';
import { useGroupsStore } from '../state/groups';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { Alert, ActivityIndicator } from 'react-native';

export default function CreateBetScreen() {
  console.log('[screen] CreateBet');
  const { id: selectedGroupId, name: selectedGroupName, playerId, hydrate, hydrated } = useGroupsStore();
  const [question, setQuestion] = useState('');
  const [deadline, setDeadline] = useState(new Date(Date.now() + 1000 * 60 * 60 * 24));
  const [category, setCategory] = useState<'sports' | 'lifestyle' | 'personal'>('lifestyle');
  const [submitting, setSubmitting] = useState(false);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [groupPlayers, setGroupPlayers] = useState<Array<{ id: string; display_name: string }>>([]);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Array<string>>([]);

  useEffect(() => {
    (async () => {
      if (!selectedGroupId) {
        setGroupPlayers([]);
        return;
      }
      try {
        setPlayersLoading(true);
        const { data, error } = await supabase
          .from('group_players')
          .select('id, display_name')
          .eq('group_id', selectedGroupId)
          .order('display_name', { ascending: true })
          .limit(500);
        if (error) throw error;
        const rows = (data ?? []).map((p: any) => ({ id: p.id as string, display_name: (p.display_name as string) || '—' }));
        setGroupPlayers(rows);
      } catch (e) {
        console.error('Load players failed', e);
      } finally {
        setPlayersLoading(false);
      }
    })();
  }, [selectedGroupId]);

  function togglePlayerSelection(playerId: string) {
    setSelectedPlayerIds((prev) => (prev.includes(playerId) ? prev.filter((id) => id !== playerId) : [...prev, playerId]));
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 60 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 24, fontWeight: '800' }}>Create a bet {selectedGroupName ? `in ${selectedGroupName}` : ''}</Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6' }}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={20} color="#111" />
          </TouchableOpacity>
        </View>

        <View style={{ gap: 8 }}>
          <Text style={{ fontWeight: '700' }}>Question / Challenge</Text>
          <TextInput
            placeholder="Will Martin go to bed before midnight?"
            value={question}
            onChangeText={setQuestion}
            style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12 }}
          />
        </View>

        <View style={{ gap: 8 }}>
          <Text style={{ fontWeight: '700' }}>Category</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['sports', 'lifestyle', 'personal'] as const).map((c) => (
              <TouchableOpacity
                key={c}
                onPress={() => setCategory(c)}
                style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: c === category ? '#111' : '#f3f4f6' }}
              >
                <Text style={{ color: c === category ? '#fff' : '#111', fontWeight: '600', textTransform: 'capitalize' }}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <Text style={{ fontWeight: '700' }}>Deadline</Text>
          <DateTimePicker value={deadline} mode="datetime" onChange={(_, d) => d && setDeadline(d)} />
        </View>

        <View style={{ backgroundColor: '#f7f7fb', padding: 16, borderRadius: 16 }}>
          <Text style={{ fontWeight: '700', marginBottom: 8 }}>Tag players</Text>
          {playersLoading ? (
            <ActivityIndicator />
          ) : groupPlayers.length === 0 ? (
            <Text style={{ color: '#6b7280' }}>No players in this group yet.</Text>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {groupPlayers.map((p) => {
                const selected = selectedPlayerIds.includes(p.id);
                return (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => togglePlayerSelection(p.id)}
                    style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: selected ? '#4338ca' : '#e5e7eb' }}
                  >
                    <Text style={{ color: selected ? '#fff' : '#111', fontWeight: '600' }}>{p.display_name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
          {selectedPlayerIds.length > 0 ? (
            <Text style={{ color: '#6b7280', marginTop: 8 }}>{selectedPlayerIds.length} tagged</Text>
          ) : null}
        </View>

        <TouchableOpacity
          disabled={submitting}
          style={{ backgroundColor: COLORS.brandPrimary, padding: 16, borderRadius: 14, alignItems: 'center', marginTop: 8, opacity: submitting ? 0.6 : 1 }}
          onPress={async () => {
            const trimmed = question.trim();
            if (!trimmed) return;
            try {
              setSubmitting(true);
              const { data: authData } = await supabase.auth.getUser();
              const user = authData.user;
              if (!user) {
                Alert.alert('Sign in required', 'Please sign in to create a bet.');
                return;
              }
              if (!selectedGroupId) {
                Alert.alert('Select a group', 'Please choose a group before creating a bet.');
                return;
              }
              if (!playerId) {
                Alert.alert('Pick your player', 'Choose your name in this group first.');
                router.replace('/group/join');
                return;
              }

              const { data: cat, error: catErr } = await supabase
                .from('categories')
                .select('id, slug')
                .eq('slug', category)
                .maybeSingle();
              if (catErr || !cat) throw catErr ?? new Error('Category not found');

              const { data: bet, error: betErr } = await supabase
                .from('bets')
                .insert({
                  creator_id: user.id,
                  creator_player_id: playerId,
                  category_id: cat.id,
                  question: trimmed,
                  deadline_at: deadline.toISOString(),
                  visibility: 'group',
                  group_id: selectedGroupId,
                })
                .select('id')
                .single();
              if (betErr) throw betErr;

              const { error: optErr } = await supabase
                .from('bet_options')
                .insert([
                  { bet_id: bet.id, label: 'Yes', option_order: 1 },
                  { bet_id: bet.id, label: 'No', option_order: 2 },
                ]);
              if (optErr) throw optErr;

              if (selectedPlayerIds.length > 0) {
                const tagRows = selectedPlayerIds.map((pid) => ({ bet_id: bet.id, player_id: pid }));
                const { error: tagErr } = await (supabase as any).from('bet_player_tags').insert(tagRows);
                if (tagErr) throw tagErr;
              }

              router.back();
            } catch (e: any) {
              console.error('Create bet failed', e);
              Alert.alert('Could not create bet', e?.message ?? 'Unknown error');
            } finally {
              setSubmitting(false);
            }
          }}
        >
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Create bet</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}


