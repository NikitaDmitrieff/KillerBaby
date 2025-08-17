import ConversationInbox from '../../../../components/ConversationInbox';

export default function PlayerInboxScreen() {
  return (
    <ConversationInbox mode="player" title="Messages" subtitle="Your conversations" conversationBasePath="/group/player/conversation" />
  );
}


