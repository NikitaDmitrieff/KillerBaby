import CollapsibleHeader, { CollapsibleHeaderAccessory } from '../../../components/CollapsibleHeader';
import { View, Text, FlatList, ActivityIndicator, RefreshControl, StyleSheet } from 'react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import RoleToggle from '../role-toggle';
import { supabase } from '../../../lib/supabase';
import { useGroupsStore } from '../../../state/groups';
import { COLORS } from '../../../theme/colors';
import SubduedCountdown from '../../../components/SubduedCountdown';
import { Ionicons } from '@expo/vector-icons';

type FeedItem = {
  id: string;
  ts: string; // ISO
  kind: 'elimination' | 'join' | 'game_started' | 'game_ended';
  text: string;
};

export default function PlayerFeedScreen() {
  const groupId = useGroupsStore((s) => s.id);
  const groupName = useGroupsStore((s) => s.name);
  const playerId = useGroupsStore((s) => s.playerId);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const loadedForGroupRef = useRef<string | null>(null);
  const channelsRef = useRef<{ gp?: ReturnType<typeof supabase.channel>; asg?: ReturnType<typeof supabase.channel> } | null>(null);
  const groupChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Player status state
  const [statusLoading, setStatusLoading] = useState(false);
  const [isActive, setIsActive] = useState<boolean | null>(null);
  const [targetName, setTargetName] = useState<string>('—'); // kept for parity with backend but intentionally hidden
  const [dareText, setDareText] = useState<string>('—');
  const [activeCount, setActiveCount] = useState<number | null>(null);
  const [totalElims, setTotalElims] = useState<number | null>(null);
  const [myKills, setMyKills] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [endedAt, setEndedAt] = useState<string | null>(null);
  const [deadlineAt, setDeadlineAt] = useState<string | null>(null);

  const title = useMemo(() => 'Group Feed', []);
  const subtitle = useMemo(() => (groupName ? `${groupName} updates` : 'Eliminations and updates'), [groupName]);

  const mergeItems = useCallback((next: FeedItem[]) => {
    setItems((prev) => {
      const seen = new Set(prev.map((p) => `${p.kind}:${p.id}`));
      const merged = [...prev];
      for (const it of next) {
        const key = `${it.kind}:${it.id}`;
        if (!seen.has(key)) {
          merged.push(it);
          seen.add(key);
        }
      }
      merged.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
      return merged;
    });
  }, []);

  const loadInitial = useCallback(async () => {
    if (!groupId) return;
    setLoading(true);
    try {
      const [{ data: gpRows, error: gpErr }, { data: aRows, error: aErr }, { data: gRow, error: gErr }] = await Promise.all([
        supabase
          .from('group_players')
          .select('id, display_name, created_at')
          .eq('group_id', groupId)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('assignments')
          .select('id, dare_text, created_at, closed_at, reason_closed, replaced_by_assignment_id, assassin:assassin_player_id(id, display_name), target:target_player_id(id, display_name)')
          .eq('group_id', groupId)
          .not('closed_at', 'is', null)
          .neq('reason_closed', 'reseed')
          .order('closed_at', { ascending: false })
          .limit(50),
        supabase
          .from('groups')
          .select('id, started_at, ended_at, deadline_at')
          .eq('id', groupId)
          .maybeSingle(),
      ]);
      if (gpErr) throw gpErr;
      if (aErr) throw aErr;
      if (gErr) throw gErr;

      const joinItems: FeedItem[] = (gpRows ?? []).map((r: any) => ({
        id: r.id,
        ts: r.created_at,
        kind: 'join',
        text: `${r.display_name} joined the game`,
      }));

      const elimItems: FeedItem[] = (aRows ?? [])
        .filter((r: any) => !!r.closed_at && r.reason_closed !== 'reseed')
        .map((r: any) => ({
          id: r.id,
          ts: r.closed_at as string,
          kind: 'elimination' as const,
          text: `${r.assassin?.display_name ?? 'Someone'} eliminated ${r.target?.display_name ?? 'someone'} with “${r.dare_text ?? 'a dare'}”`,
        }));

      const metaItems: FeedItem[] = [];
      if (gRow?.started_at) metaItems.push({ id: `${groupId}-started-${gRow.started_at}`, ts: gRow.started_at, kind: 'game_started', text: 'Game started' });
      if (gRow?.ended_at) metaItems.push({ id: `${groupId}-ended-${gRow.ended_at}`, ts: gRow.ended_at, kind: 'game_ended', text: 'Game ended' });

      const next = [...joinItems, ...elimItems, ...metaItems].sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
      setItems(next);
      loadedForGroupRef.current = groupId;
      setStartedAt(gRow?.started_at ?? null);
      setEndedAt(gRow?.ended_at ?? null);
      setDeadlineAt(gRow?.deadline_at ?? null);
    } catch (e) {
      console.warn('[feed] loadInitial error', (e as any)?.message);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  const loadStatus = useCallback(async () => {
    if (!groupId) return;
    setStatusLoading(true);
    try {
      const tasks: Array<PromiseLike<any>> = [];
      tasks.push(supabase.rpc('get_active_players', { p_group_id: groupId }));
      if (playerId) {
        tasks.push(supabase.rpc('get_current_target', { p_group_id: groupId, p_assassin_player_id: playerId }));
        tasks.push(
          supabase
            .from('assignments')
            .select('id', { count: 'exact', head: true })
            .eq('group_id', groupId)
            .eq('assassin_player_id', playerId)
            .not('closed_at', 'is', null)
            .neq('reason_closed', 'reseed')
        );
      }
      tasks.push(
        supabase
          .from('assignments')
          .select('id', { count: 'exact', head: true })
          .eq('group_id', groupId)
          .not('closed_at', 'is', null)
          .neq('reason_closed', 'reseed')
      );

      const results = await Promise.all(tasks);
      const [activePlayersRes, ...rest] = results;
      const activePlayers = Array.isArray(activePlayersRes?.data) ? activePlayersRes.data : [];
      setActiveCount(activePlayers.length);
      if (playerId) {
        const userIsActive = activePlayers.some((r: any) => (r.id ?? r.player_id) === playerId);
        setIsActive(userIsActive);
      } else {
        setIsActive(null);
      }

      let restIdx = 0;
      if (playerId) {
        const targetRes = rest[restIdx++];
        const targetRow = Array.isArray(targetRes?.data) ? (targetRes.data[0] as any) : null;
        if (targetRow) {
          setTargetName((targetRow.display_name as string) ?? '—');
          setDareText((targetRow.dare_text as string) ?? '—');
        } else {
          setTargetName('—'); setDareText('—');
        }
        const myKillsRes = rest[restIdx++];
        setMyKills((myKillsRes?.count as number | null) ?? 0);
      }
      const totalElimsRes = rest[restIdx];
      setTotalElims((totalElimsRes?.count as number | null) ?? 0);
    } catch (e) {
      console.warn('[feed] loadStatus error', (e as any)?.message);
    } finally {
      setStatusLoading(false);
    }
  }, [groupId, playerId]);

  useEffect(() => {
    setItems([]);
    if (!groupId) return;
    loadInitial();
    loadStatus();
  }, [groupId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!groupId) return;
    if (channelsRef.current) {
      channelsRef.current.gp?.unsubscribe();
      channelsRef.current.asg?.unsubscribe();
    }
    if (groupChannelRef.current) {
      groupChannelRef.current.unsubscribe();
      groupChannelRef.current = null;
    }

    const gpChannel = supabase
      .channel(`grp-${groupId}-gp`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'group_players', filter: `group_id=eq.${groupId}` },
        (payload) => {
          const row: any = payload.new;
          const it: FeedItem = { id: row.id, ts: row.created_at, kind: 'join', text: `${row.display_name} joined the game` };
          mergeItems([it]);
        }
      )
      .subscribe();

    const asgChannel = supabase
      .channel(`grp-${groupId}-asg`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'assignments', filter: `group_id=eq.${groupId}` },
        async (payload) => {
          const row: any = payload.new;
          if (!row.closed_at) return;
          if (row.reason_closed === 'reseed') return;
          try {
            const { data, error } = await supabase
              .from('assignments')
              .select('id, closed_at, reason_closed, dare_text, assassin:assassin_player_id(display_name), target:target_player_id(display_name)')
              .eq('id', row.id)
              .maybeSingle();
            if (error || !data) return;
            if ((data as any).reason_closed === 'reseed') return;
            const extractName = (x: any): string | undefined => {
              if (!x) return undefined;
              return Array.isArray(x) ? x[0]?.display_name : x.display_name;
            };
            const assassinName = extractName((data as any).assassin) ?? 'Someone';
            const targetNameRt = extractName((data as any).target) ?? 'someone';
            const it: FeedItem = {
              id: data.id as string,
              ts: data.closed_at as string,
              kind: 'elimination',
              text: `${assassinName} eliminated ${targetNameRt} with “${(data as any).dare_text ?? 'a dare'}”`,
            };
            mergeItems([it]);
            loadStatus();
          } catch {}
        }
      )
      .subscribe();

    const grpChannel = supabase
      .channel(`grp-${groupId}-groups`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'groups', filter: `id=eq.${groupId}` },
        (payload) => {
          const row: any = payload.new;
          if (row.started_at) {
            mergeItems([{ id: `${groupId}-started-${row.started_at}`, ts: row.started_at, kind: 'game_started', text: 'Game started' }]);
            setStartedAt(row.started_at);
          }
          if (row.ended_at) {
            mergeItems([{ id: `${groupId}-ended-${row.ended_at}`, ts: row.ended_at, kind: 'game_ended', text: 'Game ended' }]);
            setEndedAt(row.ended_at);
          }
          if (typeof row.deadline_at !== 'undefined') {
            setDeadlineAt(row.deadline_at);
          }
        }
      )
      .subscribe();

    channelsRef.current = { gp: gpChannel, asg: asgChannel };
    groupChannelRef.current = grpChannel;
    return () => {
      gpChannel.unsubscribe();
      asgChannel.unsubscribe();
      grpChannel.unsubscribe();
    };
  }, [groupId]); // eslint-disable-line react-hooks/exhaustive-deps

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadInitial(), loadStatus()]);
    } finally {
      setRefreshing(false);
    }
  }, [loadInitial, loadStatus]);

  const iconFor = (kind: FeedItem['kind']) => {
    switch (kind) {
      case 'elimination': return { name: 'skull', tint: COLORS.brandPrimary, bg: '#fee2e2' };
      case 'join': return { name: 'person-add', tint: '#111827', bg: '#eef2ff' };
      case 'game_started': return { name: 'play', tint: '#065f46', bg: '#dcfce7' };
      case 'game_ended': return { name: 'flag', tint: '#6b7280', bg: '#f3f4f6' };
    }
  };

  const fmt = (iso: string) =>
    new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));

  return (
    <CollapsibleHeader
      title={title}
      subtitle={subtitle}
      isRefreshing={refreshing}
      renderRightAccessory={({ collapseProgress }) => (
        <CollapsibleHeaderAccessory collapseProgress={collapseProgress}>
          <RoleToggle />
        </CollapsibleHeaderAccessory>
      )}
      renderContent={({ contentInsetTop, onScroll, scrollRef }) => (
        <View style={{ flex: 1 }}>
          {!groupId ? (
            <View style={{ paddingTop: contentInsetTop, flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#6b7280' }}>Select a group to view its feed</Text>
            </View>
          ) : loading && items.length === 0 ? (
            <View style={{ paddingTop: contentInsetTop, flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator />
            </View>
          ) : (
            <FlatList
              ref={scrollRef as any}
              onScroll={onScroll}
              scrollEventThrottle={16}
              data={items}
              keyExtractor={(item) => `${item.kind}:${item.id}`}
              contentContainerStyle={{ paddingTop: contentInsetTop, paddingHorizontal: 16, paddingBottom: 100 }}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor={COLORS.brandPrimary}
                  colors={[COLORS.brandPrimary]}
                />
              }
              ListHeaderComponent={
                <View style={{ marginBottom: 16 }}>
                  {!!deadlineAt && (
                    <View style={{ marginBottom: 12 }}>
                      <SubduedCountdown until={new Date(deadlineAt).getTime()} label="DEADLINE" />
                      <Text style={{ color: '#9ca3af', fontSize: 12, marginTop: 6, textAlign: 'center' }}>
                        Ends {fmt(deadlineAt)}
                      </Text>
                    </View>
                  )}

                  <View
                    style={[
                      styles.statusCard,
                      isActive === false ? styles.statusCardEliminated : styles.statusCardActive,
                    ]}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View
                        style={[
                          styles.statusDot,
                          isActive === false ? { backgroundColor: '#ef4444' } : { backgroundColor: '#16a34a' },
                        ]}
                      />
                      <Text
                        style={[
                          styles.statusTitle,
                          isActive === false ? styles.statusTitleEliminated : styles.statusTitleActive,
                        ]}
                        numberOfLines={2}
                      >
                        {statusLoading
                          ? 'Checking status…'
                          : isActive == null
                          ? '—'
                          : isActive
                          ? 'You are still in the game'
                          : 'You have been eliminated'}
                      </Text>
                    </View>

                    {!!startedAt && !endedAt && (
                      <Text style={styles.statusSub}>Game started {fmt(startedAt)}</Text>
                    )}
                    {!!endedAt && <Text style={styles.statusSub}>Game ended {fmt(endedAt)}</Text>}
                  </View>

                  <View style={styles.statsRow}>
                    <View style={styles.statPill}>
                      <Text style={styles.statLabel}>Alive</Text>
                      <Text style={styles.statValue}>{activeCount ?? '—'}</Text>
                    </View>
                    <View style={styles.statPill}>
                      <Text style={styles.statLabel}>Eliminations</Text>
                      <Text style={styles.statValue}>{totalElims ?? '—'}</Text>
                    </View>
                    <View style={styles.statPill}>
                      <Text style={styles.statLabel}>Your Kills</Text>
                      <Text style={styles.statValue}>{myKills ?? '—'}</Text>
                    </View>
                  </View>

                  <Text style={styles.sectionHeader}>Recent Activity</Text>

                  {items.length === 0 && (
                    <View style={styles.emptyCard}>
                      <Text style={styles.emptyTitle}>No activity yet</Text>
                      <Text style={styles.emptySub}>When players join or get eliminated, updates will appear here.</Text>
                    </View>
                  )}
                </View>
              }
              renderItem={({ item, index }) => {
                const icon = iconFor(item.kind);
                return (
                  <View style={styles.itemRow}>
                    <View style={[styles.itemIconWrap, { backgroundColor: icon.bg }]}>
                      <Ionicons name={icon.name as any} size={16} color={icon.tint} />
                    </View>
                    <View style={styles.itemContent}>
                      <Text style={styles.itemText}>{item.text}</Text>
                      <Text style={styles.itemTs}>{fmt(item.ts)}</Text>
                    </View>
                  </View>
                );
              }}
            />
          )}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  statusCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statusCardActive: {
    backgroundColor: '#fff',
    borderColor: '#e5e7eb',
  },
  statusCardEliminated: {
    backgroundColor: '#fee2e2',
    borderColor: '#ef4444',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusTitle: {
    fontWeight: '800',
    fontSize: 18,
  },
  statusTitleActive: { color: '#111827' },
  statusTitleEliminated: { color: '#991b1b' },
  statusSub: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 6,
  },

  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  statPill: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
  },
  statLabel: { color: '#6b7280', fontSize: 12, fontWeight: '700' },
  statValue: { color: COLORS.brandPrimary, fontSize: 16, fontWeight: '800', marginTop: 2 },

  sectionHeader: {
    marginTop: 16,
    marginBottom: 8,
    color: '#6b7280',
    fontSize: 12,
    letterSpacing: 1.1,
    fontWeight: '700',
  },

  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
  },
  emptyTitle: { fontWeight: '800', color: '#111827' },
  emptySub: { color: '#6b7280', marginTop: 4, fontSize: 12 },

  itemRow: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
    marginBottom: 10,
    alignItems: 'center',
  },
  itemIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemContent: { flex: 1 },
  itemText: { color: '#111827', fontWeight: '600' },
  itemTs: { color: '#9ca3af', marginTop: 4, fontSize: 12 },
});