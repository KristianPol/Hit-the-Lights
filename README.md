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
| **User**       | id (PK), username, password, profilePicture, joinDate, playtime\_seconds  | Stores player accounts and total playtime  |
| **Song**       | id (PK), name, author, bpm, length, songUrl, coverUrl, ownerId, isPublic  | Stores song metadata and ownership         |
| **Difficulty** | id (PK), song\_id (FK), difficulty, note\_count                           | Multiple charts per song                   |
| **Note**       | id (PK), difficulty\_id (FK), time\_ms, lane, type, duration\_ms          | Actual gameplay note data                  |
| **Highscore**  | user\_id (FK), difficulty\_id (FK), score, max\_combo, accuracy, date     | Tracks user performance per chart          |
| **Friendship** | id (PK), requester\_id, addressee\_id, status, created\_at                | Friend request and friendship state        |
| **Message**    | id (PK), sender\_id, receiver\_id, content, created\_at, is\_read         | In-game messaging between users            |

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

