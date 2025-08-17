import CollapsibleHeader, { CollapsibleHeaderAccessory } from '../../../components/CollapsibleHeader';
import { View, Text, Switch, ScrollView, RefreshControl, TouchableOpacity, Alert } from 'react-native';
import { useState } from 'react';
import RoleToggle from '../role-toggle';
import { useGroupsStore } from '../../../state/groups';
import * as Clipboard from 'expo-clipboard';
import { COLORS } from '../../../theme/colors';

export default function AdminSettingsScreen() {
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const { id: groupId } = useGroupsStore();

  async function onRefresh() {
    setRefreshing(true);
    try {
      await new Promise(res => setTimeout(res, 300));
    } finally {
      setRefreshing(false);
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
      subtitle={"Group configuration"}
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
          <View style={{ backgroundColor: '#f9f9fb', borderRadius: 12, padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '700' }}>Auto-advance on elimination</Text>
              <Switch value={autoAdvance} onValueChange={setAutoAdvance} />
            </View>
            <Text style={{ color: '#6b7280', marginTop: 8 }}>When enabled, a hunter automatically inherits their target's dare.</Text>
          </View>

          <View style={{ backgroundColor: '#f9f9fb', borderRadius: 12, padding: 16, marginTop: 16 }}>
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
        </ScrollView>
      )}
    />
  );
}


