import { Tabs } from 'expo-router';
import FloatingTabBar from '../../../components/FloatingTabBar';

export default function PlayerGroupLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <FloatingTabBar {...props} />}> 
      <Tabs.Screen name="assignment" options={{ title: 'Assignment' }} />
      <Tabs.Screen name="feed" options={{ title: 'Group' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}


