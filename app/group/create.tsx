import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { COLORS } from '../../theme/colors';
import { useGroupsStore } from '../../state/groups';
import DateTimeField from '../../components/DateTimeField';

export default function GroupCreateScreen() {
  const { setSelectedGroup } = useGroupsStore();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [deadlineLocal, setDeadlineLocal] = useState<Date | null>(null);
  const [guestName, setGuestName] = useState('');
  const [guests, setGuests] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Pre-fill deadline 48 hours from now by default (local time)
  useEffect(() => {
    setDeadlineLocal(new Date(Date.now() + 48 * 60 * 60 * 1000));
  }, []);

  function addGuest() {
    const trimmed = guestName.trim();
    if (!trimmed) return;
    if (guests.includes(trimmed)) return;
    setGuests((g) => [...g, trimmed]);
    setGuestName('');
  }

  function removeGuest(n: string) {
    setGuests((g) => g.filter((x) => x !== n));
  }

  const canSubmit = name.trim().length >= 2;

  

  const onSubmit = async () => {
    const groupName = name.trim();
    if (!groupName) return;
    try {
      setSubmitting(true);
      // Ensure we have a session (best-effort anonymous sign-in like settings screen)
      const sessRes = await supabase.auth.getSession();
      if (!sessRes.data.session) {
        const { error } = await (supabase.auth as any).signInAnonymously?.();
        if (error) {
          console.warn('[create-group] signInAnonymously failed:', (error as any)?.message);
        }
      }
      let user = (await supabase.auth.getUser()).data.user;
      if (!user) {
        for (let i = 0; i < 5; i++) {
          await new Promise((r) => setTimeout(r, 150));
          const res = await supabase.auth.getUser();
          if (res.data.user) {
            user = res.data.user;
            break;
          }
        }
      }
      if (!user) throw new Error('Not signed in');

      const deadlineIso = deadlineLocal ? deadlineLocal.toISOString() : null;

      const { data: inserted, error: gErr } = await supabase
        .from('groups')
        .insert({ name: groupName, description: description.trim() || null, created_by: user.id, deadline_at: deadlineIso })
        .select('id, name')
        .single();
      if (gErr) throw gErr;

      if (guests.length > 0) {
        const rows = guests.map((display_name) => ({ group_id: (inserted as any).id as string, display_name }));
        const { error: gpErr } = await supabase.from('group_players').insert(rows);
        if (gpErr) throw gpErr;
      }

      await setSelectedGroup((inserted as any).id as string, (inserted as any).name as string);
      router.replace('/group/join');
    } catch (e: any) {
      Alert.alert('Could not create group', e?.message ?? 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Text style={{ fontSize: 24, fontWeight: '800' }}>Create group</Text>

        <View style={{ gap: 8 }}>
          <Text style={{ fontWeight: '700' }}>Name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Poker nights"
            style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12 }}
          />
        </View>

        <View style={{ gap: 8 }}>
          <Text style={{ fontWeight: '700' }}>Description (optional)</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="A private group for our weekly games"
            style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12 }}
          />
        </View>

        <View style={{ gap: 8 }}>
          <Text style={{ fontWeight: '700' }}>Deadline (optional)</Text>
          <DateTimeField
            label="Deadline"
            value={deadlineLocal ?? undefined}
            onChange={(d) => setDeadlineLocal(d)}
            minuteInterval={5}
            minimumDate={new Date()}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              onPress={() => setDeadlineLocal(new Date(Date.now() + 48 * 60 * 60 * 1000))}
              style={{ paddingHorizontal: 12, paddingVertical: 12, borderRadius: 12, backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ color: '#1f2937', fontWeight: '700' }}>Reset to +48h</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setDeadlineLocal(null)}
              style={{ paddingHorizontal: 12, paddingVertical: 12, borderRadius: 12, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ color: '#6b7280', fontWeight: '700' }}>Clear</Text>
            </TouchableOpacity>
          </View>
          <Text style={{ color: '#6b7280', fontSize: 12 }}>Defaults to 48 hours from now. Clear to skip.</Text>
        </View>

        <View style={{ backgroundColor: '#f7f7fb', padding: 16, borderRadius: 16 }}>
          <Text style={{ fontWeight: '700', marginBottom: 8 }}>Add players by name (optional)</Text>
          {guests.length === 0 ? (
            <Text style={{ color: '#6b7280' }}>No names added</Text>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {guests.map((n) => (
                <View key={n} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#eef2ff', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 }}>
                  <Text style={{ fontWeight: '600' }}>{n}</Text>
                  <TouchableOpacity onPress={() => removeGuest(n)} style={{ marginLeft: 8 }}>
                    <Text style={{ color: '#6b7280' }}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <TextInput
              value={guestName}
              onChangeText={setGuestName}
              placeholder="Add a player name"
              style={{ flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 }}
            />
            <TouchableOpacity onPress={addGuest} style={{ backgroundColor: '#e5e7eb', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 }}>
              <Text style={{ fontWeight: '700' }}>Add</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          disabled={!canSubmit || submitting}
          onPress={onSubmit}
          style={{ backgroundColor: canSubmit && !submitting ? COLORS.brandPrimary : '#cbd5e1', padding: 16, borderRadius: 14, alignItems: 'center' }}
        >
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Create</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 8, padding: 12, borderRadius: 12, alignItems: 'center', backgroundColor: '#f3f4f6' }}>
          <Text style={{ fontWeight: '600' }}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}


