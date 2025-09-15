// Database types
export const DATABASE_TYPES = ['mysql', 'postgresql', 'sqlite', 'supabase', 'planetscale', 'mongodb'] as const;
export type DatabaseType = typeof DATABASE_TYPES[number];

// Security types
export interface SecurityConfig {
  maxQueryResults: number;
  allowDataModification: boolean;
  allowDrop: boolean;
  allowTruncate: boolean;
  readOnlyMode: boolean;
}

export interface SecurityEvent {
  event: string;
  databaseId: string;
  severity: 'info' | 'warning' | 'error';
  query?: string;
  details?: Record<string, any>;
  timestamp?: Date;
}

export interface ValidationResult {
  isValid: boolean;
  reason?: string;
}

// Configuration types
export interface Config {
  databases: Record<string, any>;
  defaultDatabase?: string;
  security: SecurityConfig;
}