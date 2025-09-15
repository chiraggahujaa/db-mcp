import { z } from 'zod';
import { securityManager } from '../security.js';

export const getSecurityReportSchema = z.object({});

export const getSecurityMetricsSchema = z.object({
  databaseId: z.string().optional().describe('Database ID to get metrics for (optional, gets global metrics if not specified)'),
});

export const getSecurityEventsSchema = z.object({
  limit: z.number().min(1).max(100).default(20).describe('Number of recent events to retrieve'),
});

export async function getSecurityReport(_args: z.infer<typeof getSecurityReportSchema>) {
  try {
    const report = securityManager.getSecurityReport();

    const output = [
      '🔒 Security Report',
      '',
      `Risk Level: ${report.riskLevel.toUpperCase()}`,
      '',
      '📊 Global Overview:',
      `  Total Connections: ${report.overview.totalConnections}`,
      `  Failed Connections: ${report.overview.failedConnections}`,
      `  Queries Executed: ${report.overview.queryCount}`,
      `  Blocked Queries: ${report.overview.blockedQueries}`,
      `  Suspicious Activity: ${report.overview.suspiciousActivity}`,
      `  Last Activity: ${report.overview.lastActivity.toISOString()}`,
      '',
      '💾 Database Metrics:',
      ...report.databases.map(db =>
        `  ${db.id}: ${db.metrics.queryCount} queries, ${db.metrics.failedConnections} failed connections`
      ),
      '',
      '🚨 Recent Security Events:',
      ...report.recentEvents.slice(0, 10).map(event =>
        `  ${event.timestamp.toISOString()} [${event.severity.toUpperCase()}] ${event.event} (${event.databaseId})`
      ),
    ];

    if (report.recentEvents.length === 0) {
      output.push('  No recent security events');
    }

    return {
      content: [
        {
          type: "text" as const,
          text: output.join('\n'),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: `❌ Error generating security report: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

export async function getSecurityMetrics(args: z.infer<typeof getSecurityMetricsSchema>) {
  try {
    const { databaseId } = args;
    const metrics = securityManager.getSecurityMetrics(databaseId);

    if (!metrics) {
      return {
        content: [
          {
            type: "text" as const,
            text: `❌ No metrics found for database: ${databaseId || 'global'}`,
          },
        ],
      };
    }

    const output = [
      `📈 Security Metrics${databaseId ? ` for ${databaseId}` : ' (Global)'}`,
      '',
      `Total Connections: ${metrics.totalConnections}`,
      `Failed Connections: ${metrics.failedConnections}`,
      `Success Rate: ${metrics.totalConnections > 0 ?
        ((metrics.totalConnections - metrics.failedConnections) / metrics.totalConnections * 100).toFixed(2) : 0}%`,
      `Queries Executed: ${metrics.queryCount}`,
      `Blocked Queries: ${metrics.blockedQueries}`,
      `Block Rate: ${metrics.queryCount > 0 ?
        (metrics.blockedQueries / metrics.queryCount * 100).toFixed(2) : 0}%`,
      `Suspicious Activity: ${metrics.suspiciousActivity}`,
      `Last Activity: ${metrics.lastActivity.toISOString()}`,
    ];

    return {
      content: [
        {
          type: "text" as const,
          text: output.join('\n'),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: `❌ Error retrieving security metrics: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

export async function getSecurityEvents(args: z.infer<typeof getSecurityEventsSchema>) {
  try {
    const { limit } = args;
    const events = securityManager.getRecentEvents(limit);

    if (events.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: '📝 No recent security events found',
          },
        ],
      };
    }

    const output = [
      `📝 Recent Security Events (Last ${events.length}):`,
      '',
      ...events.map(event => {
        const details = event.details ? ` | ${JSON.stringify(event.details)}` : '';
        return `${event.timestamp.toISOString()} [${event.severity.toUpperCase()}] ${event.event} (${event.databaseId})${details}`;
      }),
    ];

    return {
      content: [
        {
          type: "text" as const,
          text: output.join('\n'),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: `❌ Error retrieving security events: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}