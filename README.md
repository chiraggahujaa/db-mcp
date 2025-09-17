# Multi-Database MCP Server

A Model Context Protocol (MCP) server supporting MySQL, PostgreSQL, SQLite, and Supabase with fault-tolerant architecture and security features.

## Features

### Database Support
- **MySQL/MariaDB**: Full SQL support with connection pooling
- **PostgreSQL**: Native support using Bun.sql with JSON/JSONB
- **SQLite**: File-based and in-memory databases
- **Supabase**: REST API integration with real-time capabilities

### Security & Reliability
- SQL injection detection and query validation
- Rate limiting and access controls
- Independent connection management with auto-retry
- Health monitoring with graceful degradation
- Audit logging and security reporting

## Prerequisites

### Install Bun
This project requires Bun runtime. Install it using:

**macOS/Linux:**
```bash
curl -fsSL https://bun.sh/install | bash
```

**Windows:**
```powershell
powershell -c "irm bun.sh/install.ps1 | iex"
```

After installation, restart your terminal and verify with:
```bash
bun --version
```

## Setup

### 1. Install Dependencies
```bash
bun install
```

### 2. Configure Environment
Create `.env` file with your database connections:
```bash
cp .env.example .env
# Edit .env with your database credentials
```

### 3. Start Server
```bash
bun run start
```

### 4. Claude Desktop Integration
Add to your Claude Desktop MCP settings:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%AppData%\Claude\claude_desktop_config.json` (or `C:\Users\{username}\AppData\Roaming\Claude\claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "db-mcp": {
      "command": "/Users/{user}/.bun/bin/bun", // Use full path - run `which bun` to get your specific path
      "args": ["run", "start"],
      "cwd": "/path/to/your/db-mcp",
      "env": {
        "NODE_ENV": "production",
        "DEFAULT_DATABASE": "db_1",
        "READ_ONLY_MODE": "false",
        "MAX_QUERY_RESULTS": "1000",
        "DB_TYPE_1": "mysql",
        "DB_HOST_1": "localhost",
        "DB_PORT_1": "3306",
        "DB_USER_1": "root",
        "DB_PASSWORD_1": "your_password",
        "DB_NAME_1": "your_database"
      }
    }
  }
}
```

**Note**: Replace the environment variables with your actual database credentials. You can configure multiple databases using the numbered pattern (DB_TYPE_2, DB_HOST_2, etc.).

Restart Claude Desktop to activate the database server.

## Configuration

Uses numbered environment variables (`DB_TYPE_1`, `DB_HOST_1`, etc.) for multi-database configuration:

```bash
# MySQL
DB_TYPE_1=mysql
DB_HOST_1=localhost
DB_PORT_1=3306
DB_USER_1=username
DB_PASSWORD_1=password
DB_NAME_1=database

# PostgreSQL
DB_TYPE_2=postgresql
DB_CONNECTION_STRING_2=postgresql://user:pass@host:5432/dbname

# SQLite
DB_TYPE_3=sqlite
DB_FILE_3=/path/to/database.db

# Supabase
DB_TYPE_4=supabase
DB_PROJECT_URL_4=https://your-project.supabase.co
DB_ANON_KEY_4=your_anon_key

# Global settings
DEFAULT_DATABASE=db_1
READ_ONLY_MODE=false
MAX_QUERY_RESULTS=1000
```

## Usage

```bash
# Start server
bun run start

# Development mode
bun run dev
```

### Basic Operations
```javascript
// Switch databases
await switchEnvironment({ databaseId: 'db_2' })

// List tables
await listTables({ databaseId: 'db_1' })

// Query data
await selectData({
  table: 'users',
  columns: ['id', 'name'],
  where: 'status = ?',
  params: ['active'],
  limit: 50
})
```

## Architecture

- **Fault Tolerance**: Independent connections with auto-retry and health monitoring
- **Database Factory**: Common interface for all database types
- **Security**: Query validation, rate limiting, and audit logging

## Development

```bash
# Add new database
DB_TYPE_3=postgresql
DB_HOST_3=localhost
# Restart server - auto-discovered as db_3

# Switch context
switch_environment db_3
```

See [CLAUDE.md](CLAUDE.md) for detailed configuration examples.