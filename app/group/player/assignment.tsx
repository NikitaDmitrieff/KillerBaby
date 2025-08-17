import CollapsibleHeader, { CollapsibleHeaderAccessory } from '../../../components/CollapsibleHeader';
import { View, Text, FlatList, ActivityIndicator, TouchableOpacity, Alert, StyleSheet, RefreshControl } from 'react-native';
import RoleToggle from '../role-toggle';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useGroupsStore } from '../../../state/groups';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, GRADIENTS } from '../../../theme/colors';
import { router } from 'expo-router';

export default function PlayerAssignmentScreen() {
  const { id: groupId, playerId } = useGroupsStore();
  const [loading, setLoading] = useState(true);
  const [targetName, setTargetName] = useState('—');
  const [dareText, setDareText] = useState('—');
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [targetPlayerId, setTargetPlayerId] = useState<string | null>(null);
  const [gameStatus, setGameStatus] = useState<'setup' | 'active' | 'ended' | null>(null);

  const hasAssignment = useMemo(() => targetName !== '—' && dareText !== '—', [targetName, dareText]);
  

  async function loadAssignment() {
    if (!groupId || !playerId) return;
    try {
      setLoading(true);
      // Fetch group status in parallel
      const [{ data: groupRow }, { data }] = await Promise.all([
        supabase.from('groups').select('game_status').eq('id', groupId).single(),
        supabase.rpc('get_current_target', {
          p_group_id: groupId,
          p_assassin_player_id: playerId,
        }),
      ]);
      const status = (groupRow as any)?.game_status as 'setup' | 'active' | 'ended' | undefined;
      setGameStatus(status ?? null);
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
      const { data: userResult } = await supabase.auth.getUser();
      const createdByProfileId = userResult?.user?.id ?? null;
      await supabase.rpc('eliminate_player', {
        p_group_id: groupId,
        p_assassin_player_id: playerId,
        p_created_by_profile_id: createdByProfileId,
      });
      await loadAssignment();
      Alert.alert('Success', 'Elimination recorded.');
    } catch (e: any) {
      Alert.alert('Action failed', e?.message ?? 'Could not complete elimination');
    } finally {
      setSubmitting(false);
    }
  }

  function confirmEliminate() {
    if (!hasAssignment || submitting || gameStatus === 'ended') return;
    Alert.alert(
      'Confirm elimination',
      `Mark ${targetName || 'your target'} as eliminated?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Yes, confirm', style: 'destructive', onPress: handleEliminate },
      ]
    );
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

  async function openTargetConversation() {
    if (!groupId || !playerId || !targetPlayerId) {
      router.navigate('/group/player/conversation');
      return;
    }
    try {
      const { data: existing, error: findErr } = await supabase
        .from('conversations')
        .select('id')
        .eq('group_id', groupId)
        .eq('conversation_kind', 'PLAYER_TARGET')
        .eq('player_id', playerId)
        .eq('target_player_id', targetPlayerId)
        .limit(1);
      if (findErr) throw findErr;
      let convoId: number | null = (existing && existing[0]?.id) ? existing[0].id : null;

      if (!convoId) {
        const { data: created, error: createErr } = await supabase
          .from('conversations')
          .insert([{ group_id: groupId, conversation_kind: 'PLAYER_TARGET', player_id: playerId, target_player_id: targetPlayerId }])
          .select('id')
          .single();
        if (createErr) throw createErr;
        convoId = created?.id ?? null;
      }

      if (convoId) {
        router.push(`/group/player/conversation/${convoId}`);
      } else {
        router.navigate('/group/player/conversation');
      }
    } catch (e: any) {
      Alert.alert('Unable to open chat', e?.message ?? 'Please try again later');
      router.navigate('/group/player/conversation');
    }
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
                        <Text style={styles.heroTitle} numberOfLines={1}>
                          {gameStatus === 'ended' ? 'Game ended' : (hasAssignment ? targetName : 'Waiting for assignment')}
                        </Text>
                      </View>
                    </View>
                  </LinearGradient>

                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                    <TouchableOpacity
                      onPress={openTargetConversation}
                      style={styles.secondaryButton}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Ionicons name="chatbubbles-outline" size={18} color={COLORS.brandPrimary} />
                        <Text style={styles.secondaryButtonText}>Message</Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                      disabled={submitting || !hasAssignment || gameStatus === 'ended'}
                      onPress={confirmEliminate}
                      style={[styles.primaryButton, { opacity: (submitting || !hasAssignment || gameStatus === 'ended') ? 0.6 : 1 }]}
                    >
                      {submitting ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Ionicons name="checkmark-circle" size={18} color="#fff" />
                          <Text style={styles.primaryButtonText}>{gameStatus === 'ended' ? 'Ended' : 'Eliminated'}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  </View>

                  {gameStatus === 'ended' && (
                    <View style={[styles.card, { marginTop: 12 }]}> 
                      <Text style={styles.cardTitle}>Winner</Text>
                      <Text style={styles.cardBody}>The game has ended. Congrats to the last remaining assassin!</Text>
                    </View>
                  )}
                </View>
              )}
              renderItem={({ item }) => (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.cardBody}>
                    {gameStatus === 'ended' ? '—' : (hasAssignment ? `“${item.value}”` : '—')}
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
  secondaryButton: {
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.brandPrimary,
  },
  secondaryButtonText: {
    color: COLORS.brandPrimary,
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

