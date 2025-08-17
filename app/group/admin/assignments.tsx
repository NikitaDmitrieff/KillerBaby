import CollapsibleHeader, { CollapsibleHeaderAccessory } from '../../../components/CollapsibleHeader';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Alert, TextInput, RefreshControl, Modal, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import RoleToggle from '../role-toggle';
import { useEffect, useMemo, useState } from 'react';
import { useGroupsStore } from '../../../state/groups';
import { supabase } from '../../../lib/supabase';

type EdgeRow = { assassin_player_id: string; assassin_name: string; target_player_id: string; target_name: string; dare_text: string };
type PlayerRow = { player_id: string; display_name: string };

type DareCardProps = { text: string; onEdit: () => void };

function DareCard({ text, onEdit }: DareCardProps) {
  return (
    <View style={{ backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, marginTop: 8 }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: '#6b7280' }}>Dare</Text>
      <Text style={{ marginTop: 6, color: '#111827' }}>{text?.trim() ? text : '—'}</Text>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
        <TouchableOpacity onPress={onEdit} style={{ backgroundColor: '#e5e7eb', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10 }}>
          <Text style={{ color: '#111827', fontWeight: '700' }}>Edit</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

type DareEditorModalProps = {
  visible: boolean;
  assassinName: string;
  value: string;
  onChangeValue: (t: string) => void;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
};

function DareEditorModal({ visible, assassinName, value, onChangeValue, onClose, onSave, saving }: DareEditorModalProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={{ backgroundColor: '#ffffff', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24, maxHeight: '85%' }}>
            <View style={{ height: 4, width: 40, alignSelf: 'center', backgroundColor: '#e5e7eb', borderRadius: 9999, marginBottom: 12 }} />
            <Text style={{ fontSize: 18, fontWeight: '800' }}>Edit dare for {assassinName}</Text>
            <Text style={{ color: '#6b7280', marginTop: 4 }}>Set the challenge they must complete to eliminate their target.</Text>
            <ScrollView style={{ marginTop: 12 }} keyboardShouldPersistTaps="handled">
              <TextInput
                value={value}
                onChangeText={onChangeValue}
                placeholder="Enter dare"
                multiline
                textAlignVertical="top"
                style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12, minHeight: 120 }}
              />
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity onPress={onClose} style={{ backgroundColor: '#e5e7eb', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10 }}>
                <Text style={{ color: '#111827', fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onSave} disabled={saving} style={{ backgroundColor: '#059669', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, opacity: saving ? 0.8 : 1 }}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#ffffff', fontWeight: '800' }}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

export default function AdminAssignmentsScreen() {
  const { id: groupId } = useGroupsStore();
  const [loading, setLoading] = useState(true);
  const [edges, setEdges] = useState<EdgeRow[]>([]);
  const [seeding, setSeeding] = useState(false);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [editingDareFor, setEditingDareFor] = useState<string | null>(null);
  const [dareDraftByAssassin, setDareDraftByAssassin] = useState<Record<string, string>>({});
  const [savingDareFor, setSavingDareFor] = useState<string | null>(null);
  const [ringEditMode, setRingEditMode] = useState(false);
  const [mappingByAssassin, setMappingByAssassin] = useState<Record<string, string>>({});
  const [savingRing, setSavingRing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [dareModalFor, setDareModalFor] = useState<{ assassinId: string; assassinName: string } | null>(null);

  async function loadRing() {
    if (!groupId) return;
    try {
      setLoading(true);
      // Fetch active assignments directly
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
      // Initialize drafts/mapping from current state
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
      // Simple order and wrap
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
    // No self targets
    for (const id of assassinIds) {
      if (mappingByAssassin[id] === id) return 'No one can target themselves.';
    }
    // All targets unique and a permutation of the participants
    const setTargets = new Set(selectedTargets);
    if (setTargets.size !== assassinIds.length) return 'Targets must be unique.';
    const participantSet = new Set(assassinIds);
    for (const t of setTargets) {
      if (!participantSet.has(t as string)) return 'Targets must be chosen among active players only.';
    }
    // Single cycle validation: ensure mapping forms one cycle over all participants
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
      // Use current edges order for determinism
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

  async function saveDare(assassinId: string) {
    if (!groupId) return;
    const newText = dareDraftByAssassin[assassinId] ?? '';
    try {
      setSavingDareFor(assassinId);
      await supabase.rpc('edit_active_dare', {
        p_group_id: groupId,
        p_assassin_player_id: assassinId,
        p_new_dare_text: newText,
      });
      setEditingDareFor(null);
      setDareModalFor(null);
      await loadRing();
    } catch (e: any) {
      Alert.alert('Update failed', e?.message ?? 'Could not update dare');
    } finally {
      setSavingDareFor(null);
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
                    onPress={loadRing}
                    style={{ backgroundColor: '#e5e7eb', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10 }}
                  >
                    <Text style={{ color: '#111827', fontWeight: '700' }}>Refresh</Text>
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
                <View style={{ backgroundColor: '#f9f9fb', borderRadius: 12, padding: 16, marginBottom: 12 }}>
                  <Text style={{ fontWeight: '800' }}>{item.assassin_name} → {item.target_name}</Text>
                  <View style={{ marginTop: 6 }}>
                    <DareCard
                      text={item.dare_text}
                      onEdit={() => {
                        setDareDraftByAssassin((prev) => ({ ...prev, [item.assassin_player_id]: prev[item.assassin_player_id] ?? item.dare_text }));
                        setDareModalFor({ assassinId: item.assassin_player_id, assassinName: item.assassin_name });
                      }}
                    />
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
                </View>
              )}
            />
          )}
        </View>
      )}
    />
    {dareModalFor && (
      <DareEditorModal
        visible={!!dareModalFor}
        assassinName={dareModalFor.assassinName}
        value={dareDraftByAssassin[dareModalFor.assassinId] ?? ''}
        onChangeValue={(t) => setDareDraftByAssassin((prev) => ({ ...prev, [dareModalFor.assassinId]: t }))}
        onClose={() => setDareModalFor(null)}
        saving={savingDareFor === dareModalFor.assassinId}
        onSave={() => saveDare(dareModalFor.assassinId)}
      />
    )}
  );
}


