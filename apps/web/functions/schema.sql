-- TopCinema Cloudflare D1 Database Schema (2026 Enterprise Edition)

-- 1. Profiles Table
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  avatar TEXT,
  is_kids INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Default Profile
INSERT OR IGNORE INTO profiles (id, name, avatar, is_kids) 
VALUES ('default', 'حسابي الرئيسي', '🍿', 0);

-- 2. Favorites / Watchlist Table (Categorized: movie | series | anime)
CREATE TABLE IF NOT EXISTS favorites (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL DEFAULT 'default',
  item_id TEXT NOT NULL,
  item_type TEXT NOT NULL DEFAULT 'movie', -- 'movie' | 'series' | 'anime'
  title TEXT NOT NULL,
  poster TEXT,
  quality TEXT,
  imdb TEXT,
  genres TEXT, -- JSON string array
  year TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(profile_id, item_id)
);

-- 3. Continue Watching / History Table
CREATE TABLE IF NOT EXISTS watch_history (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL DEFAULT 'default',
  item_id TEXT NOT NULL,
  title TEXT NOT NULL,
  poster TEXT,
  quality TEXT,
  current_time REAL NOT NULL DEFAULT 0,
  duration REAL NOT NULL DEFAULT 0,
  percent REAL NOT NULL DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(profile_id, item_id)
);

-- 4. User Settings & Preferences
CREATE TABLE IF NOT EXISTS user_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 5. Auth Accounts (source of truth — the auth layer depends on this table;
--    previously it existed only out-of-band, see SECURITY_AUDIT.md F-17)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer', -- owner | admin | viewer
  active INTEGER NOT NULL DEFAULT 1,
  token_version INTEGER NOT NULL DEFAULT 0, -- bumped on password/role change to revoke sessions
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
