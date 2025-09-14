import { MySQLMCPServer } from './src/server.js';

const server = new MySQLMCPServer();
server.run().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});