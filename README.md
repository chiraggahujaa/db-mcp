# MySQL MCP Server

A comprehensive Model Context Protocol (MCP) server for MySQL database operations, designed for AI agents and applications that need to interact with MySQL databases safely and efficiently.

## Features

### 🔗 Dynamic Multi-Database Support
- Connect to unlimited MySQL instances simultaneously
- Automatic database discovery from environment variables
- No code changes required to add new databases
- Dynamic database switching and context management

### 🛡️ Advanced Security & Safety
- Enterprise-grade security monitoring and audit logging
- Query pattern analysis for SQL injection detection
- Rate limiting and suspicious activity monitoring
- Read-only mode and granular access controls
- Real-time security reporting and metrics

### 🚀 High-Performance Connection Management
- Advanced connection pooling with configurable limits
- Connection timeout and retry logic
- Keep-alive and idle connection management
- Queue management for high-concurrency scenarios
- Connection health monitoring and auto-recovery

### 🏢 Tenant-Aware Operations
- Multi-tenant architecture support (separate databases per tenant)
- Tenant database context switching
- Cross-tenant data and schema comparison
- Tenant-specific database analysis

### 📊 Comprehensive Database Tools

#### Schema & Structure Analysis
- List databases and tables
- Detailed table schema inspection
- Index analysis and optimization
- Foreign key relationship mapping
- Table dependency analysis

#### Data Query & Search
- Advanced SELECT query building
- Full-text search capabilities
- Record counting and pagination
- ID-based record lookup
- Recent records retrieval
- Custom query execution with security validation

#### Data Modification (with safety controls)
- Single record insertion
- Bulk data insertion
- Record updates with conditions
- Safe record deletion with confirmations

#### Advanced Analysis
- Table JOIN operations
- Orphaned record detection
- Referential integrity validation
- Column statistics and analysis
- Table relationship mapping

#### Security & Monitoring
- Comprehensive security reports
- Database-specific security metrics
- Real-time security event monitoring
- Risk level assessment
- Query audit trails

#### Utility & Maintenance
- Query execution plan analysis
- Table status and size information
- Table optimization
- Structure backup (DDL export)
- Connection health monitoring
- Database size analysis

## Installation

### Prerequisites
- [Bun](https://bun.sh) runtime
- MySQL server(s) with appropriate permissions
- Node.js 18+ (for compatibility)

### Setup

1. **Clone and install dependencies:**
   ```bash
   git clone <repository-url>
   cd db-mcp
   bun install
   ```

2. **Configure database connections:**
   ```bash
   cp .env.example .env
   # Edit .env with your database credentials
   ```

3. **Test the installation:**
   ```bash
   bun run dev
   ```

## Configuration

### Dynamic Database Configuration

The system uses a numbered environment variable pattern to automatically discover and configure databases:

```env
# Database 1 (Primary/Local)
DB_HOST_1=localhost
DB_PORT_1=3306
DB_USER_1=root
DB_PASSWORD_1=your_password
DB_NAME_1=your_database

# Database 2 (Staging)
DB_HOST_2=staging.example.com
DB_PORT_2=3306
DB_USER_2=staging_user
DB_PASSWORD_2=staging_password
DB_NAME_2=staging_database

# Database 3 (Production)
DB_HOST_3=prod.example.com
DB_PORT_3=3306
DB_USER_3=prod_user
DB_PASSWORD_3=prod_password
DB_NAME_3=prod_database

# Add more databases by incrementing the number
# DB_HOST_4=..., DB_HOST_5=..., etc.
```

### Simplified Configuration

Each database only requires basic connection information. Advanced connection pool and database settings are configured via constants in the codebase for consistency across all databases.

**Required per database:**
```env
DB_HOST_1=your-database-host
DB_PORT_1=3306
DB_USER_1=your-username
DB_PASSWORD_1=your-password
DB_NAME_1=your-database-name  # optional
```

**Connection defaults (applied to all databases):**
- Connection Limit: 10
- Timeouts: 60 seconds
- Idle Timeout: 10 minutes
- Charset: UTF8_GENERAL_CI
- Timezone: local

### Global Security Settings

```env
# Default database to connect to
DEFAULT_DATABASE=db_1

# Security settings
MAX_QUERY_RESULTS=1000
ALLOW_DATA_MODIFICATION=true
ALLOW_DROP=false
ALLOW_TRUNCATE=false
READ_ONLY_MODE=false
```

### Database Identifiers

Databases are automatically assigned IDs based on their number:
- `DB_HOST_1` becomes database ID `db_1`
- `DB_HOST_2` becomes database ID `db_2`
- And so on...

### Adding New Databases

To add a new database, simply add the numbered environment variables:

```env
# Add database 7
DB_HOST_7=new-database.example.com
DB_PORT_7=3306
DB_USER_7=new_user
DB_PASSWORD_7=new_password
DB_NAME_7=new_database
```

All connection pool settings, SSL configuration, charset, timezone, and other advanced options are managed via constants in the code for consistency.

The system will automatically discover and initialize the new database on restart - no code changes required!

## Usage

### Starting the Server

```bash
# Development mode with auto-reload
bun run dev

# Production mode
bun run start

# Build for distribution
bun run build
```

### MCP Client Integration

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "mysql": {
      "command": "bun",
      "args": ["run", "/path/to/db-mcp/index.ts"],
      "env": {
        "DB_HOST_1": "localhost",
        "DB_USER_1": "root",
        "DB_PASSWORD_1": "your_password"
      }
    }
  }
}
```

## Tool Reference

### Database Environment Tools
- `switch_environment` - Switch to a specific database (e.g., `db_1`, `db_2`)
- `list_environments` - List all configured databases with connection status
- `get_current_environment` - Get details about the current database
- `test_environment` - Test connection to a specific database

### Schema Tools
- `list_databases` - List all available databases
- `list_tables` - List tables in a database
- `describe_table` - Get detailed table schema
- `show_indexes` - Display table indexes
- `analyze_foreign_keys` - Map foreign key relationships
- `get_table_dependencies` - Show table dependencies

### Query Tools
- `select_data` - Execute SELECT queries with filtering
- `count_records` - Count records with optional conditions
- `find_by_id` - Find records by primary key
- `search_records` - Full-text search across columns
- `get_recent_records` - Get recently modified records
- `execute_custom_query` - Run custom SELECT queries with security validation

### Modification Tools
- `insert_record` - Insert single record
- `update_record` - Update records with WHERE clause
- `delete_record` - Delete records (requires confirmation)
- `bulk_insert` - Insert multiple records efficiently

### Security Tools
- `get_security_report` - Comprehensive security overview with risk assessment
- `get_security_metrics` - Database-specific or global security metrics
- `get_security_events` - Recent security events and audit logs

### Analysis Tools
- `join_tables` - Execute JOIN operations
- `find_orphaned_records` - Detect orphaned records
- `validate_referential_integrity` - Check FK constraints
- `analyze_table_relationships` - Map table relationships
- `get_column_statistics` - Analyze column data

### Tenant Tools
- `list_tenants` - List all tenant databases
- `switch_tenant_context` - Change active tenant database
- `get_tenant_schema` - Get complete schema for tenant database
- `compare_tenant_data` - Compare table data/schema across tenant databases
- `get_tenant_tables` - List all tables in tenant database with record counts

### Utility Tools
- `explain_query` - Get query execution plan
- `check_table_status` - Get table status info
- `optimize_table` - Optimize table performance
- `backup_table_structure` - Export table DDL
- `test_connection` - Test database connectivity
- `show_connections` - Display connection status
- `get_database_size` - Analyze database size

## Security Features

### Real-Time Monitoring
- Query pattern analysis for SQL injection detection
- Suspicious activity detection and alerting
- Rate limiting per database and user
- Connection attempt monitoring

### Security Reporting
- Comprehensive security reports with risk levels
- Database-specific security metrics
- Audit trail of all database operations
- Security event history with filtering

### Access Controls
- Granular permission controls
- Read-only mode for production safety
- Query result limits and timeouts
- SSL/TLS encryption enforcement

### Best Practices
- Query validation and sanitization
- Connection pooling security
- Secure credential management

## Resources

The server provides these MCP resources:

- `mysql://databases` - List of configured databases
- `mysql://configuration` - Current configuration
- `mysql://foreign-keys` - Complete FK relationship map
- `mysql://schema/{database}` - Complete schema for specific database

## Security Considerations

### Production Safety
- Enable `READ_ONLY_MODE=true` for production databases
- Set `ALLOW_DATA_MODIFICATION=false` to prevent writes
- Use `ALLOW_DROP=false` and `ALLOW_TRUNCATE=false`
- Configure appropriate `MAX_QUERY_RESULTS` limits

### Connection Security
- Use dedicated database users with minimal required permissions
- Enable SSL connections where supported
- Store credentials securely using environment variables
- Regularly rotate database passwords
- Monitor security events and metrics

### Query Safety
- All queries use parameterized statements
- Query pattern analysis prevents SQL injection
- Result limits prevent memory exhaustion
- Query timeouts prevent long-running operations
- Comprehensive audit logging

## Troubleshooting

### Common Issues

1. **Database not discovered:**
   - Ensure you have `DB_HOST_n` where `n` is a number
   - Check that required variables (`DB_HOST_n`, `DB_USER_n`, `DB_PASSWORD_n`) are set
   - Restart the application after adding new environment variables

2. **Connection refused:**
   - Check database server is running
   - Verify host, port, and credentials
   - Test connection with `test_environment` tool

3. **Security alerts:**
   - Use `get_security_report` for comprehensive overview
   - Review blocked queries with `get_security_events`
   - Check rate limiting settings if requests are blocked

### Debugging

Enable debug logging:
```bash
DEBUG=1 bun run dev
```

Check system status:
- Use `list_environments` to see all database connections
- Use `get_security_report` for security overview
- Use `test_environment` to diagnose specific database issues

## Development

### Project Structure

```
db-mcp/
├── src/
│   ├── config.ts          # Dynamic configuration management
│   ├── constants.ts       # Connection pool and database constants
│   ├── database.ts        # Enhanced database connection handling
│   ├── security.ts        # Security monitoring and audit system
│   ├── server.ts          # Main MCP server
│   └── tools/
│       ├── schema.ts      # Schema analysis tools
│       ├── query.ts       # Data query tools
│       ├── modify.ts      # Data modification tools
│       ├── analysis.ts    # Advanced analysis tools
│       ├── tenant.ts      # Tenant management tools
│       ├── security.ts    # Security monitoring tools
│       ├── environment.ts # Database switching tools
│       └── utility.ts     # Utility and maintenance tools
├── index.ts               # Entry point
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

### Key Features

- **Dynamic Configuration**: Automatically discovers databases from environment variables
- **Enhanced Security**: Enterprise-grade security monitoring and protection
- **High Performance**: Advanced connection pooling and optimization
- **Scalable Architecture**: Support for unlimited databases without code changes

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
- Check the troubleshooting section above
- Review the tool reference documentation
- Use the built-in security and monitoring tools
- Open an issue on the repository

---

Built with ❤️ using [Bun](https://bun.sh) and the [Model Context Protocol](https://modelcontextprotocol.io)