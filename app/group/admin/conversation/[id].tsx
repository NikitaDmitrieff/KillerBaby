import CollapsibleHeader from '../../../../components/CollapsibleHeader';
import { View, Text, ActivityIndicator, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../../lib/supabase';
import { useGroupsStore } from '../../../../state/groups';
import { COLORS } from '../../../../theme/colors';
import ConversationThread from '../../../../components/ConversationThread';

export default function AdminConversationScreen() {
  const router = useRouter();
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
  const [profileId, setProfileId] = useState<string | null>(null);

  const canLoad = useMemo(() => Boolean(groupId && conversationId), [groupId, conversationId]);
  const canSend = useMemo(
    () => !!groupId && !!conversation && body.trim().length > 0 && conversation.conversation_kind === 'PLAYER_ADMIN',
    [groupId, conversation, body]
  );

  const loadThread = useCallback(async () => {
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

      if (convo?.player_id) {
        const { data: gp } = await supabase
          .from('group_players')
          .select('display_name')
          .eq('id', convo.player_id)
          .single();
        setPlayerName(gp?.display_name || '');
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
  }, [canLoad, conversationId]);

  useEffect(() => {
    loadThread();
  }, [loadThread]);

  // fetch auth profile id once
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        setProfileId(data?.user?.id ?? null);
      } catch {}
    })();
  }, []);

  // mark as read helper (admin reading incoming messages)
  const markThreadRead = useCallback(async () => {
    try {
      if (!conversation?.id || !profileId) return;
      await supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .eq('conversation_id', conversation.id)
        .eq('to_profile_id', profileId)
        .is('read_at', null);
    } catch {}
  }, [conversation?.id, profileId]);

  // mark when first loaded & whenever list grows
  useEffect(() => {
    markThreadRead();
  }, [markThreadRead, messages.length]);

  // realtime subscription for new messages in this conversation
  useEffect(() => {
    if (!conversationId) return;
    const ch = supabase
      .channel(`convo-${conversationId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const msg: any = payload.new;
          setMessages((prev) => [...prev, msg]);
          // mark as read if this new message is for the current admin
          if (profileId && msg.to_profile_id === profileId && !msg.read_at) {
            supabase
              .from('messages')
              .update({ read_at: new Date().toISOString() })
              .eq('id', msg.id)
              .then(() => {});
          }
        }
      )
      .subscribe();
    return () => {
      ch.unsubscribe();
    };
  }, [conversationId, profileId]);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await loadThread();
    } finally {
      setRefreshing(false);
    }
  }

  async function handleSend() {
    if (!canSend) return;
    try {
      setSending(true);
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const user = userRes?.user;
      if (!user) throw new Error('Not authenticated');

      // optimistic append
      const tmpId = `tmp-${Date.now()}`;
      const optimistic = {
        id: tmpId,
        group_id: groupId,
        conversation_id: conversation.id,
        created_at: new Date().toISOString(),
        body: body.trim(),
        sender_profile_id: user.id,
        to_player_id: conversation.player_id,
        message_kind: 'ADMIN_TO_PLAYER',
        is_anonymous: false,
        tags: ['GENERAL'],
      };
      setMessages((prev) => [...prev, optimistic as any]);
      const toSend = body.trim();
      setBody('');

      const { error } = await supabase.from('messages').insert([
        {
          group_id: groupId,
          body: toSend,
          tags: ['GENERAL'],
          conversation_id: conversation.id,
          created_by_profile_id: user.id,
          sender_profile_id: user.id,
          message_kind: 'ADMIN_TO_PLAYER',
          is_anonymous: false,
          to_player_id: conversation.player_id,
        },
      ]);
      if (error) throw error;
      // realtime will deliver the canonical row; we can drop the optimistic one on next reload
      // to keep things in sync for sure, refresh quietly
      loadThread();
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
              router.replace('/group/admin/conversation');
            }}
            style={[
              styles.backBtn,
              { top: contentInsetTop + 8 },
            ]}
          >
            <Ionicons name="chevron-back" size={20} color={COLORS.brandPrimary} />
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
              isMine={(m: any) => Boolean(m?.sender_profile_id && m.sender_profile_id === profileId)}
            />
          )}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  backBtn: {
    position: 'absolute',
    left: 16,
    zIndex: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
});
