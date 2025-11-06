import { z } from 'zod';

export interface SecurityEvent {
  timestamp: Date;
  event: string;
  databaseId: string;
  query?: string;
  user?: string;
  ip?: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  details?: Record<string, any>;
}

export interface SecurityMetrics {
  totalConnections: number;
  failedConnections: number;
  queryCount: number;
  blockedQueries: number;
  suspiciousActivity: number;
  lastActivity: Date;
}

export class SecurityManager {
  private events: SecurityEvent[] = [];
  private metrics: Map<string, SecurityMetrics> = new Map();
  private rateLimits: Map<string, { count: number; lastReset: Date }> = new Map();
  private suspiciousPatterns: RegExp[] = [
    /union.*select/i,
    /;\s*drop\s+/i,
    /;\s*delete\s+from/i,
    /;\s*update.*set/i,
    /load_file\s*\(/i,
    /into\s+outfile/i,
    /benchmark\s*\(/i,
    /sleep\s*\(/i,
  ];

  constructor() {
    this.initializeMetrics();
  }

  private initializeMetrics(): void {
    // Initialize metrics for discovered databases
    this.metrics.set('global', {
      totalConnections: 0,
      failedConnections: 0,
      queryCount: 0,
      blockedQueries: 0,
      suspiciousActivity: 0,
      lastActivity: new Date(),
    });
  }

  logEvent(event: Omit<SecurityEvent, 'timestamp'>): void {
    const securityEvent: SecurityEvent = {
      ...event,
      timestamp: new Date(),
    };

    this.events.push(securityEvent);

    // Keep only last 1000 events to prevent memory issues
    if (this.events.length > 1000) {
      this.events = this.events.slice(-1000);
    }

    this.updateMetrics(event.databaseId, event.event);

    // Log to console for monitoring
    const level = event.severity === 'critical' || event.severity === 'error' ? 'error' : 'log';
    console[level](`[SECURITY] ${event.severity.toUpperCase()}: ${event.event} (DB: ${event.databaseId})`);
  }

  private updateMetrics(databaseId: string, event: string): void {
    const dbMetrics = this.metrics.get(databaseId) || {
      totalConnections: 0,
      failedConnections: 0,
      queryCount: 0,
      blockedQueries: 0,
      suspiciousActivity: 0,
      lastActivity: new Date(),
    };

    const globalMetrics = this.metrics.get('global')!;

    switch (event) {
      case 'connection_success':
        dbMetrics.totalConnections++;
        globalMetrics.totalConnections++;
        break;
      case 'connection_failed':
        dbMetrics.failedConnections++;
        globalMetrics.failedConnections++;
        break;
      case 'query_executed':
        dbMetrics.queryCount++;
        globalMetrics.queryCount++;
        break;
      case 'query_blocked':
        dbMetrics.blockedQueries++;
        globalMetrics.blockedQueries++;
        break;
      case 'suspicious_activity':
        dbMetrics.suspiciousActivity++;
        globalMetrics.suspiciousActivity++;
        break;
    }

    dbMetrics.lastActivity = new Date();
    globalMetrics.lastActivity = new Date();

    this.metrics.set(databaseId, dbMetrics);
    this.metrics.set('global', globalMetrics);
  }

  checkRateLimit(identifier: string, maxRequests: number = 100, windowMs: number = 60000): boolean {
    const now = new Date();
    const limit = this.rateLimits.get(identifier);

    if (!limit || now.getTime() - limit.lastReset.getTime() > windowMs) {
      this.rateLimits.set(identifier, { count: 1, lastReset: now });
      return true;
    }

    if (limit.count >= maxRequests) {
      this.logEvent({
        event: 'rate_limit_exceeded',
        databaseId: 'global',
        severity: 'warning',
        details: { identifier, count: limit.count, maxRequests },
      });
      return false;
    }

    limit.count++;
    return true;
  }

  validateQuery(query: string, databaseId: string): { isValid: boolean; reason?: string } {
    // Check for suspicious patterns
    for (const pattern of this.suspiciousPatterns) {
      if (pattern.test(query)) {
        this.logEvent({
          event: 'suspicious_query_detected',
          databaseId,
          query: query.substring(0, 200),
          severity: 'warning',
          details: { pattern: pattern.source },
        });
        return { isValid: false, reason: 'Suspicious SQL pattern detected' };
      }
    }

    // Check query length
    if (query.length > 10000) {
      this.logEvent({
        event: 'oversized_query',
        databaseId,
        query: query.substring(0, 200),
        severity: 'warning',
        details: { length: query.length },
      });
      return { isValid: false, reason: 'Query too long' };
    }

    // Check for multiple statements when not allowed
    if (query.includes(';') && query.trim().split(';').filter(s => s.trim()).length > 1) {
      this.logEvent({
        event: 'multiple_statements_detected',
        databaseId,
        query: query.substring(0, 200),
        severity: 'info',
        details: { statementCount: query.split(';').length },
      });
    }

    return { isValid: true };
  }

  getSecurityMetrics(databaseId?: string): SecurityMetrics | undefined {
    return this.metrics.get(databaseId || 'global');
  }

  getRecentEvents(limit: number = 50): SecurityEvent[] {
    return this.events.slice(-limit).reverse();
  }

  getSecurityReport(): {
    overview: SecurityMetrics;
    databases: Array<{ id: string; metrics: SecurityMetrics }>;
    recentEvents: SecurityEvent[];
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
  } {
    const overview = this.metrics.get('global')!;
    const databases = Array.from(this.metrics.entries())
      .filter(([id]) => id !== 'global')
      .map(([id, metrics]) => ({ id, metrics }));

    const recentEvents = this.getRecentEvents(20);

    // Calculate risk level based on recent activity
    const criticalEvents = recentEvents.filter(e => e.severity === 'critical').length;
    const errorEvents = recentEvents.filter(e => e.severity === 'error').length;
    const warningEvents = recentEvents.filter(e => e.severity === 'warning').length;

    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (criticalEvents > 0) riskLevel = 'critical';
    else if (errorEvents > 2) riskLevel = 'high';
    else if (warningEvents > 5) riskLevel = 'medium';

    return {
      overview,
      databases,
      recentEvents,
      riskLevel,
    };
  }

  clearOldEvents(olderThanHours: number = 24): void {
    const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
    this.events = this.events.filter(event => event.timestamp > cutoff);
  }
}

export const securityManager = new SecurityManager();