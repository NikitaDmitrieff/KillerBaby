import { useCallback } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { router, usePathname } from 'expo-router';
import { useGroupsStore } from '../../state/groups';

export function RoleToggle() {
  const { roleMode, setRoleMode } = useGroupsStore();
  const pathname = usePathname();
  const switchRole = useCallback(async () => {
    const next = roleMode === 'player' ? 'admin' : 'player';
    await setRoleMode(next);
    const dest = next === 'admin' ? '/group/admin/assignments' : '/group/player/assignment';
    // If already on /group/*, replace to avoid stacking
    if (pathname?.startsWith('/group/')) router.replace(dest);
    else router.push(dest);
  }, [roleMode, setRoleMode, pathname]);
  return (
    <View style={{ backgroundColor: '#ffffffaa', borderRadius: 999, overflow: 'hidden' }}>
      <TouchableOpacity onPress={switchRole} style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
        <Text style={{ fontWeight: '800', color: '#9d0208' }}>{roleMode === 'player' ? 'Switch to Admin' : 'Switch to Player'}</Text>
      </TouchableOpacity>
    </View>
  );
}

export default RoleToggle;


