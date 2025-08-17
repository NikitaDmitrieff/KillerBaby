# Knowledge Base – KillerBaby Backend

## Messaging subsystem

- Purpose: allow players to send either anonymous messages to their current target or direct messages to the group admin (group creator).
- Storage: `messages` table with supporting enums and a trigger to route admin messages.

### Enums
- `message_kind`: `TO_TARGET`, `TO_ADMIN`, `ADMIN_TO_PLAYER`
- `message_tag`: `DARE_CHANGE_REQUEST`, `DARE_CLARIFICATION`, `GENERAL`, `REPORT`, `OTHER`

### Table: `messages`
- Columns:
  - `id` bigint primary key (identity)
  - `group_id` uuid not null → `groups.id`
  - `sender_player_id` uuid null → `group_players.id`
  - `sender_profile_id` uuid null → `profiles.id`
  - `created_by_profile_id` uuid not null → `profiles.id`
  - `message_kind` message_kind not null
  - `is_anonymous` boolean not null default false
  - `to_player_id` uuid null → `group_players.id`
  - `to_profile_id` uuid null → `profiles.id`
  - `body` text not null (non-empty)
  - `tags` message_tag[] not null default '{}'
  - `related_assignment_id` bigint null → `assignments.id`
  - `conversation_id` bigint null → `conversations.id`
  - `created_at` timestamptz not null default now()
  - `read_at` timestamptz null
  - `resolved_at` timestamptz null
  - `resolution_note` text null
- Constraints and automation:
  - Per-kind checks:
    - `TO_ADMIN`: player → admin. Requires `sender_player_id` set, `sender_profile_id` null, `to_player_id` null.
    - `ADMIN_TO_PLAYER`: admin → player. Requires `sender_profile_id` set, `sender_player_id` null, `to_player_id` set.
    - `TO_TARGET`: hunter → target. Requires `sender_player_id` set, `sender_profile_id` null, `to_player_id` set, `to_profile_id` null, `is_anonymous = true`.
  - Trigger `trg_set_message_admin_recipient` sets `to_profile_id = groups.created_by` for `TO_ADMIN` on insert.
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
  - Insert with `message_kind = 'TO_ADMIN'`, omit `to_profile_id`; trigger sets it from `groups.created_by`. Use `sender_player_id`, set `created_by_profile_id` to the sender's profile id.
- Admin reply to a player:
  - Insert with `message_kind = 'ADMIN_TO_PLAYER'`; set `sender_profile_id` to admin's profile id, `to_player_id` to the player's `group_players.id`, and `created_by_profile_id` to admin's profile id.
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
- 2025-08-17: Seeded default `dare_templates` for all existing groups and added an insert trigger so new groups auto-populate ~44 default dares. Idempotent seeding avoids duplicates by matching on lowercase `text` per `group_id`.
- 2025-08-17: Implemented elimination flow: `eliminate_player(p_group_id, p_assassin_player_id, p_created_by_profile_id)` closes the assassin's and victim's active edges (`reason_closed='kill'`, `closed_at=now()`), inserts a new edge that rewires to the victim's target and carries forward the dare, and sets `replaced_by_assignment_id` on the two closed rows.
- 2025-08-17: Added `group_players.is_dead` boolean. `eliminate_player` now marks the victim `is_dead=true`, `is_active=false`, sets `removed_at` if missing. `start_game_seed_ring`/`reseed_active_ring` reset `is_dead=false` for participants. `get_active_players` now excludes dead players.
- 2025-08-17: Fixed `remove_member_from_ring(p_group_id, p_removed_player_id, p_moderator_profile_id)` to: close both active edges involving the removed member before inserting the replacement edge (satisfies unique active constraints), handle the 2-player end-game case by ending the game without inserting a new edge when the hunter equals the removed member's target, link history via `replaced_by_assignment_id`, and set the member's `group_players.is_active=false` and `removed_at`.
- 2025-08-17: Added new default dare "Ask what superpower they would pick for one day." to `dare_templates` for all existing groups via idempotent insert.
- 2025-08-17: Extended `dare_templates` with `difficulty` (enum) and `tags` (enum[]) columns + indexes; created enums `dare_difficulty` and `dare_tag`; backfilled 74 new dare templates across all existing groups with difficulty and tags (idempotent on `lower(text)` per `group_id`).

## Dare templates – defaults

- Purpose: give admins a starting set to pick/propose as seed dares when starting a game.
- Population:
  - One-time backfill: inserted 44 defaults for every existing `groups.id`, authored by `groups.created_by`.
  - Ongoing: a trigger `trg_seed_dare_templates_after_group_insert` calls `seed_default_dare_templates(new.id, new.created_by)` to auto-insert the same set for each new group.
- Idempotency: insertion skips any `dare_templates` row where `lower(text)` already exists for the `group_id`.

### Enums (dare)

- `dare_difficulty`: `EASY`, `INTERMEDIATE`, `HARD`
- `dare_tag`: `Wordplay`, `Trigger`, `Social`, `Misdirection`, `Physical`, `Silly`, `Prop`, `Skill`, `Acting`, `Constraint`, `Music`, `Phone`, `Consent`, `Timing`, `Puzzle`, `Observation`, `Improv`, `Cheeky`, `Drawing`, `Brain`, `PopCulture`, `Stealth`, `Sensory`, `Prank-lite`

### Table: `dare_templates`

- Columns (additions):
  - `difficulty` dare_difficulty not null default `'EASY'`
  - `tags` dare_tag[] not null default `{}`
- Indexes:
  - `ix_dare_templates_difficulty (difficulty)`
  - `ix_dare_templates_tags` GIN on `(tags)`
- Sample items (subset):
  - "Casually say \"That reminds me of a movie\" during a chat."
  - "Ask them what their go-to karaoke song is."
  - "Work the word \"spreadsheets\" into a sentence."
  - "Give a sincere compliment about their shoes."
  - "Use the word \"pineapple\" in a sentence."
  - "Hold the door and say \"After you, agent.\""
  - "Say \"Enhance!\" while looking at your screen."

### How to add a new dare template

- Purpose: expand the pool of reusable prompts that admins can use when seeding a game.
- Guidelines: keep prompts short, safe-for-work, and broadly applicable.

- Add for a single group (idempotent by lower(text)):

```sql
insert into public.dare_templates (group_id, text, difficulty, tags, is_active, created_by_profile_id)
select $1::uuid, $2::text, coalesce($3::public.dare_difficulty, 'EASY'), coalesce($4::public.dare_tag[], '{}'), true, (select created_by from public.groups where id = $1)
where not exists (
  select 1 from public.dare_templates t
  where t.group_id = $1 and lower(t.text) = lower($2)
);
```

- Add for all existing groups (idempotent across groups):

```sql
insert into public.dare_templates (group_id, text, difficulty, tags, is_active, created_by_profile_id)
select g.id, $1::text as text, coalesce($2::public.dare_difficulty, 'EASY'), coalesce($3::public.dare_tag[], '{}'), true, g.created_by
from public.groups g
where not exists (
  select 1 from public.dare_templates t
  where t.group_id = g.id and lower(t.text) = lower($1)
);
```

- Verify:

```sql
select count(*) from public.dare_templates where lower(text) = lower($1);
```

- Note: new groups are auto-seeded by `seed_default_dare_templates(...)`. To include a new phrase in future auto-seeding, update the backend seed function in addition to backfilling existing groups.

### Backfill (2025-08-17)

- Inserted 74 additional templates with curated `difficulty` and `tags` across all existing groups (idempotent on `lower(text)` per group).
- Existing templates without explicit difficulty/tags continue to work with defaults: `difficulty='EASY'`, `tags='{}'`.

### Table: `conversations`
- Shape checks:
  - `PLAYER_ADMIN`: `player_id` and `admin_profile_id` set; `target_player_id` null.
  - `PLAYER_TARGET`: `player_id` and `target_player_id` set; `admin_profile_id` null.

