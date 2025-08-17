import { Slot, Stack } from 'expo-router';

export default function GroupRootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="player" />
      <Stack.Screen name="admin" />
    </Stack>
  );
}


