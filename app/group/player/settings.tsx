import CollapsibleHeader, { CollapsibleHeaderAccessory } from '../../../components/CollapsibleHeader';
import { View, Text, Switch, ScrollView, RefreshControl, ActivityIndicator, FlatList, TouchableOpacity } from 'react-native';
import { useEffect, useMemo, useState } from 'react';
import RoleToggle from '../role-toggle';
import { useGroupsStore } from '../../../state/groups';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'expo-router';

export default function PlayerSettingsScreen() {
  const [notifications, setNotifications] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const router = useRouter();
  const { id: groupId, playerId } = useGroupsStore();
  const [loading, setLoading] = useState(false);
  const [conversations, setConversations] = useState<any[]>([]);
  const [playerNames, setPlayerNames] = useState<Record<string, string>>({});

  const canLoad = useMemo(() => Boolean(groupId && playerId), [groupId, playerId]);

  async function loadConversations() {
    if (!canLoad) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('group_id', groupId as string)
        .eq('player_id', playerId as string)
        .order('last_message_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      const convos = Array.isArray(data) ? data : [];
      setConversations(convos);

      // fetch target names in batch
      const targetIds = convos
        .map((c: any) => c.target_player_id)
        .filter((id: string | null) => Boolean(id)) as string[];
      if (targetIds.length > 0) {
        const { data: gp, error: gpErr } = await supabase
          .from('group_players')
          .select('id, display_name')
          .in('id', targetIds);
        if (!gpErr && Array.isArray(gp)) {
          const map: Record<string, string> = {};
          for (const row of gp) map[row.id as string] = row.display_name as string;
          setPlayerNames(map);
        }
      } else {
        setPlayerNames({});
      }
    } catch (e) {
      // noop
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadConversations();
  }, [groupId, playerId]);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await Promise.all([loadConversations()]);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <CollapsibleHeader
      title={"Settings"}
      subtitle={"Player preferences"}
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
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#9d0208"
              colors={["#9d0208"]}
            />
          }
        >
          <View style={{ backgroundColor: '#f9f9fb', borderRadius: 12, padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '700' }}>Notifications</Text>
              <Switch value={notifications} onValueChange={setNotifications} />
            </View>
            <Text style={{ color: '#6b7280', marginTop: 8 }}>Get updates when eliminations happen.</Text>
          </View>

          <View style={{ marginTop: 16 }}>
            <Text style={{ fontWeight: '800', marginBottom: 8 }}>Conversations</Text>
            {loading ? (
              <View style={{ paddingVertical: 12 }}>
                <ActivityIndicator />
              </View>
            ) : conversations.length === 0 ? (
              <Text style={{ color: '#6b7280' }}>No conversations yet.</Text>
            ) : (
              <FlatList
                scrollEnabled={false}
                data={conversations}
                keyExtractor={(item) => String(item.id)}
                renderItem={({ item }) => {
                  const isAdmin = item.conversation_kind === 'PLAYER_ADMIN';
                  const title = isAdmin ? 'Admin' : (playerNames[item.target_player_id] || 'Target');
                  const when = item.last_message_at ? new Date(item.last_message_at).toLocaleString() : new Date(item.created_at).toLocaleString();
                  return (
                    <TouchableOpacity onPress={() => router.push(`/group/player/conversation/${item.id}`)}>
                      <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#e5e7eb' }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text style={{ fontWeight: '800' }}>{title}</Text>
                          <Text style={{ color: '#6b7280', fontSize: 12 }}>{when}</Text>
                        </View>
                        <Text style={{ color: '#6b7280', marginTop: 4, fontSize: 12 }}>
                          {isAdmin ? 'You and the admin' : 'You and your target'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        </ScrollView>
      )}
    />
  );
}


