import CollapsibleHeader from '../../../components/CollapsibleHeader';
import { View, Text, FlatList, TextInput, TouchableOpacity, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useGroupsStore } from '../../../state/groups';
import { useRouter } from 'expo-router';
import { COLORS } from '../../../theme/colors';

type PlayerItem = { id: string; display_name: string; is_active: boolean; owner_user_id: string | null };

function getInitials(name: string | undefined | null) {
  const safe = (name ?? '').trim();
  if (!safe) return '?';
  const parts = safe.split(/\s+/).filter(Boolean);
  const initials = parts.map((p) => p[0] || '').join('').slice(0, 2).toUpperCase();
  return initials || '?';
}

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const initials = useMemo(() => getInitials(name), [name]);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#EEF2FF',
        borderWidth: 2,
        borderColor: '#FFFFFF',
      }}
    >
      <Text style={{ fontSize: Math.max(12, Math.floor(size * 0.42)), fontWeight: '800', color: '#3730A3' }}>{initials}</Text>
    </View>
  );
}

function Chip({
  label,
  tone = 'neutral',
  onPress,
  disabled,
}: {
  label: string;
  tone?: 'neutral' | 'success' | 'danger' | 'brand';
  onPress?: () => void;
  disabled?: boolean;
}) {
  const bg =
    tone === 'success'
      ? '#DCFCE7'
      : tone === 'danger'
      ? '#FEE2E2'
      : tone === 'brand'
      ? '#EEF2FF'
      : '#F3F4F6';
  const fg =
    tone === 'success' ? '#166534' : tone === 'danger' ? '#991B1B' : tone === 'brand' ? COLORS.brandPrimary : '#111827';
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={{
        backgroundColor: bg,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        borderWidth: tone === 'brand' ? 1 : 0,
        borderColor: tone === 'brand' ? COLORS.brandPrimary : 'transparent',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <Text style={{ color: fg, fontWeight: '700' }}>{label}</Text>
    </TouchableOpacity>
  );
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <View
      style={{
        backgroundColor: '#F3F4F6',
        borderRadius: 999,
        padding: 4,
        flexDirection: 'row',
        gap: 6,
      }}
    >
      {options.map((opt) => {
        const active = value === opt;
        return (
          <TouchableOpacity
            key={opt}
            onPress={() => onChange(opt)}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: active ? COLORS.brandPrimary : 'transparent',
            }}
          >
            <Text style={{ color: active ? '#FFFFFF' : '#111827', fontWeight: active ? '800' : '600' }}>{opt}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function AdminPlayersScreen() {
  const { id: groupId } = useGroupsStore();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [players, setPlayers] = useState<PlayerItem[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'All' | 'Active' | 'Removed' | 'Unclaimed'>('All');
  const [gameStatus, setGameStatus] = useState<string | null>(null);
  const [userProfileId, setUserProfileId] = useState<string | null>(null);
  const [checkingIntegrity, setCheckingIntegrity] = useState(false);
  const [ringIsValid, setRingIsValid] = useState<boolean | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [openingChatPlayerId, setOpeningChatPlayerId] = useState<string | null>(null);
  const [ringHasAssignments, setRingHasAssignments] = useState<boolean | null>(null);
  const [hasAnyDare, setHasAnyDare] = useState<boolean | null>(null);

  const activeCount = useMemo(() => players.filter((p) => p.is_active).length, [players]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = players;
    if (filter === 'Active') list = list.filter((p) => p.is_active);
    if (filter === 'Removed') list = list.filter((p) => !p.is_active);
    if (filter === 'Unclaimed') list = list.filter((p) => !p.owner_user_id);
    if (!q) return list;
    return list.filter((p) => p.display_name.toLowerCase().includes(q));
  }, [players, query, filter]);

  async function loadPlayers() {
    if (!groupId) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('group_players')
        .select('id, display_name, is_active, owner_user_id')
        .eq('group_id', groupId)
        .order('display_name', { ascending: true });
      if (error) throw error;
      setPlayers((data ?? []).map((r: any) => ({ id: r.id as string, display_name: (r.display_name as string) || '—', is_active: !!r.is_active, owner_user_id: r.owner_user_id ?? null })));
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to load players');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPlayers();
  }, [groupId]);

  useEffect(() => {
    async function loadRingMeta() {
      if (!groupId) return;
      try {
        const [{ count }, { data: dareOne }] = await Promise.all([
          supabase
            .from('assignments')
            .select('id', { count: 'exact', head: true })
            .eq('group_id', groupId)
            .eq('is_active', true),
          supabase
            .from('assignments')
            .select('id')
            .eq('group_id', groupId)
            .eq('is_active', true)
            .not('dare_text', 'is', null)
            .neq('dare_text', '')
            .limit(1),
        ]);
        setRingHasAssignments((count ?? 0) > 0);
        setHasAnyDare(((dareOne as any[]) ?? []).length > 0);
      } catch {
        setRingHasAssignments(null);
        setHasAnyDare(null);
      }
    }
    loadRingMeta();
  }, [groupId]);

  useEffect(() => {
    async function hydrateContext() {
      if (!groupId) return;
      try {
        const { data: userRes } = await supabase.auth.getUser();
        setUserProfileId(userRes.user?.id ?? null);
        const { data: group, error: gErr } = await supabase
          .from('groups')
          .select('game_status')
          .eq('id', groupId)
          .single();
        if (gErr) throw gErr;
        setGameStatus((group as any)?.game_status ?? null);
      } catch {
        setGameStatus(null);
      }
    }
    hydrateContext();
  }, [groupId]);

  async function addPlaceholder(name: string) {
    if (!groupId) return;
    const display_name = name.trim();
    if (!display_name) return;
    try {
      setSaving(true);
      if (gameStatus === 'active') {
        Alert.alert('Added to group only', 'Game is active. New players are added to the group but not inserted into the current ring.');
      }
      const { error } = await supabase.from('group_players').insert({ group_id: groupId, display_name });
      if (error) throw error;
      setQuery('');
      await loadPlayers();
    } catch (e: any) {
      Alert.alert('Add failed', e?.message ?? 'Could not add player');
    } finally {
      setSaving(false);
    }
  }

  async function setActive(playerId: string, active: boolean) {
    try {
      setSaving(true);
      if (!active) {
        if (gameStatus === 'active') {
          if (!userProfileId) {
            throw new Error('Missing moderator profile. Please re-login and try again.');
          } else {
            const { error: rpcErr } = await supabase.rpc('remove_member_from_ring', {
              p_group_id: groupId,
              p_removed_player_id: playerId,
              p_moderator_profile_id: userProfileId,
            });
            if (rpcErr) throw rpcErr;
          }
        }
        const { error: updErr } = await supabase
          .from('group_players')
          .update({ is_active: false, removed_at: new Date().toISOString() })
          .eq('id', playerId);
        if (updErr) throw updErr;
      } else {
        if (gameStatus === 'active') {
          Alert.alert('Restored to group', 'Player restored to the group. They will not be in the current ring until the next seed.');
        }
        const { error: updErr } = await supabase
          .from('group_players')
          .update({ is_active: true, removed_at: null })
          .eq('id', playerId);
        if (updErr) throw updErr;
      }
      await loadPlayers();
    } catch (e: any) {
      Alert.alert(active ? 'Restore failed' : 'Remove failed', e?.message ?? 'Update failed');
    } finally {
      setSaving(false);
    }
  }

  async function assertRing() {
    if (!groupId) return;
    try {
      setCheckingIntegrity(true);
      const { data, error } = await supabase.rpc('assert_perfect_ring', { p_group_id: groupId });
      if (error) throw error;
      setRingIsValid(!!data);
      if (!data) {
        Alert.alert('Ring check', 'Ring is NOT valid. Please review assignments.');
      }
    } catch (e: any) {
      Alert.alert('Ring check failed', e?.message ?? 'Could not verify ring integrity');
      setRingIsValid(null);
    } finally {
      setCheckingIntegrity(false);
    }
  }

  async function openOrCreateAdminConversation(playerId: string) {
    if (!groupId) return;
    try {
      setOpeningChatPlayerId(playerId);
      let adminProfileId = userProfileId;
      if (!adminProfileId) {
        const { data } = await supabase.auth.getUser();
        adminProfileId = data?.user?.id ?? null;
        if (adminProfileId) setUserProfileId(adminProfileId);
      }
      if (!adminProfileId) {
        throw new Error('Missing admin profile. Please re-login and try again.');
      }
      const { data: existing, error: findErr } = await supabase
        .from('conversations')
        .select('id')
        .eq('group_id', groupId)
        .eq('player_id', playerId)
        .eq('conversation_kind', 'PLAYER_ADMIN')
        .maybeSingle();
      if (findErr) throw findErr;
      let conversationId = (existing as any)?.id as number | undefined;
      if (!conversationId) {
        const { data: inserted, error: insertErr } = await supabase
          .from('conversations')
          .insert({ group_id: groupId, player_id: playerId, conversation_kind: 'PLAYER_ADMIN', admin_profile_id: adminProfileId })
          .select('id')
          .single();
        if (insertErr) throw insertErr;
        conversationId = (inserted as any)?.id as number;
      }
      if (conversationId) {
        router.push(`/group/admin/conversation/${conversationId}`);
      }
    } catch (e: any) {
      Alert.alert('Could not open chat', e?.message ?? 'Failed to open conversation');
    } finally {
      setOpeningChatPlayerId(null);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    try {
      await loadPlayers();
    } finally {
      setRefreshing(false);
    }
  }

  const headerShadow = {
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  };

  return (
    <CollapsibleHeader
      title={'Players'}
      subtitle={'Statuses and progression'}
      isRefreshing={refreshing}
      renderContent={({ contentInsetTop, onScroll, scrollRef }) => (
        <View style={{ flex: 1 }}>
          {loading ? (
            <View style={{ paddingTop: contentInsetTop, paddingHorizontal: 16 }}>
              <ActivityIndicator />
            </View>
          ) : (
            <FlatList
              ref={scrollRef as any}
              onScroll={onScroll}
              scrollEventThrottle={16}
              data={filtered}
              keyExtractor={(i) => i.id}
              contentContainerStyle={{ paddingTop: contentInsetTop, paddingHorizontal: 16, paddingBottom: 120 }}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brandPrimary} colors={[COLORS.brandPrimary]} />
              }
              ListHeaderComponent={
                <View style={{ gap: 12, marginBottom: 12 }}>
                  {/* Stats / Status Row */}
                  <View
                    style={{
                      backgroundColor: '#FFFFFF',
                      borderRadius: 16,
                      padding: 14,
                      borderWidth: 1,
                      borderColor: '#E5E7EB',
                      ...headerShadow,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: '#111827' }}>
                        {players.length} players • {activeCount} active
                      </Text>
                      <Chip
                        label={`Game: ${gameStatus ?? '—'}`}
                        tone="brand"
                        onPress={undefined}
                      />
                    </View>

                    <View style={{ marginTop: 10, flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Segmented value={filter} onChange={(v) => setFilter(v as any)} options={['All', 'Active', 'Removed', 'Unclaimed']} />
                      <TouchableOpacity
                        onPress={assertRing}
                        disabled={checkingIntegrity || !groupId}
                        style={{
                          backgroundColor: checkingIntegrity ? '#CBD5E1' : COLORS.brandPrimary,
                          paddingHorizontal: 14,
                          paddingVertical: 10,
                          borderRadius: 12,
                        }}
                      >
                        {checkingIntegrity ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800' }}>Check ring</Text>}
                      </TouchableOpacity>
                      {ringIsValid != null && (
                        <Chip label={ringIsValid ? 'Ring valid' : 'Ring invalid'} tone={ringIsValid ? 'success' : 'danger'} />
                      )}
                    </View>
                  </View>

                  {/* Search / Add */}
                  <View
                    style={{
                      backgroundColor: '#FFFFFF',
                      borderRadius: 16,
                      padding: 12,
                      borderWidth: 1,
                      borderColor: '#E5E7EB',
                      ...headerShadow,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <TextInput
                          value={query}
                          onChangeText={setQuery}
                          placeholder="Search players or type a new name to add…"
                          autoCapitalize="words"
                          style={{
                            borderWidth: 1,
                            borderColor: '#E5E7EB',
                            backgroundColor: '#F9FAFB',
                            borderRadius: 12,
                            paddingHorizontal: 12,
                            paddingVertical: 10,
                          }}
                        />
                      </View>
                      <TouchableOpacity
                        onPress={() => addPlaceholder(query)}
                        disabled={!query.trim() || saving}
                        style={{
                          backgroundColor: query.trim() && !saving ? COLORS.brandPrimary : '#CBD5E1',
                          paddingHorizontal: 14,
                          paddingVertical: 12,
                          borderRadius: 12,
                        }}
                      >
                        {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800' }}>Add</Text>}
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Ring/Dares empty-state callouts */}
                  {ringHasAssignments === false && (
                    <View
                      style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: 16,
                        padding: 14,
                        borderWidth: 1,
                        borderColor: '#E5E7EB',
                        ...headerShadow,
                      }}
                    >
                      <Text style={{ fontSize: 16, fontWeight: '800', color: '#111827' }}>No ring yet</Text>
                      <Text style={{ marginTop: 6, color: '#6B7280' }}>Seed a ring to connect players in a single cycle.</Text>
                      <TouchableOpacity
                        onPress={() => router.push('/group/admin/assignments')}
                        style={{ marginTop: 10, backgroundColor: COLORS.brandPrimary, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 }}
                      >
                        <Text style={{ color: '#fff', fontWeight: '800' }}>Open assignments</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  {ringHasAssignments === true && hasAnyDare === false && (
                    <View
                      style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: 16,
                        padding: 14,
                        borderWidth: 1,
                        borderColor: '#E5E7EB',
                        ...headerShadow,
                      }}
                    >
                      <Text style={{ fontSize: 16, fontWeight: '800', color: '#111827' }}>No dares yet</Text>
                      <Text style={{ marginTop: 6, color: '#6B7280' }}>Add dare prompts for each assignment in the Dares tab.</Text>
                      <TouchableOpacity
                        onPress={() => router.push('/group/admin/assignments')}
                        style={{ marginTop: 10, backgroundColor: COLORS.brandPrimary, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 }}
                      >
                        <Text style={{ color: '#fff', fontWeight: '800' }}>Open assignments</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              }
              renderItem={({ item }) => (
                <View
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: 16,
                    padding: 14,
                    marginBottom: 12,
                    borderWidth: 1,
                    borderColor: '#E5E7EB',
                    shadowColor: '#000',
                    shadowOpacity: 0.04,
                    shadowRadius: 8,
                    shadowOffset: { width: 0, height: 4 },
                    elevation: 1,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                      <Avatar name={item.display_name} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: '800', color: '#111827' }} numberOfLines={1}>
                          {item.display_name}
                        </Text>
                        <View style={{ marginTop: 4, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                          <Chip label={item.is_active ? 'Active' : 'Removed'} tone={item.is_active ? 'success' : 'danger'} />
                        </View>
                      </View>
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      {item.is_active ? (
                        <TouchableOpacity
                          onPress={() => setActive(item.id, false)}
                          style={{ backgroundColor: COLORS.brandPrimary, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12 }}
                        >
                          <Text style={{ color: '#fff', fontWeight: '800' }}>Remove</Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          onPress={() => setActive(item.id, true)}
                          style={{ backgroundColor: '#16A34A', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12 }}
                        >
                          <Text style={{ color: '#fff', fontWeight: '800' }}>Restore</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        onPress={() => openOrCreateAdminConversation(item.id)}
                        disabled={openingChatPlayerId === item.id}
                        style={{
                          borderWidth: 1.5,
                          borderColor: COLORS.brandPrimary,
                          backgroundColor: '#FFFFFF',
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                          borderRadius: 12,
                          opacity: openingChatPlayerId === item.id ? 0.6 : 1,
                        }}
                      >
                        <Text style={{ color: COLORS.brandPrimary, fontWeight: '800' }}>Message</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}
              ListEmptyComponent={
                <View style={{ paddingVertical: 40, alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: '#111827' }}>No players yet</Text>
                  <Text style={{ color: '#6B7280', textAlign: 'center' }}>
                    Add a player above to kick things off.
                  </Text>
                </View>
              }
            />
          )}
        </View>
      )}
    />
  );
}
