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

  const disabled = submitting || !hasAssignment || gameStatus === 'ended';

  return (
    <CollapsibleHeader
      title="Mission Briefing"
      subtitle={gameStatus === 'ended' ? 'Game finished' : 'Your target & dare'}
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
              data={[
                { key: 'dare', title: 'Your Dare', value: dareText },
                { key: 'tips', title: 'Play Tips', value: 'Be subtle. Coordinate with allies. Don’t reveal your dare.' },
              ]}
              keyExtractor={(i) => i.key}
              contentContainerStyle={{ paddingTop: contentInsetTop, paddingHorizontal: 16, paddingBottom: 100 }}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor={COLORS.brandPrimary}
                  colors={[COLORS.brandPrimary]}
                />
              }
              ListHeaderComponent={
                <View style={{ marginBottom: 16 }}>
                  {/* Target Card */}
                  <LinearGradient colors={GRADIENTS.brand} style={styles.headerCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={styles.avatar}>
                        {hasAssignment && getInitials(targetName) ? (
                          <Text style={styles.avatarText}>{getInitials(targetName)}</Text>
                        ) : (
                          <Ionicons name="person" size={20} color="#fff" />
                        )}
                      </View>
                      <View style={{ marginLeft: 12, flex: 1 }}>
                        <View style={styles.pillRow}>
                          <Text style={styles.pill}>TARGET</Text>
                          {gameStatus && <Text style={[styles.pill, styles.pillSoft]}>{gameStatus.toUpperCase()}</Text>}
                        </View>
                        <Text style={styles.headerTitle} numberOfLines={1}>
                          {gameStatus === 'ended' ? 'Game ended' : hasAssignment ? targetName : 'Waiting for assignment'}
                        </Text>
                      </View>
                    </View>

                    {/* Actions */}
                    <View style={styles.actionsRow}>
                      <TouchableOpacity onPress={openTargetConversation} style={styles.actionSecondary}>
                        <Ionicons name="chatbubbles-outline" size={18} color={COLORS.brandPrimary} />
                        <Text style={styles.actionSecondaryText}>Message</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        disabled={disabled}
                        onPress={confirmEliminate}
                        style={[styles.actionPrimary, disabled && { opacity: 0.6 }]}
                      >
                        {submitting ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <>
                            <Ionicons name="checkmark-circle" size={18} color="#fff" />
                            <Text style={styles.actionPrimaryText}>{gameStatus === 'ended' ? 'Ended' : 'Confirm Hit'}</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  </LinearGradient>

                  {/* Light notice */}
                  {gameStatus === 'ended' && (
                    <View style={[styles.card, { marginTop: 12 }]}>
                      <Text style={styles.cardTitle}>Winner</Text>
                      <Text style={styles.cardBody}>The game has ended. Congrats to the last remaining assassin!</Text>
                    </View>
                  )}
                </View>
              }
              renderItem={({ item }) => (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.cardBody}>
                    {item.key === 'dare'
                      ? gameStatus === 'ended'
                        ? '—'
                        : hasAssignment
                          ? `“${item.value}”`
                          : '—'
                      : item.value}
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
  headerCard: {
    borderRadius: 16,
    padding: 16,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ffffff33',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 0.3,
  },
  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  pill: {
    backgroundColor: '#ffffff22',
    color: '#fff',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: '700',
    overflow: 'hidden',
  },
  pillSoft: {
    backgroundColor: '#ffffff1a',
    opacity: 0.9,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  actionPrimary: {
    flex: 1,
    backgroundColor: COLORS.brandPrimary,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  actionPrimaryText: {
    color: '#fff',
    fontWeight: '800',
  },
  actionSecondary: {
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.brandPrimary,
  },
  actionSecondaryText: {
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
    shadowColor: '#000',
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
});

