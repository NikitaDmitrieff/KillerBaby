import CollapsibleHeader, { CollapsibleHeaderAccessory } from '../../../components/CollapsibleHeader';
import { View, Text, FlatList, ActivityIndicator, TouchableOpacity, Alert, StyleSheet, RefreshControl, TextInput } from 'react-native';
import RoleToggle from '../role-toggle';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useGroupsStore } from '../../../state/groups';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, GRADIENTS } from '../../../theme/colors';

export default function PlayerAssignmentScreen() {
  const { id: groupId, playerId } = useGroupsStore();
  const [loading, setLoading] = useState(true);
  const [targetName, setTargetName] = useState('—');
  const [dareText, setDareText] = useState('—');
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [targetPlayerId, setTargetPlayerId] = useState<string | null>(null);

  // message compose state
  const [messageKind, setMessageKind] = useState<'TO_TARGET' | 'TO_ADMIN'>('TO_TARGET');
  const [messageBody, setMessageBody] = useState('');
  const [messageTags, setMessageTags] = useState<string[]>(['GENERAL']);
  const [sending, setSending] = useState(false);

  const hasAssignment = useMemo(() => targetName !== '—' && dareText !== '—', [targetName, dareText]);
  const canMessageTarget = hasAssignment && Boolean(targetPlayerId);

  const ALL_TAGS = ['DARE_CHANGE_REQUEST', 'DARE_CLARIFICATION', 'GENERAL', 'REPORT', 'OTHER'];

  async function loadAssignment() {
    if (!groupId || !playerId) return;
    try {
      setLoading(true);
      const { data } = await supabase.rpc('get_current_target', {
        p_group_id: groupId,
        p_assassin_player_id: playerId,
      });
      const row = Array.isArray(data) ? (data[0] as any) : null;
      if (row) {
        setTargetName((row.display_name as string) || '—');
        setDareText((row.dare_text as string) || '—');
        setTargetPlayerId((row.target_player_id as string) || null);
      } else {
        setTargetName('—');
        setDareText('—');
        setTargetPlayerId(null);
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to load assignment');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAssignment();
  }, [groupId, playerId]);

  async function handleEliminate() {
    if (!groupId || !playerId) return;
    try {
      setSubmitting(true);
      await supabase.rpc('eliminate_player', {
        p_group_id: groupId,
        p_assassin_player_id: playerId,
        p_created_by_profile_id: null,
      });
      await loadAssignment();
      Alert.alert('Success', 'Elimination recorded.');
    } catch (e: any) {
      Alert.alert('Action failed', e?.message ?? 'Could not complete elimination');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSendMessage() {
    if (!groupId || !playerId) return;
    if (!messageBody.trim()) {
      Alert.alert('Empty message', 'Please write something to send.');
      return;
    }
    if (messageKind === 'TO_TARGET' && !canMessageTarget) {
      Alert.alert('No target', 'You do not have a target to message yet.');
      return;
    }

    try {
      setSending(true);
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const user = userRes?.user;
      if (!user) throw new Error('Not authenticated');

      const insertPayload: any = {
        group_id: groupId,
        sender_player_id: playerId,
        created_by_profile_id: user.id,
        message_kind: messageKind,
        is_anonymous: messageKind === 'TO_TARGET',
        body: messageBody.trim(),
        tags: messageTags,
      };
      if (messageKind === 'TO_TARGET') {
        insertPayload.to_player_id = targetPlayerId;
      }

      const { error } = await supabase.from('messages').insert([insertPayload]);
      if (error) throw error;

      setMessageBody('');
      setMessageTags(['GENERAL']);
      Alert.alert('Sent', messageKind === 'TO_TARGET' ? 'Sent to your target.' : 'Sent to the admin.');
    } catch (e: any) {
      Alert.alert('Send failed', e?.message ?? 'Could not send message');
    } finally {
      setSending(false);
    }
  }

  function toggleTag(tag: string) {
    setMessageTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  }

  async function onRefresh() {
    setRefreshing(true);
    try {
      await loadAssignment();
    } finally {
      setRefreshing(false);
    }
  }

  function getInitials(name: string): string {
    if (!name || name === '—') return '';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    const first = parts[0][0] ?? '';
    const last = parts[parts.length - 1][0] ?? '';
    return `${first}${last}`.toUpperCase();
  }

  return (
    <CollapsibleHeader
      title={"Your Assignment"}
      subtitle={"Eliminate your target with the dare"}
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
              <Text style={{ marginTop: 8, color: '#6b7280' }}>Loading assignment…</Text>
            </View>
          ) : (
            <FlatList
              ref={scrollRef as any}
              onScroll={onScroll}
              scrollEventThrottle={16}
              data={[{ key: 'dare', title: 'Your Dare', value: dareText }]}
              contentContainerStyle={{ paddingTop: contentInsetTop, paddingHorizontal: 16, paddingBottom: 100 }}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor="#9d0208"
                  colors={["#9d0208"]}
                />
              }
              ListHeaderComponent={(
                <View style={{ marginBottom: 16 }}>
                  <LinearGradient colors={GRADIENTS.brand} style={styles.heroCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={styles.heroIconWrap}>
                        {hasAssignment && getInitials(targetName) ? (
                          <Text style={styles.heroInitials}>{getInitials(targetName)}</Text>
                        ) : (
                          <Ionicons name="person" size={22} color="#fff" />
                        )}
                      </View>
                      <View style={{ marginLeft: 12, flex: 1 }}>
                        <Text style={styles.heroLabel}>Current Target</Text>
                        <Text style={styles.heroTitle} numberOfLines={1}>{hasAssignment ? targetName : 'Waiting for assignment'}</Text>
                      </View>
                    </View>
                  </LinearGradient>

                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                    <TouchableOpacity
                      disabled={submitting || !hasAssignment}
                      onPress={handleEliminate}
                      style={[styles.primaryButton, { opacity: submitting || !hasAssignment ? 0.6 : 1 }]}
                    >
                      {submitting ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Ionicons name="checkmark-circle" size={18} color="#fff" />
                          <Text style={styles.primaryButtonText}>Eliminated</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  </View>

                  <View style={styles.composeCard}>
                    <Text style={styles.composeTitle}>Message</Text>
                    <View style={styles.segmentRow}>
                      <TouchableOpacity
                        onPress={() => setMessageKind('TO_TARGET')}
                        disabled={!canMessageTarget}
                        style={[styles.segmentButton, messageKind === 'TO_TARGET' ? styles.segmentButtonActive : null, !canMessageTarget ? styles.segmentButtonDisabled : null]}
                      >
                        <Text style={[styles.segmentText, messageKind === 'TO_TARGET' ? styles.segmentTextActive : null]}>Target</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setMessageKind('TO_ADMIN')}
                        style={[styles.segmentButton, messageKind === 'TO_ADMIN' ? styles.segmentButtonActive : null]}
                      >
                        <Text style={[styles.segmentText, messageKind === 'TO_ADMIN' ? styles.segmentTextActive : null]}>Admin</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.tagsRow}>
                      {ALL_TAGS.map(tag => (
                        <TouchableOpacity key={tag} onPress={() => toggleTag(tag)} style={[styles.tagChip, messageTags.includes(tag) ? styles.tagChipActive : null]}>
                          <Text style={[styles.tagText, messageTags.includes(tag) ? styles.tagTextActive : null]}>
                            {tag.replace(/_/g, ' ').toLowerCase()}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <TextInput
                      value={messageBody}
                      onChangeText={setMessageBody}
                      placeholder={messageKind === 'TO_TARGET' ? 'Write an anonymous note to your target…' : 'Write a message to the admin…'}
                      placeholderTextColor="#9ca3af"
                      multiline
                      style={styles.input}
                    />

                    <TouchableOpacity
                      onPress={handleSendMessage}
                      disabled={sending || !messageBody.trim() || (messageKind === 'TO_TARGET' && !canMessageTarget)}
                      style={[styles.sendButton, { opacity: sending || !messageBody.trim() || (messageKind === 'TO_TARGET' && !canMessageTarget) ? 0.6 : 1 }]}
                    >
                      {sending ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Ionicons name="send" size={16} color="#fff" />
                          <Text style={styles.sendButtonText}>Send</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              renderItem={({ item }) => (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.cardBody}>
                    {hasAssignment ? `“${item.value}”` : '—'}
                  </Text>
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
  heroInitials: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 0.3,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: COLORS.brandPrimary,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '800',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardTitle: {
    fontWeight: '800',
    color: '#111827',
  },
  cardBody: {
    color: '#374151',
    marginTop: 6,
    lineHeight: 20,
  },
  composeCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    marginTop: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
  },
  composeTitle: {
    fontWeight: '800',
    color: '#111827',
    marginBottom: 10,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f4f6',
  },
  segmentButtonActive: {
    backgroundColor: COLORS.brandPrimary,
    borderColor: COLORS.brandPrimary,
  },
  segmentButtonDisabled: {
    opacity: 0.5,
  },
  segmentText: {
    fontWeight: '700',
    color: '#111827',
  },
  segmentTextActive: {
    color: '#fff',
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  tagChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#f3f4f6',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d1d5db',
  },
  tagChipActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  tagText: {
    fontWeight: '700',
    color: '#111827',
    fontSize: 12,
    letterSpacing: 0.2,
  },
  tagTextActive: {
    color: '#fff',
  },
  input: {
    minHeight: 80,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d1d5db',
    padding: 12,
    textAlignVertical: 'top',
    color: '#111827',
    backgroundColor: '#fafafa',
    marginBottom: 10,
  },
  sendButton: {
    backgroundColor: COLORS.brandPrimary,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: '800',
  },
});

