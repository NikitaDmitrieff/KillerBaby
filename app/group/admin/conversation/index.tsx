import ConversationInbox from '../../../../components/ConversationInbox';

export default function AdminInboxScreen() {
  return (
    <ConversationInbox mode="admin" title="Messages" subtitle="Player conversations" conversationBasePath="/group/admin/conversation" />
  );
}


