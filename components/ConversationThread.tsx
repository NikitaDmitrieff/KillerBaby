import React from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, RefreshControl, NativeSyntheticEvent, TextInputSubmitEditingEventData, TextInputKeyPressEventData } from 'react-native';
import { COLORS } from '../theme/colors';

type ConversationThreadProps = {
  messages: any[];
  body: string;
  onChangeBody: (text: string) => void;
  sending: boolean;
  onSend: () => void | Promise<void>;
  contentInsetTop: number;
  onScroll: any;
  scrollRef: any;
  refreshing: boolean;
  onRefresh: () => void | Promise<void>;
  isMine: (message: any) => boolean;
};

export default function ConversationThread(props: ConversationThreadProps) {
  const {
    messages,
    body,
    onChangeBody,
    sending,
    onSend,
    contentInsetTop,
    onScroll,
    scrollRef,
    refreshing,
    onRefresh,
    isMine,
  } = props;

  const handleSubmitEditing = (_e: NativeSyntheticEvent<TextInputSubmitEditingEventData>) => {
    if (sending || !body.trim()) return;
    onSend();
  };

  const handleKeyPress = (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    // For web support: send on Enter
    if (e?.nativeEvent?.key === 'Enter') {
      if (sending || !body.trim()) return;
      e.preventDefault?.();
      onSend();
    }
  };

  return (
    <FlatList
      ref={scrollRef as any}
      onScroll={onScroll}
      scrollEventThrottle={16}
      data={messages}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={{ paddingTop: contentInsetTop + 56, paddingHorizontal: 16, paddingBottom: 100 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#9d0208" colors={["#9d0208"]} />
      }
      renderItem={({ item }) => {
        const mine = isMine(item);
        return (
          <View style={{ marginVertical: 6, alignItems: mine ? 'flex-end' : 'flex-start' }}>
            <View style={{ maxWidth: '80%', backgroundColor: mine ? COLORS.brandPrimary : '#f3f4f6', borderRadius: 12, padding: 10 }}>
              <Text style={{ color: mine ? '#fff' : '#111827' }}>{item.body}</Text>
              <Text style={{ color: mine ? '#ffffffaa' : '#6b7280', fontSize: 10, marginTop: 4 }}>{new Date(item.created_at).toLocaleTimeString()}</Text>
            </View>
          </View>
        );
      }}
      ListFooterComponent={
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <TextInput
            value={body}
            onChangeText={onChangeBody}
            onSubmitEditing={handleSubmitEditing}
            onKeyPress={handleKeyPress}
            returnKeyType="send"
            placeholder="Type a message…"
            placeholderTextColor="#9ca3af"
            blurOnSubmit={false}
            editable={!sending}
            style={{ flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff' }}
          />
          <TouchableOpacity
            onPress={onSend}
            disabled={sending || !body.trim()}
            style={{ backgroundColor: COLORS.brandPrimary, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', opacity: sending || !body.trim() ? 0.6 : 1 }}
          >
            <Text style={{ color: '#fff', fontWeight: '800' }}>Send</Text>
          </TouchableOpacity>
        </View>
      }
    />
  );
}


