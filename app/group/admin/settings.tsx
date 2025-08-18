import CollapsibleHeader from '../../../components/CollapsibleHeader';
import { View, Text, Switch, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { useEffect, useState } from 'react';
import { useGroupsStore } from '../../../state/groups';
import { supabase } from '../../../lib/supabase';
import { COLORS } from '../../../theme/colors';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
 

export default function AdminSettingsScreen() {
  const { id: groupId } = useGroupsStore();
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [groupCode, setGroupCode] = useState<string | null>(null);
  const [loadingGroup, setLoadingGroup] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  

  async function onRefresh() {
    setRefreshing(true);
    try {
      await Promise.all([
        new Promise(res => setTimeout(res, 300)),
        (async () => {
          if (!groupId) return;
          try {
            setLoadingGroup(true);
            const { data, error } = await supabase
              .from('groups')
              .select('short_code')
              .eq('id', groupId as string)
              .maybeSingle();
            if (error) throw error;
            setGroupCode((data?.short_code as string) ?? null);
          } catch {}
          finally { setLoadingGroup(false); }
        })(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    (async () => {
      if (!groupId) return;
      try {
        setLoadingGroup(true);
        const { data } = await supabase
          .from('groups')
          .select('short_code')
          .eq('id', groupId as string)
          .maybeSingle();
        setGroupCode((data?.short_code as string) ?? null);
      } catch {}
      finally { setLoadingGroup(false); }
    })();
  }, [groupId]);

  

  return (
    <CollapsibleHeader
      title={"Settings"}
      subtitle={"Group configuration"}
      isRefreshing={refreshing}
      renderContent={({ contentInsetTop, onScroll, scrollRef }) => (
        <ScrollView
          ref={scrollRef as any}
          onScroll={onScroll}
          scrollEventThrottle={16}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingTop: contentInsetTop, paddingHorizontal: 16, paddingBottom: 100 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#9d0208"
              colors={["#9d0208"]}
            />
          }
        >
          <View style={{ backgroundColor: '#f9f9fb', borderRadius: 12, padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '700' }}>Auto-advance on elimination</Text>
              <Switch value={autoAdvance} onValueChange={setAutoAdvance} />
            </View>
            <Text style={{ color: '#6b7280', marginTop: 8 }}>When enabled, a hunter automatically inherits their target's dare.</Text>
          </View>

          <View style={{ backgroundColor: '#f9f9fb', borderRadius: 12, padding: 16, marginTop: 16 }}>
            <Text style={{ fontWeight: '800', marginBottom: 8 }}>Invite</Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#6b7280' }}>Share this code with players to let them join.</Text>
              </View>
              <View style={{ minWidth: 120, alignItems: 'flex-end' }}>
                {loadingGroup ? (
                  <ActivityIndicator />
                ) : (
                  <Text style={{ fontWeight: '900', fontSize: 28, letterSpacing: 2 }}>{groupCode ?? '—'}</Text>
                )}
              </View>
            </View>
            <TouchableOpacity
              onPress={async () => {
                if (!groupCode) return;
                try {
                  await Clipboard.setStringAsync(groupCode);
                } catch {}
                // Silent copy in admin page
              }}
              disabled={!groupCode}
              style={{
                marginTop: 12,
                backgroundColor: groupCode ? COLORS.brandPrimary : '#cbd5e1',
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderRadius: 12,
                alignItems: 'center',
                alignSelf: 'stretch',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '800' }}>Copy code</Text>
            </TouchableOpacity>
          </View>

          <View style={{ backgroundColor: '#fff1f2', borderRadius: 12, padding: 16, marginTop: 24, borderWidth: 1, borderColor: '#fecdd3' }}>
            <Text style={{ fontWeight: '800', marginBottom: 8, color: '#7f1d1d' }}>Danger zone</Text>
            <Text style={{ color: '#7f1d1d' }}>Deleting the group permanently removes players, assignments, messages, and settings. This cannot be undone.</Text>
            <TouchableOpacity
              onPress={() => {
                if (!groupId || deleting) return;
                Alert.alert(
                  'Delete group?',
                  'This action cannot be undone. All data for this group will be permanently removed.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: async () => {
                        try {
                          setDeleting(true);
                          const { data: userRes } = await supabase.auth.getUser();
                          const adminProfileId = userRes?.user?.id as string | undefined;
                          if (!adminProfileId) throw new Error('Missing session');
                          const { error } = await supabase.rpc('delete_group_cascade', {
                            p_group_id: groupId as string,
                            p_admin_profile_id: adminProfileId,
                          });
                          if (error) throw error;
                          Alert.alert('Group deleted', 'The group has been removed.');
                          router.replace('/');
                        } catch (e: any) {
                          const msg = e?.message ?? 'Could not delete group';
                          setTimeout(() => Alert.alert('Delete failed', msg), 300);
                        } finally {
                          setDeleting(false);
                        }
                      },
                    },
                  ]
                );
              }}
              disabled={!groupId || deleting}
              style={{
                marginTop: 12,
                backgroundColor: deleting ? '#fca5a5' : '#ef4444',
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderRadius: 12,
                alignItems: 'center',
                alignSelf: 'stretch',
                opacity: !groupId ? 0.6 : 1,
              }}
            >
              {deleting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: '#fff', fontWeight: '800' }}>Delete group</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    />
  );
}


