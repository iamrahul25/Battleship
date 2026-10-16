import * as Crypto from 'expo-crypto';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { zustandStorage } from '@/platform/storage';

export interface ProfileState {
  playerId: string;
  nickname: string;
  avatarId: string;
  createdAt: number;
  onboarded: boolean;
  setProfile: (patch: Partial<Pick<ProfileState, 'nickname' | 'avatarId' | 'onboarded'>>) => void;
  reset: () => void;
}

function freshProfile() {
  return {
    playerId: Crypto.randomUUID(),
    nickname: '',
    avatarId: 'captain',
    createdAt: Date.now(),
    onboarded: false,
  };
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      ...freshProfile(),
      setProfile: (patch) => set(patch),
      reset: () => set(freshProfile()),
    }),
    {
      name: 'profile.v1',
      version: 1,
      storage: createJSONStorage(() => zustandStorage),
      migrate: (persisted) => ({ ...freshProfile(), ...(persisted as object) }),
    },
  ),
);
