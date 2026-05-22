const postgres = require('postgres');

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:b80GkW0fsAtVCkaT@db.tubpwysojkbkzqsuwebs.supabase.co:5432/postgres';

const sql = postgres(connectionString);

module.exports = sql;

