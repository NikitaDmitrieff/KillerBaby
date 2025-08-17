import CollapsibleHeader, { CollapsibleHeaderAccessory } from '../../../components/CollapsibleHeader';
import { View, Text, FlatList, ActivityIndicator, TouchableOpacity, Alert, StyleSheet, RefreshControl } from 'react-native';
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
  const hasAssignment = useMemo(() => targetName !== '—' && dareText !== '—', [targetName, dareText]);

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
      } else {
        setTargetName('—');
        setDareText('—');
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

  async function onRefresh() {
    setRefreshing(true);
    try {
      await loadAssignment();
    } finally {
      setRefreshing(false);
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
                        <Ionicons name="person" size={22} color="#fff" />
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
                    <TouchableOpacity onPress={loadAssignment} style={styles.secondaryButton}>
                      <Ionicons name="refresh" size={18} color="#111827" />
                      <Text style={styles.secondaryButtonText}>Refresh</Text>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#e5e7eb',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
  },
  secondaryButtonText: {
    color: '#111827',
    fontWeight: '800',
    marginLeft: 4,
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
});

