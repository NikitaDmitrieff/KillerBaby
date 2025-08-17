import { useEffect } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';

export default function WelcomeScreen() {
  const router = useRouter();

  useEffect(() => {
    let active = true;
    (async () => {
      const start = Date.now();
      try {
        let { data } = await supabase.auth.getSession();
        console.log('[welcome] initial getSession -> hasSession:', !!data.session);
        if (!data.session) {
          const { error } = await (supabase.auth as any).signInAnonymously?.();
          if (error) {
            console.warn('[welcome] signInAnonymously failed:', (error as any)?.message);
          } else {
            console.log('[welcome] signInAnonymously ok');
          }
        }
        for (let i = 0; i < 20; i++) {
          const check = await supabase.auth.getSession();
          const has = !!check.data.session;
          console.log('[welcome] poll getSession hasSession:', has, 'iter', i);
          if (has) break;
          await new Promise((r) => setTimeout(r, 100));
        }
      } finally {
        const elapsed = Date.now() - start;
        const remaining = Math.max(0, 2000 - elapsed);
        setTimeout(() => {
          if (!active) return;
          console.log('[welcome] navigating to /');
          router.replace('/');
        }, remaining);
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);

  return (
    <View
      style={{ flex: 1, backgroundColor: '#9d0208', alignItems: 'center', justifyContent: 'center' }}
      accessibilityLabel="Welcome"
      accessibilityHint="Navigates to home after loading"
    >
      <Text style={{ color: '#fff', fontSize: 40, fontWeight: '900', letterSpacing: 0.5 }}>KillerBaby</Text>
    </View>
  );
}


