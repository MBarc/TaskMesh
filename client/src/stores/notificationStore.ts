import { create } from 'zustand';
import type { Notification } from '../types';
import * as api from '../api';

interface NotificationState {
  notifications: Notification[];
  loading: boolean;
  unreadCount: number;
  fetchNotifications: () => Promise<void>;
  markAllRead: () => Promise<void>;
  dismiss: (id: string) => Promise<void>;
  dismissAll: () => Promise<void>;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  loading: false,
  unreadCount: 0,

  fetchNotifications: async () => {
    set({ loading: true });
    try {
      const notifications = await api.getNotifications();
      set({
        notifications,
        loading: false,
        unreadCount: notifications.filter((n) => !n.read).length,
      });
    } catch {
      set({ loading: false });
    }
  },

  markAllRead: async () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }));
    try {
      await api.markNotificationsRead();
    } catch {
      // Silently ignore — optimistic update stays
    }
  },

  dismiss: async (id: string) => {
    set((state) => {
      const notifications = state.notifications.filter((n) => n.id !== id);
      return { notifications, unreadCount: notifications.filter((n) => !n.read).length };
    });
    try {
      await api.dismissNotification(id);
    } catch {
      // Re-fetch to restore state on error
      get().fetchNotifications();
    }
  },

  dismissAll: async () => {
    set({ notifications: [], unreadCount: 0 });
    try {
      await api.dismissAllNotifications();
    } catch {
      get().fetchNotifications();
    }
  },
}));
