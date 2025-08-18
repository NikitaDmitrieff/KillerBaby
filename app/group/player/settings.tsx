import CollapsibleHeader from '../../../components/CollapsibleHeader';
import { View, Text, Switch, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, TextInput, Alert } from 'react-native';
import { useEffect, useState } from 'react';
import { useGroupsStore } from '../../../state/groups';
import { supabase } from '../../../lib/supabase';
import { COLORS } from '../../../theme/colors';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';

export default function PlayerSettingsScreen() {
  const [notifications, setNotifications] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const { playerId, id: groupId, leaveCurrentGroup } = useGroupsStore();
  const [displayName, setDisplayName] = useState('');
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [groupCode, setGroupCode] = useState<string | null>(null);
  const [loadingGroup, setLoadingGroup] = useState(false);
  const [quitting, setQuitting] = useState(false);
  const router = useRouter();

  async function loadProfile() {
    if (!playerId) return;
    try {
      setLoadingProfile(true);
      const { data, error } = await supabase
        .from('group_players')
        .select('display_name')
        .eq('id', playerId as string)
        .maybeSingle();
      if (error) throw error;
      setDisplayName((data?.display_name as string) || '');
    } catch (e) {
      // noop
    } finally {
      setLoadingProfile(false);
    }
  }

  useEffect(() => {
    loadProfile();
  }, [playerId]);

  async function loadGroupCode() {
    if (!groupId) return;
    try {
      setLoadingGroup(true);
      const { data, error } = await supabase
        .from('groups')
        .select('short_code')
        .eq('id', groupId as string)
        .maybeSingle();
      if (error) throw error;
      setGroupCode((data?.short_code as string) ?? null);
    } catch (e) {
      // noop
    } finally {
      setLoadingGroup(false);
    }
  }

  useEffect(() => {
    loadGroupCode();
  }, [groupId]);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await loadProfile();
    } finally {
      setRefreshing(false);
    }
  }

  async function onSaveDisplayName() {
    const name = displayName.trim();
    if (!playerId || name.length === 0 || savingName) return;
    try {
      setSavingName(true);
      const { error } = await supabase
        .from('group_players')
        .update({ display_name: name })
        .eq('id', playerId as string);
      if (error) throw error;
      Alert.alert('Saved', 'Your username has been updated.');
    } catch (e: any) {
      Alert.alert('Update failed', e?.message ?? 'Could not update username');
    } finally {
      setSavingName(false);
    }
  }

  

  return (
    <CollapsibleHeader
      title={"Settings"}
      subtitle={"Player preferences"}
      isRefreshing={refreshing}
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
          <View style={{ backgroundColor: '#f9f9fb', borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <Text style={{ fontWeight: '800', marginBottom: 8 }}>Profile</Text>
            <View style={{ gap: 8 }}>
              <Text style={{ fontWeight: '700' }}>Username</Text>
              <TextInput
                value={displayName}
                onChangeText={setDisplayName}
                placeholder={loadingProfile ? 'Loading...' : 'Enter a username'}
                autoCapitalize="words"
                style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}
              />
              <TouchableOpacity
                onPress={onSaveDisplayName}
                disabled={savingName || !displayName.trim()}
                style={{
                  backgroundColor: savingName || !displayName.trim() ? '#cbd5e1' : COLORS.brandPrimary,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderRadius: 12,
                  alignItems: 'center',
                }}
              >
                {savingName ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: '#fff', fontWeight: '800' }}>Save username</Text>
                )}
              </TouchableOpacity>
            </View>

            
          </View>

          <View style={{ backgroundColor: '#f9f9fb', borderRadius: 12, padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '700' }}>Notifications</Text>
              <Switch value={notifications} onValueChange={setNotifications} />
            </View>
            <Text style={{ color: '#6b7280', marginTop: 8 }}>Get updates when eliminations happen.</Text>
          </View>

          <View style={{ backgroundColor: '#f9f9fb', borderRadius: 12, padding: 16, marginTop: 16 }}>
            <Text style={{ fontWeight: '800', marginBottom: 8 }}>Invite</Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#6b7280' }}>Share this code to let others join your group.</Text>
              </View>
              <View style={{ minWidth: 120, alignItems: 'flex-end' }}>
                {loadingGroup ? (
                  <ActivityIndicator />
                ) : (
                  <Text style={{ fontWeight: '900', fontSize: 28, letterSpacing: 2 }}>{groupCode ?? '—'}</Text>
                )}
              </View>
            </View>
            <TouchableOpacity
              onPress={async () => {
                if (!groupCode) return;
                try {
                  await Clipboard.setStringAsync(groupCode);
                  Alert.alert('Copied', 'Group code copied to clipboard');
                } catch (e) {
                  Alert.alert('Copy failed', 'Could not access clipboard');
                }
              }}
              disabled={!groupCode}
              style={{
                marginTop: 12,
                backgroundColor: groupCode ? COLORS.brandPrimary : '#cbd5e1',
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderRadius: 12,
                alignItems: 'center',
                alignSelf: 'stretch',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '800' }}>Copy code</Text>
            </TouchableOpacity>
          </View>

          <View style={{ backgroundColor: '#fff1f2', borderRadius: 12, padding: 16, marginTop: 24, borderWidth: 1, borderColor: '#fecdd3' }}>
            <Text style={{ fontWeight: '800', marginBottom: 8, color: '#7f1d1d' }}>Danger zone</Text>
            <Text style={{ color: '#7f1d1d' }}>Quitting removes you from this group. If a game is active, your removal may affect the ring and might require admin permissions.</Text>
            <TouchableOpacity
              onPress={() => {
                if (quitting) return;
                Alert.alert(
                  'Quit group?',
                  'You will lose access to this group on this device. If a game is active, we will attempt to remove you from the ring.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Quit',
                      style: 'destructive',
                      onPress: async () => {
                        try {
                          setQuitting(true);
                          if (!groupId) {
                            await leaveCurrentGroup();
                            router.replace('/');
                            return;
                          }
                          // Determine current game status
                          const { data: g } = await supabase
                            .from('groups')
                            .select('game_status')
                            .eq('id', groupId as string)
                            .maybeSingle();
                          const status = (g?.game_status as string | null) ?? null;
                          if (status === 'active' && playerId) {
                            const { data: userRes } = await supabase.auth.getUser();
                            const profileId = userRes?.user?.id as string | undefined;
                            try {
                              if (!profileId) throw new Error('Missing session');
                              const { error: rpcErr } = await supabase.rpc('remove_member_from_ring', {
                                p_group_id: groupId as string,
                                p_removed_player_id: playerId as string,
                                p_moderator_profile_id: profileId,
                              });
                              if (rpcErr) throw rpcErr;
                            } catch (e: any) {
                              const msg = e?.message ?? 'Ask the group admin to remove you during an active game.';
                              setTimeout(() => Alert.alert('Quit failed', msg), 300);
                              return;
                            }
                          } else if (playerId) {
                            // Mark inactive if game not active
                            await supabase
                              .from('group_players')
                              .update({ is_active: false, removed_at: new Date().toISOString() })
                              .eq('id', playerId as string);
                          }
                          await leaveCurrentGroup();
                          router.replace('/');
                        } catch (e: any) {
                          const msg = e?.message ?? 'Could not quit group';
                          setTimeout(() => Alert.alert('Quit failed', msg), 300);
                        } finally {
                          setQuitting(false);
                        }
                      },
                    },
                  ]
                );
              }}
              disabled={quitting}
              style={{
                marginTop: 12,
                backgroundColor: quitting ? '#fca5a5' : '#ef4444',
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderRadius: 12,
                alignItems: 'center',
                alignSelf: 'stretch',
              }}
            >
              {quitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: '#fff', fontWeight: '800' }}>Quit group</Text>
              )}
            </TouchableOpacity>
          </View>

        </ScrollView>
      )}
    />
  );
}


