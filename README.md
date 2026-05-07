# Hit the Lights – Browser Rhythm Game

## Overview

**Hit the Lights** is a browser-based rhythm game built with **Angular**, **TypeScript**, **Node.js**, and **SQLite**. Players can log in, choose songs with multiple difficulties, and aim for the best possible score while keeping time with the music.

The project currently includes:

- rhythm gameplay with note timing and lane-based input
- user accounts with login and registration
- song selection with multiple difficulties
- saved highscores, accuracy, combo, and playtime tracking

---

## Current Scope

- Play songs with 3 difficulty levels: Easy, Medium, Hard
- Track highscores, accuracy, combo, and playtime per user
- Load note charts from the database for each difficulty
- Keep gameplay responsive in the browser with a clean UI

---

## Planned Features

We are currently expanding the project scope with the following features:

- an additional **"Okay" score** rank/tier between the current lower and higher performance results
- **friend functionality** so players can connect with other users
- **messaging** so friends can send messages inside the game

---

## Tech Stack

- **Frontend:** Angular, HTML5, SCSS
- **Backend:** Node.js, TypeScript, Express
- **Database:** SQLite
- **APIs:** RESTful endpoints for users, songs, charts, highscores, and playtime

---

## Database Schema

| Table | Key Columns | Notes |
|---|---|---|
| **User** | id (PK), username, password, playtime_seconds | Stores player accounts and total playtime |
| **Song** | id (PK), name, author, bpm | Stores song metadata |
| **Difficulty** | id (PK), song_id (FK), difficulty, note_count | Multiple charts per song |
| **Note** | id (PK), difficulty_id (FK), time_ms, lane, type, duration_ms | Actual gameplay note data |
| **Highscore** | user_id (FK), difficulty_id (FK), score, max_combo, accuracy, date | Tracks user performance per chart |

> **Note:** `difficulty` is stored per chart/difficulty, and score/rank handling may be expanded as the project grows.

---

## Usage

1. Register a new user or log in.
2. Select a song and difficulty.
3. Play by hitting notes in time with the music.
4. Highscores and playtime are saved automatically.

---

## Sprint and Test Plan

> [SprintPlan](https://htblaleonding-my.sharepoint.com/:x:/g/personal/a_tripathi_students_htl-leonding_ac_at/IQDuOY5lv0FzQJTGff9duxpMAfC1A7UADO8V7JgzpamJT5s?e=jEsv3c)
> [TestPlan](https://onedrive.live.com/:x:/g/personal/294434c6cad75727/IQCLrD-9x-SpTKgfjicWcseqAZybJu_62oxyEzaLB1cAJZA?rtime=BQvN8Yic3kg&redeem=aHR0cHM6Ly8xZHJ2Lm1zL3gvYy8yOTQ0MzRjNmNhZDc1NzI3L0lRQ0xyRC05eC1TcFRLZ2ZqaWNXY3NlcUFaeWJKdV82Mm94eUV6YUxCMWNBSlpBP2U9c3hhcmds)
