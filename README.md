# KillerBaby – Social Elimination Game (Frontend)

KillerBaby is a playful social elimination game. Each player is secretly assigned a target and a dare. When you complete the dare on your target, you “eliminate” them, inherit their dare, and start hunting their next victim. The last player remaining wins.

## How the app flows

- Groups list: After onboarding, you land on a page showing the groups you belong to. Pick one to scope the experience to that group.
- Group panel: Once a group is selected, you see a group-specific tab bar. There are two panels:
  - Player panel: focused on your assignment, the group feed, and personal settings.
  - Admin panel: focused on assignments overview, players statuses, and group settings.
- For now (frontend-only), a toggle in the header lets testers switch between Player/Admin panels manually.

## Navigation

- `app/index.tsx`: Groups list with search and quick actions. Selecting a group navigates to `app/group`.
- `app/group/index.tsx`: A small router that redirects to player or admin tabs depending on the stored role mode.
- `app/group/player/_layout.tsx`: Tabs layout for the player panel.
  - `assignment`: Your current target and dare.
  - `feed`: Group events (eliminations, joins, etc.).
  - `settings`: Player preferences.
- `app/group/admin/_layout.tsx`: Tabs layout for the admin panel.
  - `assignments`: Overview and actions on who hunts whom and their dares.
  - `players`: Players list with status.
  - `settings`: Group-level configuration.

Both panel headers use a collapsible gradient header (`components/CollapsibleHeader.tsx`). Tab bars use a floating style (`components/FloatingTabBar.tsx`). A back FAB takes you to the groups list; a right FAB is reserved for creation actions.

## Tester role toggle

- The current “role mode” (`player` or `admin`) is persisted locally in AsyncStorage.
- Use the header toggle in any group screen to switch between roles instantly.

## Tech Notes

- State: `zustand` store in `state/groups.ts` holds selected group info and role mode.
- Supabase: Only auth and basic group membership reads are wired. The group UI screens are placeholder-only for now.
- Styling: Lightweight inline styles and a simple brand color in `theme/colors.ts`.

## Next steps (backend integration outline)

- Player panel: load and subscribe to assignment and feed events per group.
- Admin panel: read and mutate assignments, player statuses, and group rules with RLS policies.
- Replace the manual role toggle with real admin checks against group membership/role in the database.

## Backend (Supabase) – Implemented

- Tables
  - `groups`: added `game_status`, `started_at`, `ended_at`
  - `group_players`: added `is_active`, `removed_at`
  - `assignments`: new core table `assassin_player_id -> target_player_id` with `dare_text` and lifecycle
  - `dare_templates`: optional, reusable dares per group
  - `messages`: in-group messages; either anonymous to your target or directed to the group admin (creator). Supports player senders via `sender_player_id` and admin senders via `sender_profile_id`.
- Indexes
  - `ux_assignments_active_out`: unique `(group_id, assassin_player_id)` where `is_active`
  - `ux_assignments_active_in`: unique `(group_id, target_player_id)` where `is_active`
  - `ix_assignments_group_active`: `(group_id, is_active, created_at desc)`
  - `messages`: `ix_messages_group_created_at (group_id, created_at desc)`, `ix_messages_to_player (to_player_id)`, `ix_messages_sender (sender_player_id)`, `ix_messages_kind (message_kind)`, `ix_messages_tags` GIN on `(tags)`
- Functions (RPC)
  - `assert_perfect_ring(p_group_id)` -> boolean
  - `start_game_seed_ring(p_group_id, uuid[], uuid[], text[], p_created_by_profile_id)` -> int
  - `reseed_active_ring(p_group_id, uuid[], uuid[], text[], p_created_by_profile_id)` -> int
  - `eliminate_player(p_group_id, p_assassin_player_id, p_created_by_profile_id)` -> bigint
  - `remove_member_from_ring(p_group_id, p_removed_player_id, p_moderator_profile_id)` -> bigint
  - `edit_active_dare(p_group_id, p_assassin_player_id, p_new_dare_text)` -> int
  - `get_current_target(p_group_id, p_assassin_player_id)` -> table
  - `get_current_hunter(p_group_id, p_target_player_id)` -> table
  - `get_active_players(p_group_id)` -> table

## Database schema and invariants

- **Tables**
  - **`groups`**: root entity for a match. Columns include `id`, `name`, `description`, `join_code` (unique), `created_by` (FK → `profiles.id`), `created_at`, and lifecycle fields `game_status`, `started_at`, `ended_at`.
    - New: optional `deadline_at timestamptz` for game/phase deadline (UTC). Indexed by `ix_groups_deadline_at`.
  - **`group_players`**: membership of profiles in a group. Columns include `id`, `group_id` (FK), `display_name`, `owner_user_id` (FK → `profiles.id`, nullable), `created_at`, `is_active`, `removed_at`.
  - **`assignments`**: the ring edges. Columns include `id`, `group_id` (FK), `assassin_player_id` (FK → `group_players.id`), `target_player_id` (FK → `group_players.id`), `dare_text`, `is_active`, `reason_closed`, `created_at`, `created_by_profile_id` (FK → `profiles.id`), `closed_at`, `replaced_by_assignment_id` (self-FK).
  - **`dare_templates`**: optional, reusable prompts per group. Columns include `id`, `group_id` (FK), `text`, `is_active`, `created_by_profile_id` (FK), `created_at`, `updated_at`.
  - **`messages`**: player-to-player/admin communications. Columns include `id`, `group_id` (FK), `sender_player_id` (FK → `group_players.id`, nullable), `sender_profile_id` (FK → `profiles.id`, nullable), `created_by_profile_id` (FK → `profiles.id`, NOT NULL), `message_kind` (`TO_TARGET`, `TO_ADMIN`, `ADMIN_TO_PLAYER`), `is_anonymous`, `to_player_id` (FK when addressing a player), `to_profile_id` (FK when addressing the admin; auto-set for `TO_ADMIN`), `body` (text), `tags` (`message_tag[]`), `related_assignment_id` (FK → `assignments.id`), `created_at`, `read_at`, `resolved_at`, `resolution_note`, `conversation_id` (FK → `conversations.id`).

- **Relationships (FKs)**
  - `assignments.group_id` → `groups.id`
  - `assignments.assassin_player_id` → `group_players.id`
  - `assignments.target_player_id` → `group_players.id`
  - `assignments.created_by_profile_id` → `profiles.id`
  - `assignments.replaced_by_assignment_id` → `assignments.id`
  - `group_players.group_id` → `groups.id`
  - `group_players.owner_user_id` → `profiles.id`
  - `groups.created_by` → `profiles.id`
  - `dare_templates.group_id` → `groups.id`, `dare_templates.created_by_profile_id` → `profiles.id`
  - `messages.group_id` → `groups.id`; `messages.sender_player_id` → `group_players.id`; `messages.created_by_profile_id` → `profiles.id`; `messages.to_player_id` → `group_players.id`; `messages.to_profile_id` → `profiles.id`; `messages.related_assignment_id` → `assignments.id`

- **Indexes and constraints**
  - `assignments`: primary key on `id`; `ux_assignments_active_out` unique `(group_id, assassin_player_id)` where `is_active`; `ux_assignments_active_in` unique `(group_id, target_player_id)` where `is_active`; `ix_assignments_group_active` on `(group_id, is_active, created_at desc)`.
  - `group_players`: primary key on `id`; `group_players_unique_display_name_per_group` unique `(group_id, lower(display_name))`; `group_players_one_per_user_per_group` unique `(group_id, owner_user_id)` where `owner_user_id is not null`.
  - `groups`: primary key on `id`; `groups_join_code_key` unique on `join_code`.
  - `dare_templates`: primary key on `id`; `ix_dare_templates_group` on `(group_id, is_active)`.
  - `messages`: primary key on `id`; checks enforce shapes per kind:
    - `TO_ADMIN`: player → admin. Requires `sender_player_id` set, `sender_profile_id` null, `to_player_id` null.
    - `ADMIN_TO_PLAYER`: admin → player. Requires `sender_profile_id` set, `sender_player_id` null, `to_player_id` set.
    - `TO_TARGET`: hunter → target. Requires `sender_player_id` set, `sender_profile_id` null, `to_player_id` set, `to_profile_id` null, `is_anonymous=true`.
    - Trigger `trg_set_message_admin_recipient` sets `to_profile_id` from `groups.created_by` for `TO_ADMIN` messages.
  - `conversations`: check enforces shape per kind:
    - `PLAYER_ADMIN`: `player_id` and `admin_profile_id` set; `target_player_id` null.
    - `PLAYER_TARGET`: `player_id` and `target_player_id` set; `admin_profile_id` null.

- **Enums**
  - `message_kind`: `TO_TARGET`, `TO_ADMIN`
  - `message_tag`: `DARE_CHANGE_REQUEST`, `DARE_CLARIFICATION`, `GENERAL`, `REPORT`, `OTHER`

## Messaging and Conversations

Conversations are stored in a `conversations` table (backend). There are two kinds (enum `conversation_kind`):

- `PLAYER_ADMIN`: direct chat between a player and the admin.
- `PLAYER_TARGET`: chat between a hunter (player) and their current target.

Frontend behaviors:

- Player inbox shows:
  - Their `PLAYER_ADMIN` thread (title: “Admin”).
  - `PLAYER_TARGET` threads where they are the hunter (title: the target’s display name).
  - `PLAYER_TARGET` threads where they are the target (title: “Hunter”).
- Admin inbox shows all `PLAYER_ADMIN` threads (title: the player’s display name).

Sending messages:

- In `PLAYER_ADMIN` conversations:
  - Player → Admin: insert into `messages` with `message_kind='TO_ADMIN'` (trigger sets `to_profile_id` = `groups.created_by`). Use `sender_player_id` and leave `sender_profile_id` null.
  - Admin → Player: insert into `messages` with `message_kind='ADMIN_TO_PLAYER'`. Use `sender_profile_id` and leave `sender_player_id` null.
- In `PLAYER_TARGET` conversations:
  - Hunter → Target: insert into `messages` with `message_kind='TO_TARGET'`, `is_anonymous=true`, and set `to_player_id` to the target player.

Read state:

- Admin views mark admin-addressed messages as read (`to_profile_id` = admin).
- Player views mark player-addressed messages as read (`to_player_id` = their `group_players.id`).

- **Ring model (how it works)**
  - Active gameplay is represented by active rows in `assignments` such that every active player appears exactly once as an assassin and exactly once as a target within a `group_id`.
  - The two partial unique indexes on `assignments` enforce this permutation property for active rows and prevent duplicates.
  - Seeding a game creates one active row per player forming a closed cycle; each row carries an initial `dare_text`.
  - Eliminating a target closes the assassin’s current row (`is_active` → false, `closed_at`/`reason_closed` set) and creates a new row that links the assassin to the eliminated target’s target, carrying forward or setting a new `dare_text`. The old row’s `replaced_by_assignment_id` references the new row.

- **RPCs (what to call and when)**
  - `start_game_seed_ring(...)`: create the initial ring from aligned arrays of assassins, targets, and dares.
  - `reseed_active_ring(...)`: close all active assignments for the group and seed a new ring from the provided arrays.
  - `eliminate_player(...)`: perform elimination, rewiring the ring and closing historical rows.
  - `remove_member_from_ring(...)`: remove a member and rewire the ring accordingly.
  - `edit_active_dare(...)`: update the `dare_text` for an assassin’s current active assignment.
  - `get_active_players(...)`: list active `group_players` for UI-building.
  - `get_current_target(...)` / `get_current_hunter(...)`: convenience lookups for a single edge.
  - `assert_perfect_ring(...)`: returns a boolean if active rows form a valid permutation (one-in/one-out) within the group.

- **Security (RLS)**
  - Row Level Security policies are not yet defined in this project. Until RLS is added, reads/writes are controlled at the RPC layer and by service role keys during development.
  - Recommended next steps:
    - Add RLS policies to `groups`, `group_players`, `assignments`, `dare_templates`, and `messages` to scope access to members of a `group_id`.
    - Restrict mutation RPCs (`start_game_seed_ring`, `eliminate_player`, `remove_member_from_ring`, `edit_active_dare`) to group admins/moderators.
    - Expose safe read RPCs (`get_active_players`, `get_current_target`, `get_current_hunter`) to group members.
    - Messages RLS idea: allow group members to insert messages within their `group_id`; `TO_TARGET` messages readable by the sender, the addressed `to_player_id`, and group admins; `TO_ADMIN` messages readable by the sender and the group admin; only admins can mark `resolved_at`.

Cookbook (DB-side)
- Start ring: compute equal-length arrays for assassins, targets, dares; call `start_game_seed_ring`.
- Reseed ring (overwrite active): call `reseed_active_ring(groupId, assassins[], targets[], dares[], createdByProfileId)`.
- Kill: call `eliminate_player(groupId, assassinPlayerId, createdByProfileId)`.
- Remove member: call `remove_member_from_ring(groupId, removedPlayerId, moderatorProfileId)`.
- Edit dare: call `edit_active_dare(groupId, assassinPlayerId, newText)`.
- Check integrity: `select assert_perfect_ring(groupId)`.
- Send anonymous message to your target: insert into `messages` with `message_kind='TO_TARGET'`, `is_anonymous=true`, `to_player_id=<target_player_id>`, set `tags` as needed.
- Send a message to the admin: insert into `messages` with `message_kind='TO_ADMIN'`; `to_profile_id` is auto-populated from `groups.created_by` by trigger. Use `sender_player_id`.
- Admin replies to a player: insert into `messages` with `message_kind='ADMIN_TO_PLAYER'`; set `sender_profile_id` = admin, `to_player_id` = player.
