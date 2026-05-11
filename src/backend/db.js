// Use CommonJS so it works with the backend's "type": "commonjs"
const postgres = require('postgres');

// Use DATABASE_URL from environment (Render / Supabase style connection string)
const connectionString = process.env.DATABASE_URL;

// Configure ssl for hosted Postgres providers (Supabase requires TLS).
// We set rejectUnauthorized=false to avoid issues with some platforms; rotate/adjust for production security.
const opts = {};
if (connectionString) {
  // If user explicitly set PGSSLMODE=disable, don't override.
  const sslEnv = process.env.PGSSLMODE || process.env.PGSSLMODE;
  if (!sslEnv || sslEnv.toLowerCase() !== 'disable') {
	opts.ssl = { rejectUnauthorized: false };
  }
}

const sql = postgres(connectionString, opts);

module.exports = sql;


