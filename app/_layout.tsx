import { Slot, Stack, useRouter, useSegments } from 'expo-router';
import { View } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import * as Linking from 'expo-linking';
import { supabase } from '../lib/supabase';
import { useGroupsStore } from '../state/groups';

export default function RootLayout() {
  console.log('[layout] RootLayout render');
  const [initializing, setInitializing] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);
  const [hasShownWelcome, setHasShownWelcome] = useState(false);
  const [skipWelcomeOnce, setSkipWelcomeOnce] = useState(false);
  const processingLinkRef = useRef(false);
  const router = useRouter();
  const segments = useSegments();
  const { setSelectedGroup } = useGroupsStore();

  useEffect(() => {
    let mounted = true;
    (async () => {
      console.log('[layout] init start');
      const { data: sess0 } = await supabase.auth.getSession();
      console.log('[layout] initial getSession -> hasSession:', !!sess0.session);
      if (!sess0.session) {
        const { error } = await (supabase.auth as any).signInAnonymously?.();
        if (error) {
          console.warn('[layout] Anonymous sign-in failed:', (error as any)?.message);
        } else {
          console.log('[layout] Anonymous sign-in succeeded');
        }
      }
      const { data: sess1 } = await supabase.auth.getSession();
      console.log('[layout] post-signIn getSession -> hasSession:', !!sess1.session);
      if (!mounted) return;
      setIsAuthed(!!sess1.session);
      setInitializing(false);

      try {
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl) {
          await handleIncomingUrl(initialUrl);
        }
      } catch (e) {
        console.warn('[layout] getInitialURL error', (e as any)?.message);
      }
    })();
    const sub = supabase.auth.onAuthStateChange((event: any, session: any) => {
      console.log('[layout] onAuthStateChange:', event, 'hasSession:', !!session, 'userId:', session?.user?.id);
      setIsAuthed(!!session);
    });
    const linkSub = Linking.addEventListener('url', async ({ url }) => {
      await handleIncomingUrl(url);
    });
    return () => {
      mounted = false;
      sub.data.subscription.unsubscribe();
      linkSub.remove();
    };
  }, []);

  useEffect(() => {
    if (initializing) return;
    if (!hasShownWelcome && !skipWelcomeOnce && segments[0] !== 'welcome') {
      setHasShownWelcome(true);
      router.replace('/welcome');
    }
  }, [segments, initializing, hasShownWelcome, skipWelcomeOnce]);

  async function handleIncomingUrl(url: string) {
    if (processingLinkRef.current) return;
    processingLinkRef.current = true;
    try {
      const parsed = Linking.parse(url);
      const path = (parsed?.path || '').replace(/^\//, '');
      const groupId = (parsed?.queryParams?.g as string | undefined)?.trim();
      if (path?.toLowerCase() === 'join' && groupId) {
        try {
          const { data: g, error } = await supabase
            .from('groups')
            .select('id, name')
            .eq('id', groupId)
            .maybeSingle();
          if (error) throw error;
          if (g?.id) {
            await setSelectedGroup(g.id as string, g.name as string);
          } else {
            await setSelectedGroup(groupId, groupId);
          }
        } catch (e) {
          console.warn('[layout] Deep link group fetch failed, falling back to id only');
          await setSelectedGroup(groupId, groupId);
        }
        setSkipWelcomeOnce(true);
        router.replace('/group/join');
      }
    } finally {
      processingLinkRef.current = false;
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="welcome" options={{ presentation: 'card' }} />
        <Stack.Screen
          name="index"
          options={{
            presentation: 'card',
            animation: 'slide_from_left',
            animationTypeForReplace: 'pop',
          }}
        />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="group" />
        <Stack.Screen name="bet/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
        <Stack.Screen name="player/[id]" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      </Stack>
    </View>
  );
}

