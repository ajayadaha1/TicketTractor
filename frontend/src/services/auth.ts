import { create } from 'zustand';
import { UserInfo } from '../types';

interface AuthState {
  user: UserInfo | null;
  token: string | null;
  setAuth: (user: UserInfo, token: string) => void;
  clearAuth: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: JSON.parse(localStorage.getItem('tt_user') || 'null'),
  token: localStorage.getItem('tt_auth_token'),
  setAuth: (user, token) => {
    localStorage.setItem('tt_user', JSON.stringify(user));
    localStorage.setItem('tt_auth_token', token);
    set({ user, token });
  },
  clearAuth: () => {
    localStorage.removeItem('tt_user');
    localStorage.removeItem('tt_auth_token');
    set({ user: null, token: null });
  },
  isAuthenticated: () => get().token !== null,
}));
