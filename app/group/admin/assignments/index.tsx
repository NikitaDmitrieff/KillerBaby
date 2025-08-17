import CollapsibleHeader, { CollapsibleHeaderAccessory } from '../../../../components/CollapsibleHeader';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import RoleToggle from '../../role-toggle';
import { useEffect, useMemo, useState } from 'react';
import { useGroupsStore } from '../../../../state/groups';
import { supabase } from '../../../../lib/supabase';
import { useRouter } from 'expo-router';

type EdgeRow = { assassin_player_id: string; assassin_name: string; target_player_id: string; target_name: string; dare_text: string };
type PlayerRow = { player_id: string; display_name: string };

function getInitials(name: string | undefined | null) {
  const safe = (name ?? '').trim();
  if (!safe) return '?';
  const parts = safe.split(/\s+/).filter(Boolean);
  const initials = parts.map((p) => p[0] || '').join('').slice(0, 2).toUpperCase();
  return initials || '?';
}

function Avatar({ name, size = 28 }: { name: string; size?: number }) {
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
      <Text style={{ fontSize: Math.max(10, Math.floor(size * 0.42)), fontWeight: '800', color: '#111827' }}>{initials}</Text>
    </View>
  );
}

function AvatarStack({ names, size = 28, max = 5 }: { names: string[]; size?: number; max?: number }) {
  const shown = names.slice(0, max);
  const overflow = Math.max(0, names.length - shown.length);
  return (
    <View style={{ flexDirection: 'row-reverse' }}>
      {overflow > 0 ? (
        <View style={{ marginLeft: -8 }}>
          <View
            style={{
              width: size,
              height: size,
              borderRadius: 999,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#e5e7eb',
              borderWidth: 2,
              borderColor: '#ffffff',
            }}
          >
            <Text style={{ fontSize: Math.max(10, Math.floor(size * 0.38)), fontWeight: '800', color: '#374151' }}>+{overflow}</Text>
          </View>
        </View>
      ) : null}
      {shown.map((n, idx) => (
        <View key={`${n}-${idx}`} style={{ marginLeft: -8 }}>
          <Avatar name={n} size={size} />
        </View>
      ))}
    </View>
  );
}

type DareCardProps = { text: string };

function DareCard({ text }: DareCardProps) {
  return (
    <View style={{ backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, marginTop: 8 }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: '#6b7280' }}>Dare</Text>
      <Text numberOfLines={3} style={{ marginTop: 6, color: '#111827' }}>{text?.trim() ? text : '—'}</Text>
    </View>
  );
}

export default function AdminAssignmentsScreen() {
  const router = useRouter();
  const { id: groupId } = useGroupsStore();
  const [loading, setLoading] = useState(true);
  const [edges, setEdges] = useState<EdgeRow[]>([]);
  const [seeding, setSeeding] = useState(false);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [ringEditMode, setRingEditMode] = useState(false);
  const [mappingByAssassin, setMappingByAssassin] = useState<Record<string, string>>({});
  const [dareDraftByAssassin, setDareDraftByAssassin] = useState<Record<string, string>>({});
  const [savingRing, setSavingRing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  async function loadRing() {
    if (!groupId) return;
    try {
      setLoading(true);
      const [{ data: assigns, error: assignsErr }, { data: playersData, error: playersErr }] = await Promise.all([
        supabase
          .from('assignments')
          .select('assassin_player_id, target_player_id, dare_text')
          .eq('group_id', groupId)
          .eq('is_active', true),
        supabase.rpc('get_active_players', { p_group_id: groupId }),
      ]);
      if (assignsErr) throw assignsErr;
      if (playersErr) throw playersErr;
      const playerRows: PlayerRow[] = (playersData ?? []).map((p: any) => ({
        player_id: p.player_id as string,
        display_name: (p.display_name as string) || '—',
      }));
      setPlayers(playerRows);
      const nameById = new Map<string, string>(playerRows.map((p) => [p.player_id, p.display_name]));
      const rows: EdgeRow[] = (assigns ?? []).map((r: any) => ({
        assassin_player_id: r.assassin_player_id as string,
        assassin_name: nameById.get(r.assassin_player_id as string) || '—',
        target_player_id: r.target_player_id as string,
        target_name: nameById.get(r.target_player_id as string) || '—',
        dare_text: r.dare_text as string,
      }));
      setEdges(rows);
      const nextDrafts: Record<string, string> = {};
      const nextMap: Record<string, string> = {};
      rows.forEach((e) => {
        nextDrafts[e.assassin_player_id] = e.dare_text;
        nextMap[e.assassin_player_id] = e.target_player_id;
      });
      setDareDraftByAssassin(nextDrafts);
      setMappingByAssassin(nextMap);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to load assignments');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRing();
  }, [groupId]);

  async function handleSeed() {
    if (!groupId) return;
    try {
      setSeeding(true);
      const { data: players } = await supabase.rpc('get_active_players', { p_group_id: groupId });
      const ids = (players ?? []).map((p: any) => p.player_id as string);
      if (ids.length < 2) {
        Alert.alert('Need at least 2 players', 'Add more players to seed a ring.');
        return;
      }
      const assassins = ids;
      const targets = ids.slice(1).concat(ids.slice(0, 1));
      const dares = ids.map(() => 'Be creative!');
      const { error } = await supabase.rpc('reseed_active_ring', {
        p_group_id: groupId,
        p_assassins: assassins,
        p_targets: targets,
        p_dares: dares,
        p_created_by_profile_id: null,
      });
      if (error) throw error;
      const { data: isValid, error: assertErr } = await supabase.rpc('assert_perfect_ring', { p_group_id: groupId });
      if (assertErr) throw assertErr;
      if (!isValid) {
        Alert.alert('Ring check', 'Ring is NOT valid after seeding.');
      }
      await loadRing();
    } catch (e: any) {
      Alert.alert('Seed failed', e?.message ?? 'Could not start game');
    } finally {
      setSeeding(false);
    }
  }

  function toggleRingEditMode() {
    setRingEditMode((v) => !v);
  }

  function setTargetForAssassin(assassinId: string, targetId: string) {
    setMappingByAssassin((prev) => ({ ...prev, [assassinId]: targetId }));
  }

  function validateRingMapping(): string | null {
    const assassinIds = edges.map((e) => e.assassin_player_id);
    const selectedTargets = assassinIds.map((id) => mappingByAssassin[id]);
    if (selectedTargets.some((t) => !t)) return 'Each assassin must have a target.';
    for (const id of assassinIds) {
      if (mappingByAssassin[id] === id) return 'No one can target themselves.';
    }
    const setTargets = new Set(selectedTargets);
    if (setTargets.size !== assassinIds.length) return 'Targets must be unique.';
    const participantSet = new Set(assassinIds);
    for (const t of setTargets) {
      if (!participantSet.has(t as string)) return 'Targets must be chosen among active players only.';
    }
    const visited = new Set<string>();
    let current = assassinIds[0];
    for (let i = 0; i < assassinIds.length; i++) {
      if (visited.has(current)) break;
      visited.add(current);
      current = mappingByAssassin[current];
      if (!current) return 'Invalid mapping: missing target for some assassin.';
    }
    if (visited.size !== assassinIds.length || current !== assassinIds[0]) {
      return 'Ring must be a single cycle including all participants.';
    }
    return null;
  }

  async function saveRingChanges() {
    if (!groupId) return;
    const errorMsg = validateRingMapping();
    if (errorMsg) {
      Alert.alert('Invalid ring', errorMsg);
      return;
    }
    try {
      setSavingRing(true);
      const assassins = edges.map((e) => e.assassin_player_id);
      const targets = assassins.map((id) => mappingByAssassin[id]);
      const dares = assassins.map((id) => dareDraftByAssassin[id] ?? '');
      const { error } = await supabase.rpc('reseed_active_ring', {
        p_group_id: groupId,
        p_assassins: assassins,
        p_targets: targets,
        p_dares: dares,
        p_created_by_profile_id: null,
      });
      if (error) throw error;
      const { data: isValid, error: assertErr } = await supabase.rpc('assert_perfect_ring', { p_group_id: groupId });
      if (assertErr) throw assertErr;
      if (!isValid) {
        Alert.alert('Ring check', 'Ring is NOT valid after applying changes.');
      }
      setRingEditMode(false);
      await loadRing();
    } catch (e: any) {
      Alert.alert('Save failed', e?.message ?? 'Could not apply ring changes');
    } finally {
      setSavingRing(false);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    try {
      await loadRing();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <CollapsibleHeader
      title={"Assignments"}
      subtitle={"Who hunts whom, and dares"}
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
              data={edges}
              keyExtractor={(i) => `${i.assassin_player_id}-${i.target_player_id}`}
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
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                  <TouchableOpacity
                    onPress={handleSeed}
                    disabled={seeding}
                    style={{ backgroundColor: '#9d0208', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10 }}
                  >
                    {seeding ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Seed ring</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={toggleRingEditMode}
                    style={{ backgroundColor: ringEditMode ? '#1d4ed8' : '#e5e7eb', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10 }}
                  >
                    <Text style={{ color: ringEditMode ? '#fff' : '#111827', fontWeight: '700' }}>{ringEditMode ? 'Editing ring' : 'Edit ring'}</Text>
                  </TouchableOpacity>
                  {ringEditMode && (
                    <TouchableOpacity
                      onPress={saveRingChanges}
                      disabled={savingRing}
                      style={{ backgroundColor: '#059669', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10 }}
                    >
                      {savingRing ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Save ring</Text>}
                    </TouchableOpacity>
                  )}
                </View>
              )}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => router.push(`/group/admin/assignments/dare/${item.assassin_player_id}`)}
                  activeOpacity={0.8}
                  disabled={ringEditMode}
                  style={{ backgroundColor: '#f9f9fb', borderRadius: 12, padding: 16, marginBottom: 12 }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ fontWeight: '800' }}>{item.assassin_name} → {item.target_name}</Text>
                    <AvatarStack names={[item.target_name, item.assassin_name]} />
                  </View>
                  <View style={{ marginTop: 6 }}>
                    <DareCard text={item.dare_text} />
                  </View>

                  {ringEditMode && (
                    <View style={{ marginTop: 12 }}>
                      <Text style={{ fontWeight: '700', marginBottom: 6 }}>Select target for {item.assassin_name}</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {players.map((p) => {
                          const isSelected = mappingByAssassin[item.assassin_player_id] === p.player_id;
                          const isSelf = p.player_id === item.assassin_player_id;
                          return (
                            <TouchableOpacity
                              key={`${item.assassin_player_id}-${p.player_id}`}
                              onPress={() => setTargetForAssassin(item.assassin_player_id, p.player_id)}
                              disabled={isSelf}
                              style={{
                                backgroundColor: isSelected ? '#1d4ed8' : '#f3f4f6',
                                paddingHorizontal: 10,
                                paddingVertical: 8,
                                borderRadius: 9999,
                                opacity: isSelf ? 0.5 : 1,
                              }}
                            >
                              <Text style={{ color: isSelected ? '#fff' : '#111827', fontWeight: '600' }}>{p.display_name}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  )}
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      )}
    />
  );
}


