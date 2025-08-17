import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';

export default function GroupJoinCodeScreen() {
  const [code, setCode] = useState('');
  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: '800', marginBottom: 12 }}>Join a group</Text>
      <TextInput value={code} onChangeText={setCode} placeholder="Enter code" style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12 }} />
      <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16, padding: 12, backgroundColor: '#eee', borderRadius: 8, alignItems: 'center' }}>
        <Text>Close</Text>
      </TouchableOpacity>
    </View>
  );
}


