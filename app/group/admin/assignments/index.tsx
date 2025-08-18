import CollapsibleHeader from '../../../../components/CollapsibleHeader';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Alert, RefreshControl, Platform } from 'react-native';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import { useEffect, useMemo, useState } from 'react';
import { useGroupsStore } from '../../../../state/groups';
import { supabase } from '../../../../lib/supabase';
import { useRouter } from 'expo-router';
import { COLORS } from '../../../../theme/colors';
import Svg, { Circle as SvgCircle, Line as SvgLine, Path as SvgPath, Text as SvgText } from 'react-native-svg';

type EdgeRow = { assassin_player_id: string; assassin_name: string; target_player_id: string; target_name: string; dare_text: string };
type PlayerRow = { player_id: string; display_name: string };

const TABS = ['Dares', 'Ring'] as const;
type Tab = typeof TABS[number];

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

type RingVisualizerProps = {
  edges: EdgeRow[];
};

function RingVisualizer({ edges }: RingVisualizerProps) {
  const [size, setSize] = useState(0);
  const onLayout = (e: any) => {
    const w = e?.nativeEvent?.layout?.width ?? 0;
    if (w && w !== size) setSize(w);
  };

  const { orderedIds, nameById } = useMemo(() => {
    const map: Record<string, string> = {};
    const names = new Map<string, string>();
    for (const e of edges) {
      map[e.assassin_player_id] = e.target_player_id;
      names.set(e.assassin_player_id, e.assassin_name);
      names.set(e.target_player_id, e.target_name);
    }
    const ids = Object.keys(map);
    if (ids.length === 0) return { orderedIds: [] as string[], nameById: names };
    let start = ids[0];
    for (const id of ids) {
      const a = (names.get(id) || '').toLowerCase();
      const b = (names.get(start) || '').toLowerCase();
      if (a < b) start = id;
    }
    const visited = new Set<string>();
    const order: string[] = [];
    let cur: string | undefined = start;
    while (cur && !visited.has(cur) && order.length < ids.length) {
      order.push(cur);
      visited.add(cur);
      cur = map[cur];
    }
    if (order.length !== ids.length) {
      return { orderedIds: ids, nameById: names };
    }
    return { orderedIds: order, nameById: names };
  }, [edges]);

  const nodeRadius = Math.max(14, Math.min(20, Math.round((size / 320) * 16)));
  const margin = 24;
  const center = { x: size / 2, y: size / 2 };
  const radius = Math.max(0, (size / 2) - margin - nodeRadius);

  function getPoint(angleRad: number) {
    return {
      x: center.x + radius * Math.cos(angleRad),
      y: center.y + radius * Math.sin(angleRad),
    };
  }

  function getAngleForIndex(index: number, total: number) {
    const t = (index / total) * Math.PI * 2 - Math.PI / 2;
    return t;
  }

  function getArrowEnd(from: { x: number; y: number }, to: { x: number; y: number }) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    const ux = dx / len;
    const uy = dy / len;
    const end = { x: to.x - ux * (nodeRadius + 2), y: to.y - uy * (nodeRadius + 2) };
    return { end, ux, uy };
  }

  function arrowHeadPath(endX: number, endY: number, ux: number, uy: number) {
    const sizeAh = 8;
    const leftX = endX - ux * sizeAh + -uy * (sizeAh * 0.6);
    const leftY = endY - uy * sizeAh + ux * (sizeAh * 0.6);
    const rightX = endX - ux * sizeAh + uy * (sizeAh * 0.6);
    const rightY = endY - uy * sizeAh + -ux * (sizeAh * 0.6);
    return `M ${leftX} ${leftY} L ${endX} ${endY} L ${rightX} ${rightY}`;
  }

  return (
    <View style={{ width: '100%', aspectRatio: 1 }} onLayout={onLayout}>
      {size > 0 && (
        <Svg width={size} height={size}>
          {orderedIds.map((fromId, idx) => {
            const toId = edges.find((e) => e.assassin_player_id === fromId)?.target_player_id;
            if (!toId) return null;
            const total = orderedIds.length || 1;
            const fromPt = getPoint(getAngleForIndex(idx, total));
            const toIndex = orderedIds.indexOf(toId);
            const toPt = getPoint(getAngleForIndex(toIndex, total));
            const { end, ux, uy } = getArrowEnd(fromPt, toPt);
            return (
              <>
                <SvgLine key={`line-${fromId}`} x1={fromPt.x} y1={fromPt.y} x2={end.x} y2={end.y} stroke="#9d0208" strokeWidth={1.5} opacity={0.8} />
                <SvgPath key={`ah-${fromId}`} d={arrowHeadPath(end.x, end.y, ux, uy)} stroke="#9d0208" strokeWidth={1.5} fill="none" />
              </>
            );
          })}
          {orderedIds.map((id, idx) => {
            const total = orderedIds.length || 1;
            const p = getPoint(getAngleForIndex(idx, total));
            const name = nameById.get(id) || '?';
            const initials = getInitials(name);
            return (
              <>
                <SvgCircle key={`node-${id}`} cx={p.x} cy={p.y} r={nodeRadius} fill="#fde6e8" stroke="#9d0208" strokeWidth={2} />
                <SvgText key={`txt-${id}`} x={p.x} y={p.y + 4} fontSize={Math.max(10, Math.floor(nodeRadius * 0.9))} fontWeight="800" textAnchor="middle" fill="#9d0208">
                  {initials}
                </SvgText>
              </>
            );
          })}
        </Svg>
      )}
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
  const [deadPlayers, setDeadPlayers] = useState<PlayerRow[]>([]);
  const [ringEditMode, setRingEditMode] = useState(false);
  const [mappingByAssassin, setMappingByAssassin] = useState<Record<string, string>>({});
  const [dareDraftByAssassin, setDareDraftByAssassin] = useState<Record<string, string>>({});
  const [savingRing, setSavingRing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [addedAssassinIds, setAddedAssassinIds] = useState<string[]>([]);
  const [tabIndex, setTabIndex] = useState(0);
  const currentTab: Tab = TABS[tabIndex];
  const hasAnyDare = useMemo(() => edges.some((e) => (e.dare_text ?? '').trim().length > 0), [edges]);

  async function loadRing() {
    if (!groupId) return;
    try {
      setLoading(true);
      const [
        { data: assigns, error: assignsErr },
        { data: playersData, error: playersErr },
        { data: deadRows, error: deadErr },
      ] = await Promise.all([
        supabase
          .from('assignments')
          .select('assassin_player_id, target_player_id, dare_text')
          .eq('group_id', groupId)
          .eq('is_active', true),
        supabase.rpc('get_active_players', { p_group_id: groupId }),
        supabase
          .from('group_players')
          .select('id, display_name, is_dead')
          .eq('group_id', groupId)
          .eq('is_dead', true),
      ]);
      if (assignsErr) throw assignsErr;
      if (playersErr) throw playersErr;
      if (deadErr) throw deadErr;
      const playerRows: PlayerRow[] = (playersData ?? []).map((p: any) => ({
        player_id: p.player_id as string,
        display_name: (p.display_name as string) || '—',
      }));
      setPlayers(playerRows);
      const deadPlayerRows: PlayerRow[] = (deadRows ?? []).map((p: any) => ({
        player_id: p.id as string,
        display_name: (p.display_name as string) || '—',
      }));
      setDeadPlayers(deadPlayerRows);
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
      setAddedAssassinIds([]);
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
      const { data: tmplRows, error: tmplErr } = await supabase
        .from('dare_templates')
        .select('text')
        .eq('group_id', groupId)
        .eq('is_active', true);
      if (tmplErr) throw tmplErr;
      const templates: string[] = ((tmplRows as any[]) ?? [])
        .map((r) => (r?.text as string) || '')
        .filter((t) => !!t && t.trim().length > 0);
      const nameById = new Map<string, string>(((players as any[]) ?? []).map((p: any) => [p.player_id as string, (p.display_name as string) || '—']));
      function personalize(templateText: string, targetId: string): string {
        const name = nameById.get(targetId) || 'your target';
        try {
          return templateText.replace(/\byour target\b/gi, name);
        } catch {
          return templateText;
        }
      }
      const dares = assassins.map((assassinId: string, i: number) => {
        const targetId = targets[i];
        if (templates.length === 0) return 'Be creative!';
        const pick = templates[Math.floor(Math.random() * templates.length)];
        return personalize(pick, targetId);
      });
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

  function getParticipantIds(): string[] {
    const existing = edges.map((e) => e.assassin_player_id);
    const combined = Array.from(new Set([...existing, ...addedAssassinIds]));
    return combined;
  }

  function toggleAddParticipant(playerId: string) {
    setAddedAssassinIds((prev) => {
      if (prev.includes(playerId)) {
        return prev.filter((id) => id !== playerId);
      }
      setDareDraftByAssassin((d) => (d[playerId] ? d : { ...d, [playerId]: 'Be creative!' }));
      return [...prev, playerId];
    });
  }

  function getName(playerId: string): string {
    const p = players.find((pp) => pp.player_id === playerId) || deadPlayers.find((pp) => pp.player_id === playerId);
    return p?.display_name ?? '—';
  }

  function getParticipantOptions(): PlayerRow[] {
    const ids = getParticipantIds();
    const byId = new Map<string, string>();
    players.forEach((p) => byId.set(p.player_id, p.display_name));
    deadPlayers.forEach((p) => byId.set(p.player_id, p.display_name));
    return ids.map((id) => ({ player_id: id, display_name: byId.get(id) ?? '—' }));
  }

  function validateRingMapping(): string | null {
    const assassinIds = getParticipantIds();
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
      const assassins = getParticipantIds();
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

  const listData = edges; // Both tabs list assignments

  return (
    <CollapsibleHeader
      title={"Assignments"}
      subtitle={"Who hunts whom, and dares"}
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
              data={listData}
              keyExtractor={(i) => `${i.assassin_player_id}-${i.target_player_id}`}
              contentContainerStyle={{ paddingTop: contentInsetTop, paddingHorizontal: 16, paddingBottom: 100 }}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor={COLORS.brandPrimary}
                  colors={[COLORS.brandPrimary]}
                />
              }
              ListHeaderComponent={(
                <View style={{ gap: 12, marginBottom: 12 }}>
                  {/* Toggle */}
                  <View
                    style={{
                      backgroundColor: '#ffffff',
                      borderWidth: 1,
                      borderColor: '#e5e7eb',
                      borderRadius: 12,
                      padding: 12,
                      shadowColor: '#000',
                      shadowOpacity: 0.06,
                      shadowRadius: 8,
                      shadowOffset: { width: 0, height: 4 },
                      elevation: 2,
                    }}
                  >
                    <SegmentedControl
                      values={[...TABS]}
                      selectedIndex={tabIndex}
                      onChange={(event) => setTabIndex(event.nativeEvent.selectedSegmentIndex)}
                      appearance="dark"
                      tintColor={COLORS.brandPrimary}
                      backgroundColor={Platform.OS === 'ios' ? '#f3f4f6' : undefined}
                      fontStyle={{ fontWeight: '600' }}
                      activeFontStyle={{ fontWeight: '800' }}
                    />
                  </View>

                  {/* Ring diagram or top-level empty state */}
                  {currentTab === 'Ring' && (
                    edges.length === 0 ? (
                      <View
                        style={{
                          backgroundColor: '#FFFFFF',
                          borderWidth: 1,
                          borderColor: '#E5E7EB',
                          borderRadius: 12,
                          padding: 12,
                          shadowColor: '#000',
                          shadowOpacity: 0.04,
                          shadowRadius: 8,
                          shadowOffset: { width: 0, height: 4 },
                        }}
                      >
                        <Text style={{ fontSize: 16, fontWeight: '800', color: '#111827' }}>No ring yet</Text>
                        <Text style={{ marginTop: 6, color: '#6B7280' }}>
                          Generate a ring to connect players in a single cycle.
                        </Text>
                        <TouchableOpacity
                          onPress={handleSeed}
                          disabled={seeding}
                          style={{
                            marginTop: 10,
                            backgroundColor: seeding ? '#CBD5E1' : COLORS.brandPrimary,
                            paddingHorizontal: 14,
                            paddingVertical: 10,
                            borderRadius: 12,
                            shadowColor: '#000',
                            shadowOpacity: 0.06,
                            shadowRadius: 6,
                            shadowOffset: { width: 0, height: 3 },
                            elevation: 2,
                          }}
                        >
                          {seeding ? (
                            <ActivityIndicator color="#fff" />
                          ) : (
                            <Text style={{ color: '#fff', fontWeight: '800' }}>Generate ring & dares</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={{ marginTop: 4 }}>
                        <RingVisualizer edges={edges} />
                      </View>
                    )
                  )}

                  {/* Ring controls */}
                  {currentTab === 'Ring' && edges.length > 0 && (
                    <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                      <TouchableOpacity
                        onPress={handleSeed}
                        disabled={seeding}
                        style={{
                          backgroundColor: seeding ? '#CBD5E1' : COLORS.brandPrimary,
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                          borderRadius: 10,
                          shadowColor: '#000',
                          shadowOpacity: 0.06,
                          shadowRadius: 6,
                          shadowOffset: { width: 0, height: 3 },
                          elevation: 2,
                        }}
                      >
                        {seeding ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Generate ring & dares</Text>}
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={toggleRingEditMode}
                        style={{
                          backgroundColor: ringEditMode ? '#f3f4f6' : '#ffffff',
                          borderWidth: 1,
                          borderColor: ringEditMode ? '#9ca3af' : '#e5e7eb',
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                          borderRadius: 10,
                          shadowColor: '#000',
                          shadowOpacity: 0.06,
                          shadowRadius: 6,
                          shadowOffset: { width: 0, height: 3 },
                          elevation: 2,
                        }}
                      >
                        <Text style={{ color: '#111827', fontWeight: '700' }}>
                          {ringEditMode ? '✕' : 'Edit ring'}
                        </Text>
                      </TouchableOpacity>
                      {ringEditMode && (
                        <TouchableOpacity
                          onPress={saveRingChanges}
                          disabled={savingRing}
                          style={{
                            backgroundColor: savingRing ? '#CBD5E1' : COLORS.brandPrimary,
                            paddingHorizontal: 12,
                            paddingVertical: 10,
                            borderRadius: 10,
                            shadowColor: '#000',
                            shadowOpacity: 0.06,
                            shadowRadius: 6,
                            shadowOffset: { width: 0, height: 3 },
                            elevation: 2,
                          }}
                        >
                          {savingRing ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>✓</Text>}
                        </TouchableOpacity>
                      )}
                      {ringEditMode && (
                        <View style={{ width: '100%' }}>
                          <View style={{ backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12 }}>
                            <Text style={{ fontSize: 12, fontWeight: '700', color: '#6b7280' }}>Add players to ring</Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                              {deadPlayers
                                .filter((p) => !edges.some((e) => e.assassin_player_id === p.player_id) && !addedAssassinIds.includes(p.player_id))
                                .map((p) => (
                                  <TouchableOpacity
                                    key={`add-${p.player_id}`}
                                    onPress={() => toggleAddParticipant(p.player_id)}
                                    style={{ backgroundColor: '#f3f4f6', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 9999 }}
                                  >
                                    <Text style={{ color: '#111827', fontWeight: '600' }}>{p.display_name}</Text>
                                  </TouchableOpacity>
                                ))}
                              {addedAssassinIds.map((id) => {
                                const name = getName(id);
                                return (
                                  <TouchableOpacity
                                    key={`added-${id}`}
                                    onPress={() => toggleAddParticipant(id)}
                                    style={{ backgroundColor: '#1d4ed8', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 9999 }}
                                  >
                                    <Text style={{ color: '#fff', fontWeight: '700' }}>Added: {name} ✕</Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          </View>
                        </View>
                      )}
                    </View>
                  )}

                  {/* Dares tab callout when there are assignments but no dare texts yet */}
                  {currentTab === 'Dares' && edges.length > 0 && !hasAnyDare && (
                    <View
                      style={{
                        backgroundColor: '#FFFFFF',
                        borderWidth: 1,
                        borderColor: '#E5E7EB',
                        borderRadius: 12,
                        padding: 12,
                        shadowColor: '#000',
                        shadowOpacity: 0.04,
                        shadowRadius: 8,
                        shadowOffset: { width: 0, height: 4 },
                      }}
                    >
                      <Text style={{ fontSize: 16, fontWeight: '800', color: '#111827' }}>No dares yet</Text>
                      <Text style={{ marginTop: 6, color: '#6B7280' }}>
                        Add dare prompts for each assignment. Tap an assignment below to start.
                      </Text>
                    </View>
                  )}
                </View>
              )}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => router.push(`/group/admin/assignments/dare/${item.assassin_player_id}`)}
                  activeOpacity={0.8}
                  style={{ backgroundColor: '#f9f9fb', borderRadius: 12, padding: 16, marginBottom: 12 }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ fontWeight: '800' }}>{item.assassin_name} → {item.target_name}</Text>
                    <AvatarStack names={[item.target_name, item.assassin_name]} />
                  </View>
                  <View style={{ marginTop: 6 }}>
                    <DareCard text={item.dare_text} />
                  </View>

                  {currentTab === 'Ring' && ringEditMode && (
                    <View style={{ marginTop: 12 }}>
                      <Text style={{ fontWeight: '700', marginBottom: 6 }}>Select target for {item.assassin_name}</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {getParticipantOptions().map((p) => {
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
              ListEmptyComponent={(
                <View style={{ paddingVertical: 40, alignItems: 'center', gap: 8 }}>
                  {currentTab === 'Dares' ? (
                    <>
                      <Text style={{ fontSize: 18, fontWeight: '800', color: '#111827' }}>No dares yet</Text>
                      <Text style={{ color: '#6B7280', textAlign: 'center' }}>
                        Generate a ring to create assignments and start adding dares.
                      </Text>
                      <TouchableOpacity
                        onPress={handleSeed}
                        disabled={seeding}
                        style={{
                          marginTop: 10,
                          backgroundColor: seeding ? '#CBD5E1' : COLORS.brandPrimary,
                          paddingHorizontal: 14,
                          paddingVertical: 10,
                          borderRadius: 12,
                          shadowColor: '#000',
                          shadowOpacity: 0.06,
                          shadowRadius: 6,
                          shadowOffset: { width: 0, height: 3 },
                          elevation: 2,
                        }}
                      >
                        {seeding ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <Text style={{ color: '#fff', fontWeight: '800' }}>Generate ring & dares</Text>
                        )}
                      </TouchableOpacity>
                    </>
                  ) : null}
                </View>
              )}
              ListFooterComponent={(
                <View style={{ gap: 8 }}>
                  {currentTab === 'Ring' && ringEditMode && addedAssassinIds.length > 0 && (
                    <View style={{ backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#6b7280' }}>Targets for added players</Text>
                      {addedAssassinIds.map((id) => {
                        const name = getName(id);
                        return (
                          <View key={`added-assassin-${id}`} style={{ marginTop: 10 }}>
                            <Text style={{ fontWeight: '700', marginBottom: 6 }}>Select target for {name}</Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                              {getParticipantOptions().map((p) => {
                                const isSelected = mappingByAssassin[id] === p.player_id;
                                const isSelf = p.player_id === id;
                                return (
                                  <TouchableOpacity
                                    key={`${id}-${p.player_id}`}
                                    onPress={() => setTargetForAssassin(id, p.player_id)}
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
                        );
                      })}
                    </View>
                  )}
                </View>
              )}
            />
          )}
        </View>
      )}
    />
  );
}
