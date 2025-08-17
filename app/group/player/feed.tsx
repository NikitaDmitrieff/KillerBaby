import CollapsibleHeader, { CollapsibleHeaderAccessory } from '../../../components/CollapsibleHeader';
import { View, Text, FlatList, ActivityIndicator, RefreshControl, StyleSheet } from 'react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import RoleToggle from '../role-toggle';
import { supabase } from '../../../lib/supabase';
import { useGroupsStore } from '../../../state/groups';
import { COLORS } from '../../../theme/colors';

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
  const [targetName, setTargetName] = useState<string>('—');
  // Hunter is intentionally hidden from the player
  const [dareText, setDareText] = useState<string>('—');
  const [activeCount, setActiveCount] = useState<number | null>(null);
  const [totalElims, setTotalElims] = useState<number | null>(null);
  const [myKills, setMyKills] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [endedAt, setEndedAt] = useState<string | null>(null);

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
      // Fetch latest membership joins
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
          .select('id, started_at, ended_at')
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
      // Active players list
      tasks.push(supabase.rpc('get_active_players', { p_group_id: groupId }));
      // Current target
      if (playerId) {
        tasks.push(
          supabase.rpc('get_current_target', { p_group_id: groupId, p_assassin_player_id: playerId })
        );
        // My kills count
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
      // Total eliminations
      tasks.push(
        supabase
          .from('assignments')
          .select('id', { count: 'exact', head: true })
          .eq('group_id', groupId)
          .not('closed_at', 'is', null)
          .neq('reason_closed', 'reseed')
      );

      const results = await Promise.all(tasks);

      // Unpack
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
          setTargetName('—');
          setDareText('—');
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

  // Initial load when group switches
  useEffect(() => {
    setItems([]);
    if (!groupId) return;
    loadInitial();
    loadStatus();
  }, [groupId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime subscriptions
  useEffect(() => {
    if (!groupId) return;
    // Cleanup any existing channels
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
          // Only consider transitions to closed (elimination)
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
            // Refresh status-derived counts quickly
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
                  tintColor="#9d0208"
                  colors={["#9d0208"]}
                />
              }
              ListHeaderComponent={
                <View style={{ marginBottom: 16 }}>
                  <View
                    style={[
                      styles.statusCard,
                      isActive === false ? styles.statusCardEliminated : styles.statusCardActive,
                    ]}
                  >
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
                    {!!startedAt && !endedAt && (
                      <Text style={styles.statusSub}>Game started {new Date(startedAt).toLocaleString()}</Text>
                    )}
                    {!!endedAt && (
                      <Text style={styles.statusSub}>Game ended {new Date(endedAt).toLocaleString()}</Text>
                    )}
                  </View>

                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                    <View style={styles.cardHalf}>
                      <Text style={styles.cardTitle}>Your Target</Text>
                      <Text style={styles.cardBody} numberOfLines={1}>{statusLoading ? '—' : targetName}</Text>
                      <Text style={styles.cardBodyMuted} numberOfLines={2}>{statusLoading ? '' : (dareText !== '—' ? `“${dareText}”` : '')}</Text>
                    </View>
                  </View>

                  <View style={styles.statsRow}>
                    <View style={styles.statPill}>
                      <Text style={styles.statLabel}>Active</Text>
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
                </View>
              }
              renderItem={({ item }) => (
                <View style={{ backgroundColor: '#f9f9fb', borderRadius: 12, padding: 16, marginBottom: 12 }}>
                  <Text style={{ color: '#374151' }}>{item.text}</Text>
                  <Text style={{ color: '#9ca3af', marginTop: 6, fontSize: 12 }}>{new Date(item.ts).toLocaleString()}</Text>
                </View>
              )}
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
  statusTitle: {
    fontWeight: '800',
    fontSize: 18,
  },
  statusTitleActive: {
    color: '#111827',
  },
  statusTitleEliminated: {
    color: '#991b1b',
  },
  statusSub: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 4,
  },
  heroCard: {
    borderRadius: 16,
    padding: 16,
  },
  heroIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ffffff33',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroLabel: {
    color: '#ffffffcc',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  heroTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    marginTop: 2,
  },
  heroSub: {
    color: '#ffffffcc',
    fontSize: 12,
    marginTop: 2,
  },
  cardHalf: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
  },
  cardTitle: {
    fontWeight: '800',
    color: '#111827',
    marginBottom: 6,
  },
  cardBody: {
    color: '#111827',
  },
  cardBodyMuted: {
    color: '#6b7280',
    marginTop: 4,
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
  statLabel: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '700',
  },
  statValue: {
    color: COLORS.brandPrimary,
    fontSize: 16,
    fontWeight: '800',
    marginTop: 2,
  },
});
