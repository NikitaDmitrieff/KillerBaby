import CollapsibleHeader, { CollapsibleHeaderAccessory } from './CollapsibleHeader';
import { View, Text, ActivityIndicator, FlatList, RefreshControl, TouchableOpacity, ScrollView } from 'react-native';
import { useEffect, useMemo, useState, useCallback } from 'react';
import RoleToggle from '../app/group/role-toggle';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useGroupsStore } from '../state/groups';

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
        // Fetch admin-player thread for this player
        const adminQuery = supabase
          .from('conversations')
          .select('*')
          .eq('group_id', groupId as string)
          .eq('conversation_kind', 'PLAYER_ADMIN')
          .eq('player_id', playerId as string)
          .limit(100);
        // Fetch hunter-target threads where this player is hunter
        const hunterQuery = supabase
          .from('conversations')
          .select('*')
          .eq('group_id', groupId as string)
          .eq('conversation_kind', 'PLAYER_TARGET')
          .eq('player_id', playerId as string)
          .limit(200);
        // Fetch hunter-target threads where this player is target (show as "Hunter")
        const targetQuery = supabase
          .from('conversations')
          .select('*')
          .eq('group_id', groupId as string)
          .eq('conversation_kind', 'PLAYER_TARGET')
          .eq('target_player_id', playerId as string)
          .limit(200);

        const [adminRes, hunterRes, targetRes] = await Promise.all([adminQuery, hunterQuery, targetQuery]);
        if (adminRes.error) throw adminRes.error;
        if (hunterRes.error) throw hunterRes.error;
        if (targetRes.error) throw targetRes.error;
        convos = ([...(adminRes.data || []), ...(hunterRes.data || []), ...(targetRes.data || [])] as any[])
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

      // Load unread counts per conversation
      const convIds = convos.map((c: any) => c.id);
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
        <ScrollView
          ref={scrollRef as any}
          onScroll={onScroll}
          scrollEventThrottle={16}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingTop: contentInsetTop, paddingHorizontal: 16, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#9d0208" colors={["#9d0208"]} />}
        >
          {loading ? (
            <View style={{ paddingVertical: 20, alignItems: 'center' }}>
              <ActivityIndicator />
              <Text style={{ marginTop: 8, color: '#6b7280' }}>Loading…</Text>
            </View>
          ) : conversations.length === 0 ? (
            <Text style={{ color: '#6b7280' }}>No conversations yet.</Text>
          ) : (
            <FlatList
              scrollEnabled={false}
              data={conversations}
              keyExtractor={(item) => String(item.id)}
              ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
              renderItem={({ item }) => {
                const isAdminConvo = item.conversation_kind === 'PLAYER_ADMIN';
                const isHunterTarget = item.conversation_kind === 'PLAYER_TARGET';
                const titleText = mode === 'player'
                  ? (isAdminConvo
                      ? 'Admin'
                      : (item.player_id === playerId
                          ? (nameMap[item.target_player_id] || 'Target')
                          : 'Hunter'))
                  : (nameMap[item.player_id] || 'Unknown player');
                const when = item.last_message_at ? new Date(item.last_message_at).toLocaleString() : new Date(item.created_at).toLocaleString();
                const subtitleText = mode === 'player'
                  ? (isAdminConvo ? 'You and the admin' : 'You and your target')
                  : 'Player ↔ Admin';
                const unreadCount = unreadMap[String(item.id)] || 0;
                return (
                  <TouchableOpacity onPress={() => router.push(`${conversationBasePath}/${item.id}`)}>
                    <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#e5e7eb', position: 'relative' }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={{ fontWeight: '800' }}>{titleText}</Text>
                          {unreadCount > 0 && (
                            <View style={{ backgroundColor: '#dc2626', minWidth: 8, height: 8, borderRadius: 8, marginLeft: 6 }} />
                          )}
                        </View>
                        <Text style={{ color: '#6b7280', fontSize: 12 }}>{when}</Text>
                      </View>
                      <Text style={{ color: '#6b7280', marginTop: 4, fontSize: 12 }}>
                        {subtitleText}
                      </Text>
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


