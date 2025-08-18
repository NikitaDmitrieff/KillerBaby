import CollapsibleHeader from './CollapsibleHeader';
import { View, Text, ActivityIndicator, FlatList, RefreshControl, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useGroupsStore } from '../state/groups';
import { Ionicons } from '@expo/vector-icons';

type Mode = 'player' | 'admin';

type Props = {
  mode: Mode;
  title?: string;
  subtitle?: string;
  conversationBasePath: '/group/player/conversation' | '/group/admin/conversation';
};

export default function ConversationInbox({ mode, title = 'Messages', subtitle = 'Your conversations', conversationBasePath }: Props) {
  const router = useRouter();
  const { id: groupId, playerId } = useGroupsStore();
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [conversations, setConversations] = useState<any[]>([]);
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});
  const [userId, setUserId] = useState<string | null>(null);

  const canLoad = useMemo(() => {
    if (mode === 'player') return Boolean(groupId && playerId);
    return Boolean(groupId);
  }, [groupId, playerId, mode]);

  async function loadConversations() {
    if (!canLoad) return;
    try {
      setLoading(true);
      let convos: any[] = [];
      if (mode === 'player') {
        // Ensure the three default conversations exist: Admin, Target, Hunter
        const groupPromise = supabase.from('groups').select('created_by').eq('id', groupId as string).single();
        const targetPromise = playerId
          ? supabase.rpc('get_current_target', { p_group_id: groupId as string, p_assassin_player_id: playerId as string })
          : Promise.resolve({ data: null });
        const hunterRpcPromise = playerId
          ? supabase.rpc('get_current_hunter', { p_group_id: groupId as string, p_target_player_id: playerId as string })
          : Promise.resolve({ data: null });

        const [groupRes, targetRes, hunterRpcRes] = await Promise.all([groupPromise, targetPromise, hunterRpcPromise]);
        const adminProfileId = (groupRes as any)?.data?.created_by ?? null;

        const targetRow = Array.isArray((targetRes as any)?.data) ? (targetRes as any)?.data?.[0] : null;
        const targetPlayerId = targetRow?.target_player_id ?? null;

        let hunterPlayerId: string | null = null;
        const hunterRow = Array.isArray((hunterRpcRes as any)?.data) ? (hunterRpcRes as any)?.data?.[0] : null;
        hunterPlayerId = hunterRow?.hunter_player_id ?? hunterRow?.assassin_player_id ?? null;
        if (!hunterPlayerId && groupId && playerId) {
          const { data: assignRow } = await supabase
            .from('assignments')
            .select('assassin_player_id, closed_at')
            .eq('group_id', groupId as string)
            .eq('target_player_id', playerId as string)
            .is('closed_at', null)
            .limit(1);
          hunterPlayerId = Array.isArray(assignRow) ? (assignRow[0]?.assassin_player_id as string) : null;
        }

        async function ensureConversation(where: Record<string, any>, insertRow: Record<string, any>) {
          const query = supabase.from('conversations').select('*').eq('group_id', groupId as string);
          for (const [k, v] of Object.entries(where)) (query as any).eq(k, v);
          const { data: existing, error: findErr } = await query.limit(1);
          if (findErr) throw findErr;
          if (Array.isArray(existing) && existing[0]) return existing[0];
          const { data: created, error: createErr } = await supabase
            .from('conversations')
            .insert([{ ...insertRow }])
            .select('*')
            .single();
          if (createErr) throw createErr;
          return created;
        }

        const results: any[] = [];
        if (playerId) {
          const adminConvo = await ensureConversation(
            { conversation_kind: 'PLAYER_ADMIN', player_id: playerId },
            { group_id: groupId, conversation_kind: 'PLAYER_ADMIN', player_id: playerId, admin_profile_id: adminProfileId }
          );
          results.push(adminConvo);
        }
        if (playerId && targetPlayerId) {
          const targetConvo = await ensureConversation(
            { conversation_kind: 'PLAYER_TARGET', player_id: playerId, target_player_id: targetPlayerId },
            { group_id: groupId, conversation_kind: 'PLAYER_TARGET', player_id: playerId, target_player_id: targetPlayerId }
          );
          results.push(targetConvo);
        }
        if (hunterPlayerId && playerId) {
          const hunterConvo = await ensureConversation(
            { conversation_kind: 'PLAYER_TARGET', player_id: hunterPlayerId, target_player_id: playerId },
            { group_id: groupId, conversation_kind: 'PLAYER_TARGET', player_id: hunterPlayerId, target_player_id: playerId }
          );
          results.push(hunterConvo);
        }

        const haveTargetConvo = results.some((c) => c.conversation_kind === 'PLAYER_TARGET' && c.player_id === playerId && c.target_player_id);
        const haveHunterConvo = results.some((c) => c.conversation_kind === 'PLAYER_TARGET' && c.target_player_id === playerId);

        if (!haveTargetConvo) {
          results.push({
            id: 'placeholder-target',
            conversation_kind: 'PLAYER_TARGET',
            player_id: playerId,
            target_player_id: null,
            created_at: new Date().toISOString(),
            is_placeholder: true,
          });
        }
        if (!haveHunterConvo) {
          results.push({
            id: 'placeholder-hunter',
            conversation_kind: 'PLAYER_TARGET',
            player_id: null,
            target_player_id: playerId,
            created_at: new Date().toISOString(),
            is_placeholder: true,
          });
        }

        convos = results
          .filter(Boolean)
          .sort((a, b) => new Date(b.last_message_at || b.created_at).getTime() - new Date(a.last_message_at || a.created_at).getTime());
        setConversations(convos);
      } else {
        const { data, error } = await supabase
          .from('conversations')
          .select('*')
          .eq('group_id', groupId as string)
          .eq('conversation_kind', 'PLAYER_ADMIN')
          .order('last_message_at', { ascending: false })
          .limit(200);
        if (error) throw error;
        convos = Array.isArray(data) ? data : [];
        setConversations(convos);
      }

      // Build display names map
      const ids = (mode === 'player'
        ? convos
            .filter((c: any) => c.conversation_kind === 'PLAYER_TARGET' && c.player_id === playerId)
            .map((c: any) => c.target_player_id)
        : convos.map((c: any) => c.player_id)
      ).filter((id: string | null) => Boolean(id)) as string[];

      if (ids.length > 0) {
        const { data: gp, error: gpErr } = await supabase
          .from('group_players')
          .select('id, display_name')
          .in('id', ids);
        if (!gpErr && Array.isArray(gp)) {
          const map: Record<string, string> = {};
          for (const row of gp) map[row.id as string] = row.display_name as string;
          setNameMap(map);
        } else {
          setNameMap({});
        }
      } else {
        setNameMap({});
      }

      // Unread counts
      const convIds = convos.map((c: any) => c.id).filter((id: any) => typeof id === 'number');
      if (convIds.length > 0) {
        if (mode === 'player' && playerId) {
          const { data: unreadRows } = await supabase
            .from('messages')
            .select('conversation_id')
            .in('conversation_id', convIds)
            .is('read_at', null)
            .eq('to_player_id', playerId as string)
            .limit(2000);
          const counts: Record<string, number> = {};
          for (const row of unreadRows || []) {
            const key = String((row as any).conversation_id);
            counts[key] = (counts[key] || 0) + 1;
          }
          setUnreadMap(counts);
        } else if (mode === 'admin' && userId) {
          const { data: unreadRows } = await supabase
            .from('messages')
            .select('conversation_id')
            .in('conversation_id', convIds)
            .is('read_at', null)
            .eq('to_profile_id', userId)
            .limit(2000);
          const counts: Record<string, number> = {};
          for (const row of unreadRows || []) {
            const key = String((row as any).conversation_id);
            counts[key] = (counts[key] || 0) + 1;
          }
          setUnreadMap(counts);
        } else {
          setUnreadMap({});
        }
      } else {
        setUnreadMap({});
      }
    } catch {
      // noop
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      if (mode === 'admin') {
        const { data } = await supabase.auth.getUser();
        setUserId(data?.user?.id ?? null);
      } else {
        setUserId(null);
      }
      await loadConversations();
    })();
  }, [groupId, playerId, mode]);

  useFocusEffect(
    useCallback(() => {
      loadConversations();
    }, [groupId, playerId, mode])
  );

  async function onRefresh() {
    setRefreshing(true);
    try {
      await loadConversations();
    } finally {
      setRefreshing(false);
    }
  }

  const fmtWhen = (iso: string) => {
    const d = new Date(iso);
    const today = new Date(); today.setHours(0,0,0,0);
    const that = new Date(d); that.setHours(0,0,0,0);
    const diff = Math.round((+that - +today) / 86400000);
    if (diff === 0) return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(d);
    if (diff === -1) return 'Yesterday';
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(d);
  };

  const kindMeta = (item: any) => {
    if (item.conversation_kind === 'PLAYER_ADMIN') {
      return { icon: 'shield-checkmark', bg: '#f3f4f6', tint: '#111827', label: 'Admin', sub: mode === 'player' ? 'You ↔ Admin' : 'Player ↔ Admin' };
    }
    const isHunter = item.target_player_id === playerId; // their hunter → you
    if (isHunter) return { icon: 'skull', bg: '#fee2e2', tint: '#b91c1c', label: 'Hunter', sub: 'Your hunter' };
    return { icon: 'person', bg: '#eef2ff', tint: '#1f2937', label: 'Target', sub: 'You and your target' };
  };

  return (
    <CollapsibleHeader
      title={title}
      subtitle={subtitle}
      isRefreshing={refreshing}
      renderContent={({ contentInsetTop, onScroll, scrollRef }) => (
        <ScrollView
          ref={scrollRef as any}
          onScroll={onScroll}
          scrollEventThrottle={16}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingTop: contentInsetTop, paddingHorizontal: 16, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#9d0208" colors={['#9d0208']} />}
        >
          {loading ? (
            <View style={{ paddingVertical: 20, alignItems: 'center' }}>
              <ActivityIndicator />
              <Text style={{ marginTop: 8, color: '#6b7280' }}>Loading…</Text>
            </View>
          ) : conversations.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No conversations yet</Text>
              <Text style={styles.emptySub}>Messages will appear here when the game gets going.</Text>
            </View>
          ) : (
            <FlatList
              scrollEnabled={false}
              data={conversations}
              keyExtractor={(item) => String(item.id)}
              ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
              renderItem={({ item }) => {
                const isPlaceholder = typeof item.id !== 'number';
                const meta = kindMeta(item);
                const unreadCount = typeof item.id === 'number' ? (unreadMap[String(item.id)] || 0) : 0;
                const isAdminConvo = item.conversation_kind === 'PLAYER_ADMIN';
                const titleText =
                  mode === 'player'
                    ? isAdminConvo
                      ? 'Admin'
                      : item.player_id === playerId
                      ? nameMap[item.target_player_id] || 'Target'
                      : 'Hunter'
                    : nameMap[item.player_id] || 'Unknown player';
                const whenIso = item.last_message_at || item.created_at;
                const when = whenIso ? fmtWhen(whenIso) : '';

                return (
                  <TouchableOpacity
                    disabled={isPlaceholder}
                    onPress={() => {
                      if (!isPlaceholder) router.push(`${conversationBasePath}/${item.id}`);
                    }}
                    style={{ opacity: isPlaceholder ? 0.65 : 1 }}
                  >
                    <View style={styles.card}>
                      <View style={styles.row}>
                        <View style={[styles.iconWrap, { backgroundColor: meta.bg }]}>
                          <Ionicons name={meta.icon as any} size={16} color={meta.tint} />
                        </View>

                        <View style={{ flex: 1 }}>
                          <View style={styles.titleRow}>
                            <Text style={styles.title} numberOfLines={1}>
                              {titleText}
                            </Text>
                            {!!when && <Text style={styles.when}>{when}</Text>}
                          </View>
                          <Text style={styles.subtitle} numberOfLines={1}>
                            {isPlaceholder ? (meta.label === 'Target' ? 'Target not assigned yet' : 'Hunter unknown yet') : meta.sub}
                          </Text>
                        </View>

                        {unreadCount > 0 && (
                          <View style={styles.badge}>
                            <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                          </View>
                        )}

                        <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </ScrollView>
      )}
    />
  );
}

const styles = StyleSheet.create({
  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  emptyTitle: { fontWeight: '800', color: '#111827' },
  emptySub: { color: '#6b7280', marginTop: 4, fontSize: 12 },

  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontWeight: '800', color: '#111827', maxWidth: '70%' },
  when: { color: '#9ca3af', fontSize: 12, marginLeft: 8 },
  subtitle: { color: '#6b7280', fontSize: 12, marginTop: 4 },

  badge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
});
