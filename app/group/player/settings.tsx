import CollapsibleHeader, { CollapsibleHeaderAccessory } from '../../../components/CollapsibleHeader';
import { View, Text, Switch, ScrollView, RefreshControl } from 'react-native';
import { useState } from 'react';
import RoleToggle from '../role-toggle';

export default function PlayerSettingsScreen() {
  const [notifications, setNotifications] = useState(true);
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


