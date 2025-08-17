# Knowledge Base – KillerBaby Backend

## Messaging subsystem

- Purpose: allow players to send either anonymous messages to their current target or direct messages to the group admin (group creator).
- Storage: `messages` table with supporting enums and a trigger to route admin messages.

### Enums
- `message_kind`: `TO_TARGET`, `TO_ADMIN`
- `message_tag`: `DARE_CHANGE_REQUEST`, `DARE_CLARIFICATION`, `GENERAL`, `REPORT`, `OTHER`

### Table: `messages`
- Columns:
  - `id` bigint primary key (identity)
  - `group_id` uuid not null → `groups.id`
  - `sender_player_id` uuid not null → `group_players.id`
  - `created_by_profile_id` uuid not null → `profiles.id`
  - `message_kind` message_kind not null
  - `is_anonymous` boolean not null default false
  - `to_player_id` uuid null → `group_players.id` (required for `TO_TARGET`)
  - `to_profile_id` uuid null → `profiles.id` (auto-set for `TO_ADMIN`)
  - `body` text not null (non-empty)
  - `tags` message_tag[] not null default '{}'
  - `related_assignment_id` bigint null → `assignments.id`
  - `created_at` timestamptz not null default now()
  - `read_at` timestamptz null
  - `resolved_at` timestamptz null
  - `resolution_note` text null
- Constraints and automation:
  - `messages_kind_target_chk` ensures:
    - `TO_TARGET`: `to_player_id` is not null, `is_anonymous = true`, `to_profile_id` is null
    - `TO_ADMIN`: `to_player_id` is null
  - Trigger `trg_set_message_admin_recipient` calls `set_message_admin_recipient()` to set `to_profile_id = groups.created_by` for `TO_ADMIN` on insert.
- Indexes:
  - `ix_messages_group_created_at (group_id, created_at desc)`
  - `ix_messages_to_player (to_player_id)`
  - `ix_messages_sender (sender_player_id)`
  - `ix_messages_kind (message_kind)`
  - `ix_messages_tags` GIN on `(tags)`

### Usage patterns
- Send anonymous message to target:
  - Insert with `message_kind = 'TO_TARGET'`, `is_anonymous = true`, set `to_player_id`, `body`, and any `tags`.
- Send message to admin:
  - Insert with `message_kind = 'TO_ADMIN'`, omit `to_profile_id`; trigger sets it from `groups.created_by`.
- Optional linkage:
  - Use `related_assignment_id` to tie a message to a specific active/historical assignment edge.
- Read/resolve lifecycle:
  - Consumers mark `read_at` when delivered; moderators/admins may set `resolved_at` and optional `resolution_note`.

### RLS (to be implemented)
- Scope rows by `group_id`.
- Allow group members to insert messages in their own group.
- `TO_TARGET` readable by sender, recipient `group_player`, and group admins; `TO_ADMIN` readable by sender and group admin.
- Only admins/moderators can set `resolved_at`.

## Change log
- 2025-08-17: Added `messages` table, enums `message_kind`, `message_tag`, indexes, and trigger for admin routing.
