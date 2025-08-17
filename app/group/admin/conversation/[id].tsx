import CollapsibleHeader, { CollapsibleHeaderAccessory } from '../../../../components/CollapsibleHeader';
import { View, Text, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import RoleToggle from '../../role-toggle';
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

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        setProfileId(data?.user?.id ?? null);
      } catch {}
    })();
  }, []);

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
        created_by_profile_id: user.id,
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
              isMine={(m: any) => Boolean(m?.sender_profile_id && m.sender_profile_id === profileId)}
            />
          )}
        </View>
      )}
    />
  );
}


