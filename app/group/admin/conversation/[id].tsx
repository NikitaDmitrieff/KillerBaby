import CollapsibleHeader, { CollapsibleHeaderAccessory } from '../../../../components/CollapsibleHeader';
import { View, Text, ActivityIndicator, FlatList, RefreshControl, TextInput, TouchableOpacity, Alert } from 'react-native';
import { useEffect, useMemo, useState } from 'react';
import RoleToggle from '../../role-toggle';
import { useLocalSearchParams } from 'expo-router';
import { supabase } from '../../../../lib/supabase';
import { useGroupsStore } from '../../../../state/groups';
import { COLORS } from '../../../../theme/colors';

export default function AdminConversationScreen() {
  const params = useLocalSearchParams();
  const conversationId = Array.isArray(params.id) ? params.id[0] : (params.id as string);
  const { id: groupId } = useGroupsStore();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [conversation, setConversation] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [playerName, setPlayerName] = useState<string>('');

  const canLoad = useMemo(() => Boolean(groupId && conversationId), [groupId, conversationId]);

  async function loadThread() {
    if (!canLoad) return;
    try {
      setLoading(true);
      const { data: convo, error: cErr } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', Number(conversationId))
        .single();
      if (cErr) throw cErr;
      setConversation(convo);
      // Fetch player's display name for header
      if (convo?.player_id) {
        const { data: gp } = await supabase
          .from('group_players')
          .select('display_name')
          .eq('id', convo.player_id)
          .single();
        if (gp?.display_name) setPlayerName(gp.display_name as string);
      } else {
        setPlayerName('');
      }
      const { data: msgs, error: mErr } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', Number(conversationId))
        .order('created_at', { ascending: true })
        .limit(500);
      if (mErr) throw mErr;
      setMessages(Array.isArray(msgs) ? msgs : []);
    } catch (e: any) {
      Alert.alert('Failed to load', e?.message ?? 'Could not load conversation');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadThread();
  }, [conversationId, groupId]);

  // Mark messages as read for the admin when viewing
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const uid = data?.user?.id;
        if (!conversation || !uid) return;
        await supabase
          .from('messages')
          .update({ read_at: new Date().toISOString() })
          .eq('conversation_id', conversation.id)
          .eq('to_profile_id', uid)
          .is('read_at', null);
      } catch {}
    })();
  }, [conversation?.id]);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await loadThread();
    } finally {
      setRefreshing(false);
    }
  }

  async function handleSend() {
    if (!groupId || !conversation || !body.trim()) return;
    try {
      setSending(true);
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const user = userRes?.user;
      if (!user) throw new Error('Not authenticated');

      // Admin reply goes to the player in PLAYER_ADMIN conversation
      if (conversation.conversation_kind !== 'PLAYER_ADMIN') {
        Alert.alert('Unsupported', 'Admins can reply only in admin conversations.');
        return;
      }
      const insertPayload: any = {
        group_id: groupId,
        body: body.trim(),
        tags: ['GENERAL'],
        conversation_id: conversation.id,
        sender_profile_id: user.id,
        message_kind: 'ADMIN_TO_PLAYER',
        is_anonymous: false,
        to_player_id: conversation.player_id,
      };

      const { error } = await supabase.from('messages').insert([insertPayload]);
      if (error) throw error;
      setBody('');
      await loadThread();
    } catch (e: any) {
      Alert.alert('Send failed', e?.message ?? 'Could not send');
    } finally {
      setSending(false);
    }
  }

  return (
    <CollapsibleHeader
      title={playerName ? `Chat with ${playerName}` : 'Chat with Player'}
      subtitle={'Conversation'}
      isRefreshing={refreshing}
      renderRightAccessory={({ collapseProgress }) => (
        <CollapsibleHeaderAccessory collapseProgress={collapseProgress}>
          <RoleToggle />
        </CollapsibleHeaderAccessory>
      )}
      renderContent={({ contentInsetTop, onScroll, scrollRef }) => (
        <View style={{ flex: 1 }}>
          {loading ? (
            <View style={{ paddingTop: contentInsetTop, paddingHorizontal: 16, alignItems: 'center' }}>
              <ActivityIndicator />
              <Text style={{ marginTop: 8, color: '#6b7280' }}>Loading…</Text>
            </View>
          ) : (
            <FlatList
              ref={scrollRef as any}
              onScroll={onScroll}
              scrollEventThrottle={16}
              data={messages}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={{ paddingTop: contentInsetTop, paddingHorizontal: 16, paddingBottom: 100 }}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#9d0208" colors={["#9d0208"]} />
              }
              renderItem={({ item }) => {
                const isMine = Boolean(item.sender_profile_id);
                return (
                  <View style={{ marginVertical: 6, alignItems: isMine ? 'flex-end' : 'flex-start' }}>
                    <View style={{ maxWidth: '80%', backgroundColor: isMine ? COLORS.brandPrimary : '#f3f4f6', borderRadius: 12, padding: 10 }}>
                      <Text style={{ color: isMine ? '#fff' : '#111827' }}>{item.body}</Text>
                      <Text style={{ color: isMine ? '#ffffffaa' : '#6b7280', fontSize: 10, marginTop: 4 }}>{new Date(item.created_at).toLocaleTimeString()}</Text>
                    </View>
                  </View>
                );
              }}
              ListFooterComponent={
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  <TextInput
                    value={body}
                    onChangeText={setBody}
                    placeholder="Type a message…"
                    placeholderTextColor="#9ca3af"
                    style={{ flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff' }}
                  />
                  <TouchableOpacity
                    onPress={handleSend}
                    disabled={sending || !body.trim()}
                    style={{ backgroundColor: COLORS.brandPrimary, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', opacity: sending || !body.trim() ? 0.6 : 1 }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '800' }}>Send</Text>
                  </TouchableOpacity>
                </View>
              }
            />
          )}
        </View>
      )}
    />
  );
}


