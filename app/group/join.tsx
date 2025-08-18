import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, SafeAreaView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useGroupsStore } from '../../state/groups';
import { supabase } from '../../lib/supabase';
import { COLORS } from '../../theme/colors';
import { useRouter } from 'expo-router';

type PlayerRow = { id: string; display_name: string; owner_user_id: string | null };

export default function JoinGroupAsPlayerScreen() {
  const router = useRouter();
  const { id: groupId, name: groupName, playerId, setSelectedPlayer, setSelectedGroup, setRoleMode } = useGroupsStore();
  const [loading, setLoading] = useState(true);
  const [placeholders, setPlaceholders] = useState<PlayerRow[]>([]);
  const [query, setQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [groupLabel, setGroupLabel] = useState<string | null>(groupName ?? null);
  const [isAdminOfGroup, setIsAdminOfGroup] = useState<boolean>(false);

  // If player already selected for this group, skip this screen
  useEffect(() => {
    if (playerId) {
      (async () => {
        try {
          await setRoleMode('player');
        } catch {}
        router.replace('/group');
      })();
    }
  }, [playerId, router]);

  // Best-effort: if we only have a UUID as the name, fetch the actual group name for display
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!groupId) return;
        // Load current user profile id (assumes profiles.id == auth.user.id)
        const { data: userRes } = await supabase.auth.getUser();
        const currentProfileId = userRes.user?.id ?? null;

        // Always fetch group name and creator to determine admin option visibility
        const { data } = await supabase
          .from('groups')
          .select('id, name, created_by')
          .eq('id', groupId)
          .maybeSingle();
        if (!mounted) return;
        if (data?.name) setGroupLabel(data.name);
        else setGroupLabel(groupName ?? groupId ?? null);
        setIsAdminOfGroup(!!currentProfileId && !!data?.created_by && data.created_by === currentProfileId);
      } catch {
        if (mounted) setGroupLabel(groupName ?? groupId ?? null);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [groupId, groupName]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!groupId) return;
        setLoading(true);
        const { data, error } = await supabase
          .from('group_players')
          .select('id, display_name, owner_user_id')
          .eq('group_id', groupId)
          .order('display_name', { ascending: true });
        if (error) throw error;
        if (!mounted) return;
        const rows = ((data ?? []) as any[]).map((r: any) => ({ id: r.id, display_name: r.display_name, owner_user_id: r.owner_user_id ?? null }));
        // Only placeholders (unclaimed)
        setPlaceholders(rows.filter((r) => !r.owner_user_id));
      } catch (e: any) {
        if (mounted) Alert.alert('Error', e?.message ?? 'Failed to load players');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [groupId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return placeholders;
    return placeholders.filter((p) => p.display_name.toLowerCase().includes(q));
  }, [placeholders, query]);

  // Claim a specific placeholder by id by delegating to the join RPC using the placeholder's display name
  async function handleClaimById(playerId: string) {
    if (!groupId) return;
    if (isAdminOfGroup) {
      Alert.alert('Not allowed', 'As the group creator, you must continue as Admin and cannot join as a player.');
      return;
    }
    const ph = placeholders.find((p) => p.id === playerId);
    if (!ph) return;
    await handleJoinWithName(ph.display_name);
  }

  async function handleJoinWithName(displayName: string) {
    if (!groupId) return;
    if (isAdminOfGroup) {
      Alert.alert('Not allowed', 'As the group creator, you must continue as Admin and cannot join as a player.');
      return;
    }
    try {
      setSubmitting(true);
      // If the typed name case-insensitively matches a placeholder, use the exact stored casing to claim it
      const exactPlaceholder = placeholders.find((p) => p.display_name.toLowerCase() === displayName.trim().toLowerCase());
      const claimName = exactPlaceholder ? exactPlaceholder.display_name : displayName.trim();

      const { data: res, error } = await supabase.rpc('join_group_as_player', {
        p_group_id: groupId,
        p_display_name: claimName,
      });
      if (error) throw error;
      const pid = (
        typeof res === 'string'
          ? res
          : Array.isArray(res)
            ? (res?.[0]?.player_id as string | undefined)
            : ((res as any)?.player_id as string | undefined)
      );
      if (!pid) throw new Error('Join RPC returned no player_id');
      await setSelectedPlayer(pid);
      await setRoleMode('player');
      // After joining, update the locally stored group name if we only had a UUID label
      try {
        const looksUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(groupLabel ?? '');
        if (!groupName || looksUuid) {
          const { data: g } = await supabase
            .from('groups')
            .select('id, name')
            .eq('id', groupId)
            .maybeSingle();
          if (g?.name) {
            setGroupLabel(g.name);
            // Persist corrected group name so header uses it
            await setSelectedGroup(groupId, g.name);
          }
        }
      } catch {}
      router.replace('/group');
    } catch (e: any) {
      Alert.alert('Join failed', e?.message ?? 'Could not join group');
    } finally {
      setSubmitting(false);
    }
  }

  async function continueAsAdmin() {
    try {
      setSubmitting(true);
      await setRoleMode('admin');
      router.replace('/group');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not continue as admin');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={{ padding: 16, gap: 10 }}>
        <Text style={{ fontSize: 24, fontWeight: '800' }}>Who are you in {groupLabel ?? groupName ?? ''}?</Text>
        <Text style={{ color: '#6b7280' }}>
          {isAdminOfGroup
            ? 'You are the group creator. Continue as Admin. Admins cannot join as players.'
            : 'Pick your name from the list or enter a new one.'}
        </Text>

        {!isAdminOfGroup && (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search names or type a new one"
              autoCapitalize="words"
              editable={!submitting}
              style={{ flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}
            />
            <TouchableOpacity
              disabled={!query.trim() || submitting}
              onPress={() => handleJoinWithName(query.trim())}
              style={{ backgroundColor: query.trim() && !submitting ? COLORS.brandPrimary : '#cbd5e1', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12 }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>Use this</Text>
            </TouchableOpacity>
          </View>
        )}
        {isAdminOfGroup && (
          <View style={{ marginTop: 8 }}>
            <TouchableOpacity
              disabled={submitting}
              onPress={continueAsAdmin}
              style={{
                borderWidth: 1,
                borderColor: COLORS.brandPrimary,
                backgroundColor: '#ffffff',
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderRadius: 12,
              }}
            >
              <Text style={{ color: COLORS.brandPrimary, fontWeight: '700' }}>Continue as Admin</Text>
            </TouchableOpacity>
            <Text style={{ color: '#6b7280', marginTop: 6 }}>Admins manage the game and do not play as regular players.</Text>
          </View>
        )}
      </View>

      {loading ? (
        <View style={{ padding: 16 }}>
          <ActivityIndicator />
        </View>
      ) : !isAdminOfGroup ? (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
          ListEmptyComponent={<Text style={{ color: '#6b7280' }}>No names yet. Enter yours above.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity
              disabled={submitting}
              onPress={() => handleClaimById(item.id)}
              style={{ backgroundColor: '#f9f9fb', borderRadius: 16, padding: 16, marginBottom: 12 }}
            >
              <Text style={{ fontWeight: '800', fontSize: 16 }}>{item.display_name}</Text>
            </TouchableOpacity>
          )}
        />
      ) : (
        <View style={{ paddingHorizontal: 16, paddingBottom: 40 }}>
          <Text style={{ color: '#6b7280' }}>As the group creator, you cannot join as a player.</Text>
        </View>
      )}
    </SafeAreaView>
  );
}


