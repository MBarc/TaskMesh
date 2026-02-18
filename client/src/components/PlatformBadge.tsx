import type { Platform } from '../types';

interface PlatformBadgeProps {
  platform: Platform;
  onClick?: () => void;
}

const platformLabels: Record<Platform, string> = {
  zoom: 'Zoom Meeting',
  teams: 'Teams Meeting',
  google_meet: 'Google Meet',
  slack: 'Slack',
  webex: 'Webex Meeting',
  ado: 'Azure DevOps',
  servicenow: 'ServiceNow',
  outlook: 'Outlook',
  gmail: 'Gmail',
  unknown: 'Meeting',
};

export function PlatformBadge({ platform, onClick }: PlatformBadgeProps) {
  const label = platformLabels[platform] || platformLabels.unknown;
  const hasAction = !!onClick;

  return (
    <button
      onClick={onClick}
      disabled={!hasAction}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-opacity ${
        hasAction ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'
      }`}
      style={{
        backgroundColor: 'var(--color-primary-50)',
        color: 'var(--color-primary-500)',
        border: '1px solid var(--color-primary-300)',
      }}
      title={hasAction ? 'View transcript' : label}
    >
      {label}
    </button>
  );
}
