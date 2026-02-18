export type Platform = 'zoom' | 'teams' | 'google_meet' | 'slack' | 'webex' | 'ado' | 'servicenow' | 'outlook' | 'gmail' | 'unknown';

export function detectPlatform(sourceText: string): Platform {
  const text = sourceText.toLowerCase();

  if (text.includes('zoom meeting') || text.includes('meeting id:') || text.includes('zoom.us')) {
    return 'zoom';
  }
  if (text.includes('microsoft teams') || text.includes('teams meeting') || text.includes('teams.microsoft.com')) {
    return 'teams';
  }
  if (text.includes('google meet') || text.includes('meet.google.com')) {
    return 'google_meet';
  }
  if (text.includes('slack huddle') || text.includes('slack connect') || text.includes('slack call')) {
    return 'slack';
  }
  if (text.includes('webex') || text.includes('cisco webex')) {
    return 'webex';
  }

  return 'unknown';
}
