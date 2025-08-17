import { Slot, Stack } from 'expo-router';

export default function GroupRootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="player" />
      <Stack.Screen name="admin" />
      <Stack.Screen name="create" options={{ presentation: 'modal' }} />
      <Stack.Screen name="join-code" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
    </Stack>
  );
}


