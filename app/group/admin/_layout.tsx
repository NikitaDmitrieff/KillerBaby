import { Tabs } from 'expo-router';
import FloatingTabBar from '../../../components/FloatingTabBar';

export default function AdminGroupLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <FloatingTabBar {...props} />}> 
      <Tabs.Screen name="assignments" options={{ title: 'Assignments' }} />
      <Tabs.Screen name="players" options={{ title: 'Players' }} />
      <Tabs.Screen name="conversation" options={{ title: 'Messages' }} />
      {/* Hidden but reachable via FAB */}
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}


