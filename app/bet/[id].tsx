import { useLocalSearchParams, router } from 'expo-router';
import { View, Text, TouchableOpacity } from 'react-native';

export default function BetDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <Text style={{ fontSize: 18, fontWeight: '700' }}>Bet {id}</Text>
      <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16, padding: 12, backgroundColor: '#eee', borderRadius: 8 }}>
        <Text>Back</Text>
      </TouchableOpacity>
    </View>
  );
}


