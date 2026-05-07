# Hit the Lights – Browser Rhythm Game

## Overview

**Hit the Lights** is a browser-based rhythm game built with **Angular**, **TypeScript**, **Node.js**, and **SQLite**. Players can log in, upload or select songs, play charts with lane-based input, and track their performance against increasingly strict timing windows.

The current codebase includes:

- rhythm gameplay with falling-note timing and keyboard lanes
- four score ranks: **Radiant**, **Shinning**, **Glimmer**, and **Shatterred**
- stricter timing so very early key presses count as misses
- user accounts with login, registration, playtime tracking, and profile pictures
- song uploads with public/private visibility and owner checks
- song charts with multiple difficulties and saved highscores
- friends and in-game messaging

---

## Current Scope

- Play songs with 4 difficulty levels: Easy, Medium, Hard, Expert
- Load note charts from the database for each difficulty
- Track score, combo, max combo, accuracy, and playtime per user
- Use owner-aware public/private song access in the menu and gameplay screens
- Keep gameplay responsive in the browser with a clean UI and animated hit effects

---

## Tech Stack

- **Frontend:** Angular, HTML5, SCSS
- **Backend:** Node.js, TypeScript, Express
- **Database:** SQLite
- **APIs:** RESTful endpoints for auth, songs, charts, highscores, friendships, messages, and playtime

---

## Database Schema

| Table | Key Columns | Notes |
|---|---|---|
| **User** | id (PK), username, password, profilePicture, joinDate, playtime_seconds | Stores player accounts and total playtime |
| **Song** | id (PK), name, author, bpm, length, songUrl, coverUrl, ownerId, isPublic | Stores song metadata and ownership |
| **Difficulty** | id (PK), song_id (FK), difficulty, note_count | Multiple charts per song |
| **Note** | id (PK), difficulty_id (FK), time_ms, lane, type, duration_ms | Actual gameplay note data |
| **Highscore** | user_id (FK), difficulty_id (FK), score, max_combo, accuracy, date | Tracks user performance per chart |
| **Friendship** | id (PK), requester_id, addressee_id, status, created_at | Friend request and friendship state |
| **Message** | id (PK), sender_id, receiver_id, content, created_at, is_read | In-game messaging between users |

> **Note:** Score grading is currently tied to the in-game judgement system and the saved highscore values.

---

## Usage

1. Register a new user or log in.
2. Upload a song or choose an existing one.
3. Select a difficulty and play by hitting notes in time with the music.
4. Highscores, accuracy, combo, and playtime are saved automatically.

---

## Sprint and Test Plan

> [SprintPlan](https://htblaleonding-my.sharepoint.com/:x:/g/personal/a_tripathi_students_htl-leonding_ac_at/IQDuOY5lv0FzQJTGff9duxpMAfC1A7UADO8V7JgzpamJT5s?e=jEsv3c)
> [TestPlan](https://onedrive.live.com/:x:/g/personal/294434c6cad75727/IQCLrD-9x-SpTKgfjicWcseqAZybJu_62oxyEzaLB1cAJZA?rtime=BQvN8Yic3kg&redeem=aHR0cHM6Ly8xZHJ2Lm1zL3gvYy8yOTQ0MzRjNmNhZDc1NzI3L0lRQ0xyRC05eC1TcFRLZ2ZqaWNXY3NlcUFaeWJKdV82Mm94eUV6YUxCMWNBSlpBP2U9c3hhcmds)
