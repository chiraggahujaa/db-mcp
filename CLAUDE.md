---
description: Multi-Database MCP Server with dynamic configuration and security features
globs: "*.ts, *.tsx, *.html, *.css, *.js, *.jsx, package.json, .env*"
alwaysApply: false
---

## Multi-Database Configuration System

This project uses a **generalized numbered environment variable system** for multi-database configuration supporting MySQL, PostgreSQL, SQLite, and Supabase:

### Environment Variable Pattern
- Use `DB_TYPE_1`, `DB_HOST_1`, `DB_PORT_1`, etc. (numbered, not hardcoded names)
- Database IDs are automatically generated as `db_1`, `db_2`, `db_3`, etc.
- System automatically discovers databases by scanning for `DB_TYPE_*` variables
- Each database type has specific required variables

### Required Variables by Database Type

#### MySQL, PostgreSQL
```bash
DB_TYPE_1=mysql|postgresql
DB_HOST_1=hostname
DB_PORT_1=3306|5432
DB_USER_1=username
DB_PASSWORD_1=password
DB_NAME_1=database_name  # optional
DB_SSL_1=true|false      # optional
```

#### SQLite
```bash
DB_TYPE_2=sqlite
DB_FILE_2=/path/to/database.db
# OR
DB_NAME_2=:memory:  # for in-memory database
```

#### Supabase
```bash
DB_TYPE_3=supabase
DB_PROJECT_URL_3=https://project.supabase.co
DB_ANON_KEY_3=anon_key
DB_SERVICE_KEY_3=service_key  # optional, for admin operations
```


### Usage Examples
- `switch_environment db_1` (MySQL database)
- `switch_environment db_2` (SQLite database)
- `switch_environment db_3` (Supabase database)
- Default database: `DEFAULT_DATABASE=db_1`

### Fault Tolerance
- Each database connection is completely independent
- Connection failures are isolated and don't affect other databases
- Automatic retry logic with exponential backoff
- Health monitoring with auto-recovery
- Server continues operating even if some databases fail

## Runtime Environment

Default to using Bun instead of Node.js:

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Bun automatically loads .env, so don't use dotenv.
