import { useEffect } from 'react';
import { router } from 'expo-router';
import { useGroupsStore } from '../../state/groups';

export default function GroupLandingRouter() {
  const { roleMode, hydrate } = useGroupsStore();
  useEffect(() => {
    hydrate();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const path = roleMode === 'admin' ? '/group/admin/assignments' : '/group/player/assignment';
    router.replace(path);
  }, [roleMode]);
  return null;
}


