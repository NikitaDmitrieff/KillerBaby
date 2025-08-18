import CollapsibleHeader from '../../../../components/CollapsibleHeader';
import { View, Text, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../../lib/supabase';
import { useGroupsStore } from '../../../../state/groups';
import { COLORS } from '../../../../theme/colors';
import ConversationThread from '../../../../components/ConversationThread';

export default function PlayerConversationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const conversationId = Array.isArray(params.id) ? params.id[0] : (params.id as string);
  const { id: groupId, playerId } = useGroupsStore();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [conversation, setConversation] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

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

  // Mark messages as read for the player when viewing
  useEffect(() => {
    (async () => {
      try {
        if (!conversation || !playerId) return;
        await supabase
          .from('messages')
          .update({ read_at: new Date().toISOString() })
          .eq('conversation_id', conversation.id)
          .eq('to_player_id', playerId)
          .is('read_at', null);
      } catch {}
    })();
  }, [conversation?.id, playerId]);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await loadThread();
    } finally {
      setRefreshing(false);
    }
  }

  async function handleSend() {
    if (!groupId || !playerId || !conversation || !body.trim()) return;
    try {
      setSending(true);
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const user = userRes?.user;
      if (!user) throw new Error('Not authenticated');

      // Determine direction based on conversation kind
      const isAdminConvo = conversation.conversation_kind === 'PLAYER_ADMIN';
      const insertPayload: any = {
        group_id: groupId,
        body: body.trim(),
        tags: ['GENERAL'],
        conversation_id: conversation.id,
      };
      if (isAdminConvo) {
        // Player to admin
        insertPayload.sender_player_id = playerId;
        insertPayload.created_by_profile_id = user.id;
        insertPayload.message_kind = 'TO_ADMIN';
        insertPayload.is_anonymous = false;
      } else {
        // Player to target (anonymous)
        insertPayload.sender_player_id = playerId;
        insertPayload.created_by_profile_id = user.id;
        insertPayload.message_kind = 'TO_TARGET';
        insertPayload.is_anonymous = true;
        insertPayload.to_player_id = conversation.target_player_id;
      }

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
      title={conversation?.conversation_kind === 'PLAYER_ADMIN' ? 'Chat with Admin' : 'Chat with Target'}
      subtitle={"Conversation"}
      isRefreshing={refreshing}
      renderContent={({ contentInsetTop, onScroll, scrollRef }) => (
        <View style={{ flex: 1 }}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Back to inbox"
            onPress={() => {
              try {
                if ((router as any).canGoBack?.()) {
                  (router as any).back();
                  return;
                }
              } catch {}
              router.replace('/group/player/conversation');
            }}
            style={{ position: 'absolute', left: 16, top: contentInsetTop + 8, zIndex: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.brandPrimary, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 }}
          >
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          {loading ? (
            <View style={{ paddingTop: contentInsetTop + 56, paddingHorizontal: 16, alignItems: 'center' }}>
              <ActivityIndicator />
              <Text style={{ marginTop: 8, color: '#6b7280' }}>Loading…</Text>
            </View>
          ) : (
            <ConversationThread
              messages={messages}
              body={body}
              onChangeBody={setBody}
              sending={sending}
              onSend={handleSend}
              contentInsetTop={contentInsetTop}
              onScroll={onScroll}
              scrollRef={scrollRef}
              refreshing={refreshing}
              onRefresh={onRefresh}
              isMine={(m: any) => Boolean(m?.sender_player_id && m.sender_player_id === playerId)}
            />
          )}
        </View>
      )}
    />
  );
}


