import CollapsibleHeader, { CollapsibleHeaderAccessory } from '../../../components/CollapsibleHeader';
import { View, Text, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import RoleToggle from '../role-toggle';
import { supabase } from '../../../lib/supabase';
import { useGroupsStore } from '../../../state/groups';

type FeedItem = {
  id: string;
  ts: string; // ISO
  kind: 'elimination' | 'join' | 'game_started' | 'game_ended';
  text: string;
};

export default function PlayerFeedScreen() {
  const groupId = useGroupsStore((s) => s.id);
  const groupName = useGroupsStore((s) => s.name);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const loadedForGroupRef = useRef<string | null>(null);
  const channelsRef = useRef<{ gp?: ReturnType<typeof supabase.channel>; asg?: ReturnType<typeof supabase.channel> } | null>(null);

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
    } catch (e) {
      console.warn('[feed] loadInitial error', (e as any)?.message);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  // Initial load when group switches
  useEffect(() => {
    setItems([]);
    if (!groupId) return;
    loadInitial();
  }, [groupId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime subscriptions
  useEffect(() => {
    if (!groupId) return;
    // Cleanup any existing channels
    if (channelsRef.current) {
      channelsRef.current.gp?.unsubscribe();
      channelsRef.current.asg?.unsubscribe();
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
            const it: FeedItem = {
              id: data.id as string,
              ts: data.closed_at as string,
              kind: 'elimination',
              text: `${data.assassin?.display_name ?? 'Someone'} eliminated ${data.target?.display_name ?? 'someone'} with “${data.dare_text ?? 'a dare'}”`,
            };
            mergeItems([it]);
          } catch {}
        }
      )
      .subscribe();

    channelsRef.current = { gp: gpChannel, asg: asgChannel };
    return () => {
      gpChannel.unsubscribe();
      asgChannel.unsubscribe();
    };
  }, [groupId]); // eslint-disable-line react-hooks/exhaustive-deps

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadInitial();
    } finally {
      setRefreshing(false);
    }
  }, [loadInitial]);

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
