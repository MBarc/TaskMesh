import { useEffect, useRef, useState } from 'react';
import { Bell, Info, CheckCircle, AlertTriangle, AlertCircle, X } from 'lucide-react';
import { useNotificationStore } from '../stores/notificationStore';
import type { Notification, NotificationSeverity } from '../types';

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? 's' : ''} ago`;
}

function renderMessage(text: string): React.ReactNode[] {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, i) => {
    const match = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (match) {
      return (
        <a
          key={i}
          href={match[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:opacity-80"
        >
          {match[1]}
        </a>
      );
    }
    return part;
  });
}

const SEVERITY_CONFIG: Record<NotificationSeverity, {
  Icon: React.ElementType;
  iconClass: string;
  bgClass: string;
}> = {
  info: { Icon: Info, iconClass: 'text-primary-500', bgClass: 'bg-primary-500/10' },
  success: { Icon: CheckCircle, iconClass: 'text-green-500', bgClass: 'bg-green-500/10' },
  warning: { Icon: AlertTriangle, iconClass: 'text-amber-500', bgClass: 'bg-amber-500/10' },
  error: { Icon: AlertCircle, iconClass: 'text-red-500', bgClass: 'bg-red-500/10' },
};

function NotificationItem({ n, onDismiss }: { n: Notification; onDismiss: () => void }) {
  const config = SEVERITY_CONFIG[n.severity] ?? SEVERITY_CONFIG.info;
  const { Icon, iconClass, bgClass } = config;

  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className={`flex-shrink-0 w-8 h-8 rounded-full ${bgClass} flex items-center justify-center mt-0.5`}>
        <Icon className={`w-4 h-4 ${iconClass}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-text-primary leading-snug">{n.title}</p>
        <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">
          {renderMessage(n.message)}
        </p>
        <p className="text-xs text-text-muted mt-1">{relativeTime(n.createdAt)}</p>
      </div>
      <button
        onClick={onDismiss}
        className="flex-shrink-0 text-text-muted hover:text-text-primary transition-colors mt-0.5"
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const prevOpenRef = useRef(false);

  const { notifications, unreadCount, fetchNotifications, markAllRead, dismiss, dismissAll } =
    useNotificationStore();

  // Initial fetch + 60s polling
  useEffect(() => {
    fetchNotifications();
    const id = setInterval(fetchNotifications, 60000);
    return () => clearInterval(id);
  }, []);

  // Mark read when panel opens
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      markAllRead();
    }
    prevOpenRef.current = open;
  }, [open]);

  // Click outside closes panel
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Escape closes panel
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-1.5 rounded-md hover:bg-surface-tertiary transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5 text-text-secondary hover:text-text-primary" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 text-xs bg-primary-500 text-white rounded-full flex items-center justify-center leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-full mt-2 w-80 bg-surface rounded-lg shadow-xl border border-border z-50"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-semibold text-text-primary">Notifications</span>
            {notifications.length > 0 && (
              <button
                onClick={dismissAll}
                className="text-xs text-text-secondary hover:text-text-primary transition-colors"
              >
                Dismiss all
              </button>
            )}
          </div>

          {/* Body */}
          <div className="max-h-96 overflow-y-auto divide-y divide-border">
            {notifications.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Bell className="w-8 h-8 text-text-muted mx-auto mb-2 opacity-40" />
                <p className="text-sm font-medium text-text-primary">You're all caught up</p>
                <p className="text-xs text-text-muted mt-1">No new notifications</p>
              </div>
            ) : (
              notifications.map((n) => (
                <NotificationItem key={n.id} n={n} onDismiss={() => dismiss(n.id)} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
