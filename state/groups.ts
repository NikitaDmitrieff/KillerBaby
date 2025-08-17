import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

type GroupsState = {
  hydrated: boolean;
  id: string | null;
  name: string | null;
  playerId: string | null;
  roleMode: 'player' | 'admin';
  hydrate: () => Promise<void>;
  setSelectedGroup: (id: string, name: string) => Promise<void>;
  setPlayerForGroup: (groupId: string, playerId: string) => Promise<void>;
  setSelectedPlayer: (playerId: string) => Promise<void>;
  setRoleMode: (role: 'player' | 'admin') => Promise<void>;
};

const STORAGE_KEY = 'kb.playerMap';
const ROLE_STORAGE_KEY = 'kb.roleMode.v1';

export const useGroupsStore = create<GroupsState>((set, get) => ({
  hydrated: true,
  id: null,
  name: null,
  playerId: null,
  roleMode: 'player',
  hydrate: async () => {
    try {
      const storedRole = await AsyncStorage.getItem(ROLE_STORAGE_KEY);
      if (storedRole === 'player' || storedRole === 'admin') {
        set({ roleMode: storedRole as any, hydrated: true });
        return;
      }
    } catch {}
    set({ hydrated: true });
  },
  setSelectedGroup: async (id: string, name: string) => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
      const playerId = map[id] ?? null;
      set({ id, name, playerId });
    } catch {
      set({ id, name });
    }
  },
  setPlayerForGroup: async (groupId: string, playerId: string) => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
      map[groupId] = playerId;
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    } catch {}
    const current = get();
    if (current.id === groupId) {
      set({ playerId });
    }
  },
  setSelectedPlayer: async (playerId: string) => {
    const current = get();
    const groupId = current.id;
    if (!groupId) {
      set({ playerId });
      return;
    }
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
      map[groupId] = playerId;
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    } catch {}
    if (get().id === groupId) {
      set({ playerId });
    }
  },
  setRoleMode: async (role: 'player' | 'admin') => {
    try {
      await AsyncStorage.setItem(ROLE_STORAGE_KEY, role);
    } catch {}
    set({ roleMode: role });
  },
}));


