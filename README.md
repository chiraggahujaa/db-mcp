# MySQL MCP Server

A comprehensive Model Context Protocol (MCP) server for MySQL database operations, designed for AI agents and applications that need to interact with MySQL databases safely and efficiently.

## Features

### 🔗 Multi-Database Support
- Connect to multiple MySQL instances simultaneously
- Support for Local, Staging, Production, and Critical environments
- Easy database switching and context management

### 🛡️ Security & Safety
- Read-only mode for production safety
- Query result limits and timeouts
- Data modification controls
- Referential integrity validation
- SQL injection protection

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
- Custom query execution (SELECT only)

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

### Environment Variables

Create a `.env` file based on `.env.example`:

```env
# Default database connection
DEFAULT_DATABASE=local

# Security settings
MAX_QUERY_RESULTS=1000
ALLOW_DATA_MODIFICATION=true
ALLOW_DROP=false
ALLOW_TRUNCATE=false
READ_ONLY_MODE=false

# Database connections (example for local)
LOCAL_DB_HOST=localhost
LOCAL_DB_PORT=3306
LOCAL_DB_USER=root
LOCAL_DB_PASSWORD=your_password
LOCAL_DB_NAME=your_database
```

### Supported Database Connections

The server supports these predefined connections:
- `local` - Local development database
- `hm-staging-write` - Staging write database
- `hm-staging-read` - Staging read replica
- `hm-prod-write` - Production write database
- `hm-critical-write` - Critical system database

### Tenant Architecture

This MCP server supports a **database-per-tenant** architecture:

- **Connection**: A MySQL server connection (e.g., "local")
- **Tenants**: Separate databases within that connection (e.g., "tenant_a", "tenant_b", "tenant_c")
- **Tables**: Same table structure across tenants (e.g., each tenant has "users", "orders", "products" tables)

Example structure:
```
Connection "local":
├── Database "tenant_a"
│   ├── Table "users"
│   ├── Table "orders"
│   └── Table "products"
├── Database "tenant_b"
│   ├── Table "users"
│   ├── Table "orders"
│   └── Table "products"
└── Database "tenant_c"
    ├── Table "users"
    ├── Table "orders"
    └── Table "products"
```

This allows for complete data isolation between tenants while maintaining consistent schema across all tenants.

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
        "LOCAL_DB_HOST": "localhost",
        "LOCAL_DB_PASSWORD": "your_password"
      }
    }
  }
}
```

## Tool Reference

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
- `execute_custom_query` - Run custom SELECT queries

### Modification Tools
- `insert_record` - Insert single record
- `update_record` - Update records with WHERE clause
- `delete_record` - Delete records (requires confirmation)
- `bulk_insert` - Insert multiple records efficiently

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
- Enable SSL connections where possible
- Store credentials securely using environment variables
- Regularly rotate database passwords

### Query Safety
- All queries use parameterized statements
- SELECT queries are enforced for custom queries
- Result limits prevent memory exhaustion
- Query timeouts prevent long-running operations

## Troubleshooting

### Common Issues

1. **Connection refused:**
   - Check database server is running
   - Verify host, port, and credentials
   - Test connection with `test_connection` tool

2. **Permission denied:**
   - Ensure database user has required permissions
   - Check `GRANT` statements for the user

3. **TypeScript errors:**
   - Run `bun run typecheck` to validate code
   - Ensure all dependencies are installed

4. **Memory issues:**
   - Reduce `MAX_QUERY_RESULTS` limit
   - Use pagination for large datasets

### Debugging

Enable debug logging:
```bash
DEBUG=1 bun run dev
```

Check connection status:
```bash
# Use the test_connection tool through your MCP client
```

## Development

### Project Structure

```
db-mcp/
├── src/
│   ├── config.ts          # Configuration management
│   ├── database.ts        # Database connection handling
│   ├── server.ts          # Main MCP server
│   └── tools/
│       ├── schema.ts      # Schema analysis tools
│       ├── query.ts       # Data query tools
│       ├── modify.ts      # Data modification tools
│       ├── analysis.ts    # Advanced analysis tools
│       ├── tenant.ts      # Tenant management tools
│       └── utility.ts     # Utility and maintenance tools
├── index.ts               # Entry point
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

### Adding New Tools

1. Create tool function in appropriate file under `src/tools/`
2. Define Zod schema for input validation
3. Add tool registration in `src/server.ts`
4. Update tool handler in the switch statement
5. Test thoroughly with various inputs

### Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure TypeScript compilation passes
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
- Check the troubleshooting section above
- Review the tool reference documentation
- Open an issue on the repository

---

Built with ❤️ using [Bun](https://bun.sh) and the [Model Context Protocol](https://modelcontextprotocol.io)