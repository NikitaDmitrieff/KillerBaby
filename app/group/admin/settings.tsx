import CollapsibleHeader, { CollapsibleHeaderAccessory } from '../../../components/CollapsibleHeader';
import { View, Text, Switch, ScrollView, RefreshControl, ActivityIndicator, FlatList, TouchableOpacity } from 'react-native';
import { useEffect, useMemo, useState } from 'react';
import RoleToggle from '../role-toggle';
import { useGroupsStore } from '../../../state/groups';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'expo-router';

export default function AdminSettingsScreen() {
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const router = useRouter();
  const { id: groupId } = useGroupsStore();
  const [loadingConvos, setLoadingConvos] = useState(false);
  const [conversations, setConversations] = useState<any[]>([]);

  const canLoad = useMemo(() => Boolean(groupId), [groupId]);

  async function loadConversations() {
    if (!canLoad) return;
    try {
      setLoadingConvos(true);
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const user = userRes?.user;
      if (!user) { setConversations([]); return; }

      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('group_id', groupId as string)
        .eq('conversation_kind', 'PLAYER_ADMIN')
        .order('last_message_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      setConversations(Array.isArray(data) ? data : []);
    } catch (e) {
      // noop
    } finally {
      setLoadingConvos(false);
    }
  }

  useEffect(() => {
    loadConversations();
  }, [groupId]);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await loadConversations();
      await new Promise(res => setTimeout(res, 300));
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <CollapsibleHeader
      title={"Settings"}
      subtitle={"Group configuration"}
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
              <Text style={{ fontWeight: '700' }}>Auto-advance on elimination</Text>
              <Switch value={autoAdvance} onValueChange={setAutoAdvance} />
            </View>
            <Text style={{ color: '#6b7280', marginTop: 8 }}>When enabled, a hunter automatically inherits their target's dare.</Text>
          </View>

          <View style={{ marginTop: 16 }}>
            <Text style={{ fontWeight: '800', marginBottom: 8 }}>Conversations</Text>
            {loadingConvos ? (
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
                  const when = item.last_message_at ? new Date(item.last_message_at).toLocaleString() : new Date(item.created_at).toLocaleString();
                  return (
                    <TouchableOpacity onPress={() => router.push(`/group/admin/conversation/${item.id}`)}>
                      <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#e5e7eb' }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text style={{ fontWeight: '800' }}>Player conversation</Text>
                          <Text style={{ color: '#6b7280', fontSize: 12 }}>{when}</Text>
                        </View>
                        <Text style={{ color: '#6b7280', marginTop: 4, fontSize: 12 }}>
                          You and a player
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


