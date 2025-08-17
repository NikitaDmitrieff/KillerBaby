import CollapsibleHeader, { CollapsibleHeaderAccessory } from '../../../components/CollapsibleHeader';
import { View, Text, Switch, ScrollView, RefreshControl } from 'react-native';
import { useState } from 'react';
import RoleToggle from '../role-toggle';

export default function AdminSettingsScreen() {
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function onRefresh() {
    setRefreshing(true);
    // Simulate settings refresh - in a real app, you might fetch current settings from server
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
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
        </ScrollView>
      )}
    />
  );
}


