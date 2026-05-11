const path = require('path');

// Load .env from repository root so DATABASE_URL is available when this script runs.
// The backend uses CommonJS; load dotenv before importing the DB client.
try {
  require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
} catch (e) {
  // ignore if dotenv not installed; user can set env manually
}

const sql = require('../db');

async function run() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL is not set. Set it in your environment or .env before running this script.');
    process.exit(1);
  }

  console.log('Connecting to Postgres and creating tables (no data will be copied)...');

  try {
    // Create tables mirroring the SQLite schema but adapted for Postgres types.
    await sql`CREATE TABLE IF NOT EXISTS "Song" (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      author TEXT NOT NULL,
      bpm INTEGER NOT NULL,
      length TEXT NOT NULL,
      songUrl TEXT NOT NULL,
      coverUrl TEXT NOT NULL,
      ownerId INTEGER,
      isPublic BOOLEAN NOT NULL DEFAULT TRUE
    );`;

    await sql`CREATE TABLE IF NOT EXISTS "User" (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      profilePicture BYTEA,
      joinDate TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      playtime_seconds INTEGER NOT NULL DEFAULT 0
    );`;

    await sql`CREATE TABLE IF NOT EXISTS "Difficulty" (
      id SERIAL PRIMARY KEY,
      song_id INTEGER NOT NULL REFERENCES "Song"(id) ON DELETE CASCADE,
      difficulty INTEGER NOT NULL,
      note_count INTEGER NOT NULL
    );`;

    await sql`CREATE TABLE IF NOT EXISTS "Highscore" (
      user_id INTEGER NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
      difficulty_id INTEGER NOT NULL REFERENCES "Difficulty"(id) ON DELETE CASCADE,
      score INTEGER NOT NULL,
      max_combo INTEGER NOT NULL,
      accuracy INTEGER NOT NULL,
      date TIMESTAMP NOT NULL,
      PRIMARY KEY (user_id, difficulty_id)
    );`;

    await sql`CREATE TABLE IF NOT EXISTS "Note" (
      id SERIAL PRIMARY KEY,
      difficulty_id INTEGER NOT NULL REFERENCES "Difficulty"(id) ON DELETE CASCADE,
      time_ms INTEGER NOT NULL,
      lane INTEGER NOT NULL,
      type INTEGER NOT NULL,
      duration_ms INTEGER
    );`;

    await sql`CREATE TABLE IF NOT EXISTS "Friendship" (
      id SERIAL PRIMARY KEY,
      requester_id INTEGER NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
      addressee_id INTEGER NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(requester_id, addressee_id)
    );`;

    await sql`CREATE TABLE IF NOT EXISTS "Message" (
      id SERIAL PRIMARY KEY,
      sender_id INTEGER NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
      receiver_id INTEGER NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      is_read BOOLEAN NOT NULL DEFAULT FALSE
    );`;

    // Indexes similar to SQLite setup
    await sql`CREATE INDEX IF NOT EXISTS idx_highscore_leaderboard ON "Highscore" (difficulty_id, score DESC, accuracy DESC, max_combo DESC, date ASC);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_message_conversation ON "Message" (sender_id, receiver_id, created_at);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_message_receiver ON "Message" (receiver_id, is_read);`;

    console.log('Schema created successfully. No data was transferred.');
  } catch (err) {
    console.error('Error creating schema in Postgres:', err);
    process.exitCode = 2;
  } finally {
    try {
      await sql.end({ timeout: 1000 });
    } catch (e) {
      // ignore
    }
  }
}

run();

