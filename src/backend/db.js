// Use CommonJS so it works with the backend's "type": "commonjs"
const dns = require('dns');
const net = require('net');

// Prefer IPv4 when resolving hostnames. This avoids Supabase AAAA records on
// environments that cannot reach IPv6 (Render instances often hit ENETUNREACH).
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

// Use public DNS resolvers for A-record lookups so Render's local resolver
// cannot force an IPv6 answer first.
if (typeof dns.setServers === 'function') {
  try {
    dns.setServers(['1.1.1.1', '8.8.8.8']);
  } catch (e) {
    // ignore if the runtime disallows changing resolvers
  }
}

const postgres = require('postgres');

const { URL } = require('url');

// Prefer the Supabase pooler URL when provided; it is more reliable on cloud hosts.
// Fallback to DATABASE_URL for local/dev setups.
const connectionString = process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL;

let clientPromise;

async function resolveIPv4(hostname) {
  if (net.isIP(hostname) === 4) {
    return hostname;
  }

  try {
    const lookup = await dns.promises.lookup(hostname, { family: 4 });
    if (lookup?.address) {
      return lookup.address;
    }
  } catch (err) {
    // fall through to resolve4 and DoH
  }

  try {
    const records = await dns.promises.resolve4(hostname);
    return records && records.length > 0 ? records[0] : hostname;
  } catch (err) {
    try {
      const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=A`;
      const response = await fetch(url, {
        headers: {
          Accept: 'application/dns-json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        const answer = Array.isArray(data?.Answer)
          ? data.Answer.find((item) => item && item.type === 1 && typeof item.data === 'string')
          : undefined;

        if (answer && answer.data) {
          return answer.data;
        }
      }
    } catch (dohErr) {
      // ignore and fall back to hostname
    }

    return hostname;
  }
}

async function createClient() {
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  const parsed = new URL(connectionString);
  const originalHost = parsed.hostname;
  const resolvedHost = await resolveIPv4(originalHost);

  const opts = {
    host: resolvedHost,
    port: Number(parsed.port || (originalHost.toLowerCase().includes('pooler') ? 6543 : 5432)),
    database: parsed.pathname.replace(/^\//, ''),
    username: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
  };

  const sslEnv = process.env.PGSSLMODE;
  if (!sslEnv || sslEnv.toLowerCase() !== 'disable') {
    opts.ssl = {
      rejectUnauthorized: false,
      servername: originalHost,
    };
  }

  return postgres(opts);
}

async function getClient() {
  if (!clientPromise) {
    clientPromise = createClient();
  }
  return clientPromise;
}


module.exports = getClient;
module.exports.getClient = getClient;

module.exports.unsafe = async function unsafe(...args) {
  const client = await getClient();
  return client.unsafe(...args);
};

module.exports.query = async function query(...args) {
  const client = await getClient();
  if (typeof client.query === 'function') return client.query(...args);
  if (typeof client.unsafe === 'function') return client.unsafe(...args);
  throw new Error('Postgres client does not support query/unsafe');
};

