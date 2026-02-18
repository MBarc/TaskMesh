// Client-side mirror of server ConnectorManifest types

export interface ManifestSettingsField {
  key: string;
  label: string;
  type: 'text' | 'email' | 'url' | 'password' | 'number' | 'checkbox' | 'textarea';
  required: boolean;
  secret?: boolean;
  placeholder?: string;
  normalize?: 'stripTrailingSlash';
  layout?: 'full' | 'half';
  default?: any;
}

export interface ManifestCustomField {
  key: string;
  type: 'json';
  label: string;
}

export interface ManifestColumn {
  type: string;
  name: string;
  requiredFor: string[];
}

export interface ManifestImport {
  label: string;
  searchPlaceholder?: string;
  itemLabel?: string;
  itemLabelPlural?: string;
  emptyMessage?: string;
  loadingMessage?: string;
  customComponent?: string;
}

export interface ManifestPush {
  label: string;
  customComponent?: string;
}

export interface ManifestInstanceMeta {
  name: string;
  icon: string;
  brandColor: string;
}

export interface ConnectorManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  icon: string;
  category: string;
  brandColor: string;

  capabilities: string[];

  multiInstance?: boolean;
  instanceKey?: string;
  instances?: string[];
  instanceMeta?: Record<string, ManifestInstanceMeta>;
  exclusiveActive?: boolean;

  columns: ManifestColumn[];

  settings: {
    singleton: boolean;
    fields: ManifestSettingsField[];
    customFields: ManifestCustomField[];
    customSettingsComponent?: string;
    instanceSettingsComponents?: Record<string, string>;
  };

  import?: ManifestImport;
  push?: ManifestPush;
  aiFields?: { endpoint: string };
}
