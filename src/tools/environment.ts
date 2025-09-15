import { z } from 'zod';
import { configManager } from '../config.js';
import { databaseManager } from '../database.js';

// Schema for switching environment
export const switchEnvironmentSchema = z.object({
  environment: z.string().describe('Environment to switch to (local, hm-staging-write, hm-staging-read, hm-prod-write, hm-prod-read, hm-critical-write)'),
});

// Schema for listing environments
export const listEnvironmentsSchema = z.object({});

// Schema for getting current environment
export const getCurrentEnvironmentSchema = z.object({});

// Schema for testing environment connection
export const testEnvironmentSchema = z.object({
  environment: z.string().optional().describe('Environment to test (optional, tests current if not specified)'),
});

export async function switchEnvironment(args: z.infer<typeof switchEnvironmentSchema>) {
  try {
    const { environment } = args;

    // Validate environment exists
    configManager.validateDatabaseExists(environment);

    // Test connection first
    const isConnected = await databaseManager.testConnection(environment);
    if (!isConnected) {
      return {
        content: [
          {
            type: "text" as const,
            text: `❌ Failed to connect to environment: ${environment}. Please check configuration.`,
          },
        ],
      };
    }

    // Switch to the environment
    databaseManager.switchDatabase(environment);

    return {
      content: [
        {
          type: "text" as const,
          text: `✅ Successfully switched to environment: ${environment}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: `❌ Error switching environment: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

export async function listEnvironments(_args: z.infer<typeof listEnvironmentsSchema>) {
  try {
    const environments = configManager.getDatabaseList();
    const currentEnv = databaseManager.getCurrentDatabase();

    // Test all connections
    const connectionTests = await databaseManager.testAllConnections();

    // Build environment info
    const environmentInfo = environments.map(env => {
      const config = configManager.getDatabaseConfig(env);
      const isConnected = connectionTests[env];
      const isCurrent = env === currentEnv;

      return {
        name: env,
        host: config.host,
        port: config.port,
        user: config.user,
        database: config.database || 'N/A',
        connected: isConnected,
        current: isCurrent,
        status: isCurrent ? '→ CURRENT' : (isConnected ? '✅' : '❌')
      };
    });

    const output = [
      '📋 Available Environments:',
      '',
      ...environmentInfo.map(env =>
        `${env.status} ${env.name.padEnd(20)} | ${env.host}:${env.port} | User: ${env.user} | DB: ${env.database}`
      ),
      '',
      `Current Environment: ${currentEnv}`,
      `Total Environments: ${environments.length}`,
      `Connected: ${Object.values(connectionTests).filter(Boolean).length}/${environments.length}`
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
          text: `❌ Error listing environments: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

export async function getCurrentEnvironment(_args: z.infer<typeof getCurrentEnvironmentSchema>) {
  try {
    const currentEnv = databaseManager.getCurrentDatabase();
    const config = configManager.getDatabaseConfig(currentEnv);
    const isConnected = await databaseManager.testConnection(currentEnv);

    const info = {
      name: currentEnv,
      host: config.host,
      port: config.port,
      user: config.user,
      database: config.database || 'N/A',
      connected: isConnected,
      connectionStatus: isConnected ? '✅ Connected' : '❌ Disconnected'
    };

    const output = [
      '🔍 Current Environment:',
      '',
      `Name: ${info.name}`,
      `Host: ${info.host}:${info.port}`,
      `User: ${info.user}`,
      `Database: ${info.database}`,
      `Status: ${info.connectionStatus}`,
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
          text: `❌ Error getting current environment: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

export async function testEnvironment(args: z.infer<typeof testEnvironmentSchema>) {
  try {
    const environment = args.environment || databaseManager.getCurrentDatabase();

    // Validate environment exists
    configManager.validateDatabaseExists(environment);

    const config = configManager.getDatabaseConfig(environment);
    const isConnected = await databaseManager.testConnection(environment);

    const output = [
      `🔧 Testing Environment: ${environment}`,
      '',
      `Host: ${config.host}:${config.port}`,
      `User: ${config.user}`,
      `Database: ${config.database || 'N/A'}`,
      '',
      `Connection Status: ${isConnected ? '✅ Connected' : '❌ Failed'}`,
    ];

    if (!isConnected) {
      output.push('', '💡 Troubleshooting:');
      output.push('- Check if host and port are correct');
      output.push('- Verify username and password');
      output.push('- Ensure database server is running');
      output.push('- Check network connectivity');
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
          text: `❌ Error testing environment: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}