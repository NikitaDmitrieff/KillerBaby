import CollapsibleHeader, { CollapsibleHeaderAccessory } from '../../../components/CollapsibleHeader';
import { View, Text, FlatList, TextInput, TouchableOpacity, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import RoleToggle from '../role-toggle';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useGroupsStore } from '../../../state/groups';
import { useRouter } from 'expo-router';

type PlayerItem = { id: string; display_name: string; is_active: boolean };

export default function AdminPlayersScreen() {
  const { id: groupId } = useGroupsStore();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [players, setPlayers] = useState<PlayerItem[]>([]);
  const [query, setQuery] = useState('');
  const [gameStatus, setGameStatus] = useState<string | null>(null);
  const [userProfileId, setUserProfileId] = useState<string | null>(null);
  const [checkingIntegrity, setCheckingIntegrity] = useState(false);
  const [ringIsValid, setRingIsValid] = useState<boolean | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [openingChatPlayerId, setOpeningChatPlayerId] = useState<string | null>(null);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return players;
    return players.filter((p) => p.display_name.toLowerCase().includes(q));
  }, [players, query]);

  async function loadPlayers() {
    if (!groupId) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('group_players')
        .select('id, display_name, is_active')
        .eq('group_id', groupId)
        .order('display_name', { ascending: true });
      if (error) throw error;
      setPlayers((data ?? []).map((r: any) => ({ id: r.id as string, display_name: (r.display_name as string) || '—', is_active: !!r.is_active })));
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
    async function hydrateContext() {
      if (!groupId) return;
      try {
        // Load current user profile id (assumes profiles.id == auth.user.id)
        const { data: userRes } = await supabase.auth.getUser();
        setUserProfileId(userRes.user?.id ?? null);

        // Load group game status to decide ring operations
        const { data: group, error: gErr } = await supabase
          .from('groups')
          .select('game_status')
          .eq('id', groupId)
          .single();
        if (gErr) throw gErr;
        setGameStatus((group as any)?.game_status ?? null);
      } catch (e: any) {
        // Non-fatal; UI will still work with conservative behavior
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
      const { error } = await supabase
        .from('group_players')
        .insert({ group_id: groupId, display_name });
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
        // Deactivate / Remove
        if (gameStatus === 'active') {
          // Rewire the ring first to keep it valid
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
        // Reflect membership state
        const { error: updErr } = await supabase
          .from('group_players')
          .update({ is_active: false, removed_at: new Date().toISOString() })
          .eq('id', playerId);
        if (updErr) throw updErr;
      } else {
        // Restore
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
      // Ensure we have the current admin profile id
      let adminProfileId = userProfileId;
      if (!adminProfileId) {
        const { data } = await supabase.auth.getUser();
        adminProfileId = data?.user?.id ?? null;
        if (adminProfileId) setUserProfileId(adminProfileId);
      }
      if (!adminProfileId) {
        throw new Error('Missing admin profile. Please re-login and try again.');
      }
      // Try to find existing admin conversation with this player
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

  return (
    <CollapsibleHeader
      title={"Players"}
      subtitle={"Statuses and progression"}
      isRefreshing={refreshing}
      renderRightAccessory={({ collapseProgress }) => (
        <CollapsibleHeaderAccessory collapseProgress={collapseProgress}>
          <RoleToggle />
        </CollapsibleHeaderAccessory>
      )}
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
              contentContainerStyle={{ paddingTop: contentInsetTop, paddingHorizontal: 16, paddingBottom: 100 }}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor="#9d0208"
                  colors={["#9d0208"]}
                />
              }
              ListHeaderComponent={(
                <View style={{ gap: 10, marginBottom: 12 }}>
                  <View style={{ backgroundColor: '#eef2ff', borderRadius: 12, padding: 12 }}>
                    <Text style={{ fontWeight: '700', color: '#111827' }}>Game status: {gameStatus ?? '—'}</Text>
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                      <TouchableOpacity
                        onPress={assertRing}
                        disabled={checkingIntegrity || !groupId}
                        style={{ backgroundColor: checkingIntegrity ? '#cbd5e1' : '#111827', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}
                      >
                        {checkingIntegrity ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <Text style={{ color: '#fff', fontWeight: '700' }}>Check ring</Text>
                        )}
                      </TouchableOpacity>
                      {ringIsValid != null && (
                        <View style={{ backgroundColor: ringIsValid ? '#dcfce7' : '#fee2e2', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 }}>
                          <Text style={{ color: ringIsValid ? '#166534' : '#991b1b', fontWeight: '700' }}>
                            {ringIsValid ? 'Ring valid' : 'Ring invalid'}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Add placeholder name"
                    autoCapitalize="words"
                    style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}
                  />
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity
                      onPress={() => addPlaceholder(query)}
                      disabled={!query.trim() || saving}
                      style={{ backgroundColor: query.trim() && !saving ? '#111827' : '#cbd5e1', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10 }}
                    >
                      {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Add</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              renderItem={({ item }) => (
                <View style={{ backgroundColor: '#f9f9fb', borderRadius: 12, padding: 16, marginBottom: 12 }}>
                  <Text style={{ fontWeight: '800' }}>{item.display_name}</Text>
                  <Text style={{ color: '#6b7280', marginTop: 4 }}>Status: {item.is_active ? 'Active' : 'Removed'}</Text>
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                    {item.is_active ? (
                      <TouchableOpacity
                        onPress={() => setActive(item.id, false)}
                        style={{ backgroundColor: '#9d0208', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}
                      >
                        <Text style={{ color: '#fff', fontWeight: '700' }}>Remove</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        onPress={() => setActive(item.id, true)}
                        style={{ backgroundColor: '#16a34a', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}
                      >
                        <Text style={{ color: '#fff', fontWeight: '700' }}>Restore</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      onPress={() => openOrCreateAdminConversation(item.id)}
                      disabled={openingChatPlayerId === item.id}
                      style={{ backgroundColor: '#111827', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, opacity: openingChatPlayerId === item.id ? 0.6 : 1 }}
                    >
                      <Text style={{ color: '#fff', fontWeight: '700' }}>Message</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            />
          )}
        </View>
      )}
    />
  );
}


