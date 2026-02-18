import type { ComponentType } from 'react';
import {
  GitBranch, Snowflake, Mail, Inbox, FileText, MessageSquare, Hash,
  Plug, Database, Cloud, Globe, Server, Shield, Bell, Calendar,
  type LucideIcon,
} from 'lucide-react';

// Lazy imports for settings components
import { ConnectorSettings } from '../ConnectorSettings';
import { SnowConnectorSettings } from '../SnowConnectorSettings';
import { OutlookConnectorSettings } from '../OutlookConnectorSettings';
import { GmailConnectorSettings } from '../GmailConnectorSettings';
import { DocumentationSettingsPanel } from '../DocumentationSettings';

// ── Settings Component Registry ──
// Maps manifest `customSettingsComponent` strings to React components

const settingsComponentMap: Record<string, ComponentType> = {
  ConnectorSettings,
  SnowConnectorSettings,
  OutlookConnectorSettings,
  GmailConnectorSettings,
  DocumentationSettings: DocumentationSettingsPanel,
};

export function getSettingsComponent(name: string): ComponentType | null {
  return settingsComponentMap[name] || null;
}

export function registerSettingsComponent(name: string, component: ComponentType): void {
  settingsComponentMap[name] = component;
}

// ── Icon Registry ──
// Maps manifest `icon` strings to Lucide icon components

const iconMap: Record<string, LucideIcon> = {
  GitBranch,
  Snowflake,
  Mail,
  Inbox,
  FileText,
  MessageSquare,
  Hash,
  Plug,
  Database,
  Cloud,
  Globe,
  Server,
  Shield,
  Bell,
  Calendar,
};

export function getConnectorIcon(name: string): LucideIcon {
  return iconMap[name] || Plug;
}

export function registerIcon(name: string, icon: LucideIcon): void {
  iconMap[name] = icon;
}
