# Hit the Lights – Browser Rhythm Game

## Overview

**Hit the Lights** is a browser-based rhythm game built with **Angular**, **TypeScript**, **SQLite**, and **REST APIs**. Players can log in, select songs with multiple difficulties, and compete for high scores.

- Play songs with 3 difficulty levels: Easy, Medium, Hard
- Track highscores, accuracy, and combo for each difficulty
- Notes are timed precisely for responsive gameplay

---

## Features

- User authentication (login/register)
- Dynamic song selection with multiple difficulties
- Score tracking per user and per difficulty
- Note charts for each song loaded from the database
- Clean, responsive browser UI

---

## Tech Stack

- **Frontend:** Angular, HTML5, SCSS
- **Backend:** Node.js, TypeScript
- **Database:** SQLite
- **APIs:** RESTful endpoints for users, songs, notes, and highscores

---

## Database Schema

| Table       | Key Columns | Notes |
|------------|------------|-------|
| **User**   | id (PK), username, password | Stores player accounts |
| **Song**   | id (PK), name, author, bpm | Stores song metadata |
| **Difficulty** | id (PK), song_id (FK), difficulty (enum), note_count | Multiple charts per song |
| **Note**   | id (PK), difficulty_id (FK), time_ms, lane, type, duration_ms | Actual gameplay note data |
| **Highscore** | user_id (FK), difficulty_id (FK), score, max_combo, accuracy, played_at | Tracks user performance per chart |

> **Note:** `difficulty` uses enums: `"Easy"`, `"Medium"`, `"Hard"`.

## Usage

1. Register a new user or log in.

2. Select a song and difficulty.

3. Play by hitting notes in time with the music.

4. Highscores are saved automatically.
