import { View, Text, TouchableOpacity, ActivityIndicator, Alert, TextInput, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useEffect, useMemo, useState } from 'react';
import { useGroupsStore } from '../../../../../state/groups';
import { supabase } from '../../../../../lib/supabase';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { COLORS } from '../../../../../theme/colors';
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
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');
  const [templates, setTemplates] = useState<Array<{ id: number; text: string; difficulty?: 'EASY' | 'INTERMEDIATE' | 'HARD'; tags?: string[] }>>([]);
  const [selectedFilters, setSelectedFilters] = useState<Array<'EASY' | 'INTERMEDIATE' | 'HARD' | 'HUMAN'>>([]);

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

  useEffect(() => {
    if (!groupId) return;
    (async () => {
      try {
        setTemplatesLoading(true);
        const { data, error } = await supabase
          .from('dare_templates')
          .select('id, text, difficulty, tags')
          .eq('group_id', groupId)
          .eq('is_active', true);
        if (error) throw error;
        const difficultyOrder: Record<string, number> = { EASY: 0, INTERMEDIATE: 1, HARD: 2 };
        const rows = (data as any[] | null) ?? [];
        rows.sort((a, b) => {
          const da = difficultyOrder[(a?.difficulty as string) || 'EASY'] ?? 0;
          const db = difficultyOrder[(b?.difficulty as string) || 'EASY'] ?? 0;
          if (da !== db) return da - db;
          return (a?.text || '').localeCompare(b?.text || '');
        });
        setTemplates(rows.map((r) => ({
          id: r.id as number,
          text: (r.text as string) || '',
          difficulty: (r.difficulty as any) || 'EASY',
          tags: (r.tags as string[] | null) || [],
        })));
      } catch (e: any) {
        // Non-fatal; browsing is optional
      } finally {
        setTemplatesLoading(false);
      }
    })();
  }, [groupId]);

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
        <View style={{ paddingTop: insets.top, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#ffffff' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text numberOfLines={1} style={{ fontSize: 22, fontWeight: '800', color: '#111827', flex: 1, paddingRight: 16 }}>
              Edit Dare
            </Text>
            <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}>
              <Text style={{ fontSize: 20, color: '#111827' }}>✕</Text>
            </TouchableOpacity>
          </View>
          <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Avatar name={assassinName} size={36} />
            <Text style={{ fontWeight: '800', color: '#111827' }}>{assassinName || '—'}</Text>
            <Text style={{ color: '#6b7280' }}>→</Text>
            <Avatar name={targetName} size={36} />
            <Text style={{ fontWeight: '800', color: '#111827' }}>{targetName || '—'}</Text>
          </View>
        </View>

        {loading ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
            <ActivityIndicator />
          </View>
        ) : (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <View style={{ backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 16, marginBottom: 12 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#6b7280' }}>Dare text</Text>
              <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>Tip: pick a template below and tweak the text.</Text>
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
                <TouchableOpacity onPress={save} disabled={saving} style={{ backgroundColor: COLORS.brandPrimary, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, opacity: saving ? 0.8 : 1 }}>
                  {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#ffffff', fontWeight: '800' }}>Save</Text>}
                </TouchableOpacity>
              </View>
            </View>

            <View style={{ backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 16 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#6b7280' }}>Browse templates</Text>
              <TextInput
                value={templateSearch}
                onChangeText={setTemplateSearch}
                placeholder="Search templates"
                style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 10, marginTop: 10 }}
              />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                {(["ALL", "EASY", "INTERMEDIATE", "HARD", "HUMAN"] as const).map((opt) => {
                  const label = opt === 'ALL' ? 'All' : opt === 'EASY' ? 'Easy' : opt === 'INTERMEDIATE' ? 'Intermediate' : opt === 'HARD' ? 'Hard' : 'Human';
                  const isSelected = opt === 'ALL' ? selectedFilters.length === 0 : selectedFilters.includes(opt);
                  return (
                    <TouchableOpacity
                      key={opt}
                      onPress={() => {
                        if (opt === 'ALL') {
                          setSelectedFilters([]);
                          return;
                        }
                        setSelectedFilters((prev) =>
                          prev.includes(opt)
                            ? prev.filter((f) => f !== opt)
                            : [...prev, opt]
                        );
                      }}
                      style={{ backgroundColor: isSelected ? COLORS.brandPrimary : '#f3f4f6', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 9999 }}
                    >
                      <Text style={{ color: isSelected ? '#fff' : '#111827', fontWeight: '700' }}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {templatesLoading ? (
                <View style={{ paddingVertical: 12 }}>
                  <ActivityIndicator />
                </View>
              ) : (
                <View style={{ marginTop: 8 }}>
                  {templates
                    .filter((t) => {
                      const q = templateSearch.trim().toLowerCase();
                      const matchesSearch = !q || (
                        t.text.toLowerCase().includes(q) ||
                        (t.tags || []).some((tag) => tag.toLowerCase().includes(q)) ||
                        (t.difficulty || 'EASY').toLowerCase().includes(q)
                      );
                      const matchesDiff =
                        selectedFilters.length === 0
                          ? true
                          : selectedFilters.some((filter) =>
                              filter === 'HUMAN'
                                ? (t.tags || []).includes('Human')
                                : (t.difficulty || 'EASY') === filter
                            );
                      return matchesSearch && matchesDiff;
                    })
                    .slice(0, 60)
                    .map((t) => (
                      <View key={t.id} style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12, marginTop: 8 }}>
                        <Text style={{ color: '#111827' }}>{t.text}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                          {!!t.difficulty && (
                            <View style={{ backgroundColor: '#f3f4f6', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 }}>
                              <Text style={{ fontSize: 11, fontWeight: '800', color: '#374151' }}>{t.difficulty}</Text>
                            </View>
                          )}
                          {(t.tags || []).map((tag) => (
                            <View key={tag} style={{ backgroundColor: '#f9fafb', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: '#e5e7eb' }}>
                              <Text style={{ fontSize: 11, fontWeight: '700', color: '#4b5563' }}>{tag}</Text>
                            </View>
                          ))}
                          <View style={{ flex: 1 }} />
                          <TouchableOpacity onPress={() => setDareText(t.text)} style={{ backgroundColor: COLORS.brandPrimary, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 }}>
                            <Text style={{ color: '#ffffff', fontWeight: '800' }}>Use</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                </View>
              )}
            </View>
          </ScrollView>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}


