// Use CommonJS so it works with the backend's "type": "commonjs"
const dns = require('dns');

// Prefer IPv4 when resolving hostnames. This avoids Supabase AAAA records on
// environments that cannot reach IPv6 (Render instances often hit ENETUNREACH).
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

const originalLookup = dns.lookup.bind(dns);
dns.lookup = function patchedLookup(hostname, options, callback) {
  const isSupabaseHost = typeof hostname === 'string' && hostname.toLowerCase().includes('supabase.co');

  if (isSupabaseHost) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    const ipv4Options = typeof options === 'object' && options !== null
      ? { ...options, family: 4, all: false }
      : { family: 4, all: false };

    return originalLookup(hostname, ipv4Options, callback);
  }

  return originalLookup(hostname, options, callback);
};

const postgres = require('postgres');

// Use DATABASE_URL from environment (Render / Supabase style connection string)
const connectionString = process.env.DATABASE_URL;

// Configure ssl for hosted Postgres providers (Supabase requires TLS).
// We set rejectUnauthorized=false to avoid issues with some platforms; rotate/adjust for production security.
const opts = {};
if (connectionString) {
  // If user explicitly set PGSSLMODE=disable, don't override.
  const sslEnv = process.env.PGSSLMODE;
  if (!sslEnv || sslEnv.toLowerCase() !== 'disable') {
    opts.ssl = { rejectUnauthorized: false };
  }
}

const sql = postgres(connectionString, opts);

module.exports = sql;


