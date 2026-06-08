# Hit the Lights – Browser Rhythm Game

## Overview

**Hit the Lights** is a browser-based rhythm game built with **Angular 21**, **TypeScript** and **Node.js/Express**). Players register, upload or select songs, play lane-based note charts, and track personal performance across multiple difficulties.

The codebase includes:

- Real-time rhythm gameplay with falling-note timing and keyboard lane input
- Four score ranks: **Radiant**, **Shining**, **Glimmer**, and **Shattered**
- Strict timing windows — early key presses register as misses
- User accounts with login, registration, profile pictures, and total playtime tracking
- Song uploads with public/private visibility and owner-based access control
- Song charts with multiple difficulties and per-user highscore persistence
- Social layer: friend requests and in-game messaging between users

---

## Tech Stack

| Layer        | Technology                                    |
| ------------ |-----------------------------------------------|
| **Frontend** | Angular 21, TypeScript 5.9, SCSS, FontAwesome |
| **Backend**  | Node.js, Express 5, TypeScript                |
| **Database** | srbetter-sqlite3                              |
| **Testing**  | Jest, ts-jest, Vitest, jsdom                  |
| **Tooling**  | Angular CLI 21, Prettier, ESLint              |

---

## Project Structure

```
Hit-the-Lights/
├── src/
│   ├── app/          # Angular components, services, routes
│   ├── backend/      # Express API server
│   └── styles.scss   # Global styles
├── assets/           # Static assets
├── public/           # Public-facing static files
├── agents/           # AI coding agent config
├── proxy.conf.json   # Dev proxy: /api and /uploads → localhost:3000
└── angular.json      # Angular workspace config
```

---

## Database Schema

| Table          | Key Columns                                                               | Notes                                      |
| -------------- | ------------------------------------------------------------------------- | ------------------------------------------ |
| **User**       | id (PK), username, password, profilePicture, joinDate, playtime_seconds, settings_json, analytics columns (perfect_total, good_total, glimmer_total, miss_total, total_score, total_accuracy, runs_count)  | Stores player accounts, serialized settings (legacy), and aggregated analytics/playtime  |
| **UserControls** | user_id (PK, FK→User.id), lane_bindings_json, note_speed, created_at, updated_at | Per-user persisted controls/keybindings and note speed (migrated from User.settings_json) |
| **Song**       | id (PK), name, author, bpm, length, songUrl, coverUrl, ownerId, isPublic  | Stores song metadata and ownership         |
| **Difficulty** | id (PK), song_id (FK), difficulty, note_count                           | Multiple charts per song                   |
| **Note**       | id (PK), difficulty_id (FK), time_ms, lane, type, duration_ms          | Actual gameplay note data                  |
| **Highscore**  | user_id (FK), difficulty_id (FK), score, max_combo, accuracy, date     | Tracks user performance per chart; unique per (user_id, difficulty_id) enforced |
| **Friendship** | id (PK), requester_id, addressee_id, status, created_at                | Friend request and friendship state        |
| **Message**    | id (PK), sender_id, receiver_id, content, created_at, is_read         | In-game messaging between users; indexes on conversation and receiver |

---

## Getting Started

### Prerequisites

- Node.js 20+
- npm 11+

---

## Gameplay

1. Register a new account or log in.
2. Upload a song (with cover art) or browse the public song library.
3. Select a difficulty — Easy, Medium, Hard, or Expert.
4. Hit notes in time using your keyboard as they fall into the hit zone.
5. Highscores, accuracy, max combo, and total playtime are saved automatically.

---

## Gaming Features (what the game offers)

This project includes a number of gameplay and social features designed to give players a complete rhythm-game experience:

- Lane-based rhythm gameplay: four lanes with falling-note charts, precise timing windows, and responsive keyboard input.
- Multiple difficulty charts per song: authors can upload multiple difficulty files so players can pick a suitable challenge.
- Scoring & ranking: points are awarded per note with granular scoring; final runs produce a rank (Radiant/Shining/Glimmer/Shattered).
- Accuracy & combo tracking: the HUD shows a live accuracy percentage, current combo, and max combo during play; detailed counts (Radiant/Shining/Glimmer/Shattered) are shown on the results screen after a run.
- Keybindings & per-user controls: players can remap lane keys in Settings; key mappings are saved per account (not global) and persist across devices when logged in. Guest play keeps local defaults.
- Note speed / difficulty tuning: players can adjust note fall speed (e.g. 0.5x–2.5x) from Settings.
- Upload songs & covers: users can upload audio + cover art and choose public/private visibility for their songs.
- Chart uploads: authors can upload chart JSON for difficulties which are associated with a song and difficulty level.
- Leaderboards & highscores: per-difficulty leaderboards and per-user personal bests are recorded and shown.
- Social features: friend requests, a friends list, and in-app messaging so players can connect and share scores.
- Send score / share: after finishing a run, logged-in players can send a score summary to friends.
- Profile pictures: upload a profile picture which is stored on the server and displayed around the site.
- Playtime & analytics: playtime is tracked and aggregated for analytics (stored per user on the server).
- Offline/guest support: the app provides reasonable fallbacks so guests can play without logging in; localStorage keeps guest settings.

These features combine to provide a social, persistent rhythm-game experience focused on timing, practice, and friendly competition.

## What a user can do (step-by-step)

Below are the typical actions a player can perform and where to find them in the UI:

- Create an account / login: use the Register and Login screens. Usernames are limited to 20 characters.
- Upload a track: open the Menu → Add New Track dialog. Provide track name and artist (both limited to 40 characters), BPM, a cover image and an MP3 file. You can mark the song public or private.
- Browse songs: the main menu lists public songs and your uploads. Select a song to view difficulties and start a run.
- Choose difficulty: when selecting a song, pick the difficulty (Easy/Medium/Hard/Expert) — each difficulty loads its own chart.
- Play a run: press the configured lane keys (defaults: D F J K) to hit the falling notes. The first valid key starts playback.
- Change controls and speed: open Settings to remap lane keys (press a lane and then press the new key) and adjust note speed. Settings are saved per-user on the server when logged in; guests keep settings locally.
- View results: after a run, the results screen shows final score, rank, accuracy percentage, max combo, and detailed counts for each judgment category.
- Send scores: if logged in, use the Send Score modal on the results screen to message selected friends a summary of your run.
- Social and messaging: add friends from other user pages, view your friends list, and send messages via the Messages page.
- Profile & avatar: upload a profile picture from the profile page.
- Track playtime & analytics: playtime accumulates and is periodically sent to the server; view consolidated analytics via your profile.

---

## Score Ranks

| Rank          | Threshold         |
| ------------- | ----------------- |
| ✦ Radiant     | S-tier accuracy   |
| ✧ Shining     | A-tier accuracy   |
| ◈ Glimmer     | B-tier accuracy   |
| ✕ Shattered   | Below B-tier      |

---

## API Overview

The Express backend exposes RESTful endpoints under `/api`:

| Resource      | Endpoints                                      |
| ------------- | ---------------------------------------------- |
| Auth          | `POST /api/auth/register`, `/api/auth/login`   |
| Songs         | CRUD + visibility toggle                        |
| Charts        | Per-difficulty note data                        |
| Highscores    | Per-user per-chart personal bests               |
| Friendships   | Send, accept, reject, list                      |
| Messages      | Send, list, mark as read                        |
| Playtime      | Increment and fetch total session time          |

---

## Sprint and Test Plan

> [Sprint Plan](https://htblaleonding-my.sharepoint.com/:x:/g/personal/a_tripathi_students_htl-leonding_ac_at/IQDuOY5lv0FzQJTGff9duxpMAfC1A7UADO8V7JgzpamJT5s?e=jEsv3c) · [Test Plan](https://onedrive.live.com/:x:/g/personal/294434c6cad75727/IQCLrD-9x-SpTKgfjicWcseqAZybJu_62oxyEzaLB1cAJZA)

---

