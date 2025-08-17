import CollapsibleHeader, { CollapsibleHeaderAccessory } from '../../../components/CollapsibleHeader';
import { View, Text, Switch, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, TextInput, Alert } from 'react-native';
import { useEffect, useState } from 'react';
import RoleToggle from '../role-toggle';
import { useGroupsStore } from '../../../state/groups';
import { supabase } from '../../../lib/supabase';
import * as Clipboard from 'expo-clipboard';
import { COLORS } from '../../../theme/colors';

export default function PlayerSettingsScreen() {
  const [notifications, setNotifications] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const { id: groupId, playerId } = useGroupsStore();
  const [displayName, setDisplayName] = useState('');
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [savingName, setSavingName] = useState(false);

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

  async function onCopyGroupId() {
    if (!groupId) return;
    try {
      await Clipboard.setStringAsync(groupId);
      Alert.alert('Copied', 'Group ID copied to clipboard.');
    } catch (e) {
      Alert.alert('Copy failed', 'Could not copy group ID.');
    }
  }

  return (
    <CollapsibleHeader
      title={"Settings"}
      subtitle={"Player preferences"}
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

            <View style={{ height: 16 }} />

            <Text style={{ fontWeight: '700' }}>Invite friends</Text>
            <Text style={{ color: '#6b7280', marginTop: 4 }}>Share this group ID for others to join:</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
              <View style={{ flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}>
                <Text numberOfLines={1} style={{ color: '#111827' }}>{groupId ?? '—'}</Text>
              </View>
              <View style={{ width: 8 }} />
              <TouchableOpacity
                onPress={onCopyGroupId}
                disabled={!groupId}
                style={{ backgroundColor: groupId ? COLORS.brandPrimary : '#cbd5e1', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12 }}
              >
                <Text style={{ color: '#fff', fontWeight: '800' }}>Copy</Text>
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

        </ScrollView>
      )}
    />
  );
}


