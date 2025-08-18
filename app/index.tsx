import { Link, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import CollapsibleHeader, { CollapsibleHeaderRenderParams } from '../components/CollapsibleHeader';
import { COLORS } from '../theme/colors';
import { supabase } from '../lib/supabase';
import { useGroupsStore } from '../state/groups';

type GroupRow = { id: string; name: string; description: string | null; created_at: string };

export default function SelectGroupScreen() {
  const router = useRouter();
  const { hydrate, setSelectedGroup } = useGroupsStore();
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [query, setQuery] = useState('');
  const [playersByGroup, setPlayersByGroup] = useState<Record<string, Array<{ id: string; display_name: string }>>>({});

  function getInitials(name: string): string {
    const cleaned = (name || '').trim();
    if (!cleaned) return '?';
    const parts = cleaned.replace(/[_-]+/g, ' ').split(/\s+/);
    if (parts.length === 1) {
      const one = parts[0];
      return (one.slice(0, 2) || '?').toUpperCase();
    }
    return `${(parts[0][0] || '')}${(parts[1][0] || '')}`.toUpperCase();
  }

  useEffect(() => {
    hydrate();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const user = auth.user;
        if (!user) return;
        setLoading(true);
        const { data: playerOf, error: playerErr } = await supabase
          .from('group_players')
          .select('group:groups(id, name, description, created_at)')
          .eq('owner_user_id', user.id)
          .order('created_at', { ascending: false });
        if (playerErr) throw playerErr;
        const memberList = (playerOf ?? []).map((r: any) => r.group) as any[];
        const mergedMap = new Map<string, GroupRow>();
        memberList.forEach((g: any) => {
          if (!g) return;
          mergedMap.set(g.id, { id: g.id, name: g.name, description: g.description ?? null, created_at: g.created_at });
        });
        // Also include groups the user admins (created)
        const { data: adminOf, error: adminErr } = await supabase
          .from('groups')
          .select('id, name, description, created_at')
          .eq('created_by', user.id)
          .order('created_at', { ascending: false });
        if (adminErr) throw adminErr;
        (adminOf as any[] | null | undefined)?.forEach((g: any) => {
          if (!g) return;
          mergedMap.set(g.id, { id: g.id, name: g.name, description: g.description ?? null, created_at: g.created_at });
        });
        if (!mounted) return;
        setGroups(Array.from(mergedMap.values()).sort((a, b) => b.created_at.localeCompare(a.created_at)));
      } catch (e: any) {
        if (mounted) Alert.alert('Error', e?.message ?? 'Failed to load groups');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ids = groups.map((g) => g.id);
        if (ids.length === 0) {
          if (!cancelled) setPlayersByGroup({});
          return;
        }
        const { data, error } = await supabase
          .from('group_players')
          .select('id, group_id, display_name')
          .in('group_id', ids as any)
          .order('display_name', { ascending: true });
        if (error) throw error;
        const map = new Map<string, Array<{ id: string; display_name: string }>>();
        (data as any[] | null | undefined)?.forEach((row: any) => {
          const gid = row.group_id as string;
          const entry = { id: row.id as string, display_name: (row.display_name as string) || '—' };
          const list = map.get(gid) || [];
          list.push(entry);
          map.set(gid, list);
        });
        if (!cancelled) setPlayersByGroup(Object.fromEntries(map));
      } catch (e) {
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [groups]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => g.name.toLowerCase().includes(q));
  }, [groups, query]);

  return (
    <CollapsibleHeader
      title={"KillerBaby"}
      subtitle={"Choose a group"}
      renderContent={({ onScroll, contentInsetTop, scrollRef }: CollapsibleHeaderRenderParams) => (
        <View style={{ flex: 1 }}>
          {loading ? (
            <View style={{ paddingTop: contentInsetTop, padding: 16 }}>
              <ActivityIndicator />
            </View>
          ) : (
            <FlatList
              ref={scrollRef as any}
              data={filtered}
              keyExtractor={(item) => item.id}
              onScroll={onScroll}
              scrollEventThrottle={16}
              contentContainerStyle={{ paddingTop: contentInsetTop, paddingHorizontal: 16, paddingBottom: 100 }}
              ListHeaderComponent={(
                <View style={{ gap: 12, marginBottom: 8 }}>
                  <Text style={{ color: '#6b7280' }}>This scopes your feed, recap, and creation to that group.</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TextInput
                      value={query}
                      onChangeText={setQuery}
                      placeholder="Search groups"
                      style={{ flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}
                    />
                    <Link href="/group/create" asChild>
                      <TouchableOpacity style={{ backgroundColor: COLORS.brandPrimary, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12 }}>
                        <Text style={{ color: '#fff', fontWeight: '700' }}>Create</Text>
                      </TouchableOpacity>
                    </Link>
                  </View>
                </View>
              )}
              ListEmptyComponent={<Text style={{ color: '#6b7280' }}>No groups yet. Create one!</Text>}
              renderItem={({ item }) => {
                const players = playersByGroup[item.id] || [];
                const max = 5;
                const items = players.slice(0, max);
                const extra = players.length - items.length;
                return (
                  <TouchableOpacity
                    onPress={async () => {
                      await setSelectedGroup(item.id, item.name);
                      router.replace('/group');
                    }}
                    style={{ backgroundColor: '#f9f9fb', borderRadius: 16, padding: 16, marginBottom: 12 }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ flex: 1, paddingRight: 12 }}>
                        <Text style={{ fontWeight: '800', fontSize: 16 }}>{item.name}</Text>
                        {item.description ? (
                          <Text style={{ color: '#6b7280', marginTop: 4 }}>{item.description}</Text>
                        ) : null}
                      </View>
                      {players.length > 0 ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <View style={{ flexDirection: 'row-reverse' }}>
                            {extra > 0 ? (
                              <View style={{ width: 28, height: 28, borderRadius: 999, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center', marginLeft: -8, borderWidth: 2, borderColor: '#fff' }}>
                                <Text style={{ fontSize: 12, fontWeight: '700', color: '#374151' }}>{`+${extra}`}</Text>
                              </View>
                            ) : null}
                            {items.map((p, idx) => (
                              <View key={p.id} style={{ width: 28, height: 28, borderRadius: 999, backgroundColor: '#bfdbfe', alignItems: 'center', justifyContent: 'center', marginLeft: idx === 0 && extra <= 0 ? 0 : -8, borderWidth: 2, borderColor: '#fff' }}>
                                <Text style={{ fontSize: 12, fontWeight: '800', color: '#1f2937' }}>{getInitials(p.display_name)}</Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          )}

          <View style={{ position: 'absolute', left: 30, bottom: 50, alignItems: 'center', gap: 6 }}>
            <TouchableOpacity
              onPress={() => router.push('/settings')}
              accessibilityRole="button"
              accessibilityLabel="Open profile settings"
              style={{ width: 70, height: 70, borderRadius: 35, backgroundColor: COLORS.brandPrimary, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 3 }}
            >
              <Ionicons name="person-circle" size={32} color="#fff" />
            </TouchableOpacity>
            <Text style={{ color: '#374151', fontWeight: '700' }}>Account</Text>
          </View>

          <View style={{ position: 'absolute', right: 30, bottom: 50, alignItems: 'center', gap: 6 }}>
            <TouchableOpacity
              onPress={() => router.push('/group/join-code')}
              accessibilityRole="button"
              accessibilityLabel="Join a group by code"
              style={{ width: 70, height: 70, borderRadius: 35, backgroundColor: COLORS.brandPrimary, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 3 }}
            >
              <Ionicons name="people-outline" size={28} color="#fff" />
            </TouchableOpacity>
            <Text style={{ color: '#374151', fontWeight: '700' }}>Join</Text>
          </View>
        </View>
      )}
    />
  );
}


