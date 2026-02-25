# Hit The Lights - Agent Guide

> **Project**: Hit The Lights  
> **Type**: Rhythm-based music game with Angular frontend and Express/SQLite backend  
> **Last Updated**: 2026-02-26

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture Overview](#architecture-overview)
3. [Technology Stack](#technology-stack)
4. [Project Structure](#project-structure)
5. [Frontend (Angular)](#frontend-angular)
6. [Backend (Express/SQLite)](#backend-expresssqlite)
7. [Database Schema](#database-schema)
8. [Testing Guidelines](#testing-guidelines)
9. [Code Conventions](#code-conventions)
10. [Development Workflow](#development-workflow)
11. [Common Tasks](#common-tasks)
12. [Troubleshooting](#troubleshooting)

---

## Project Overview

**Hit The Lights** is a rhythm-based music game where players hit notes in time with music. The application features:

- **User Authentication**: Login and registration system
- **Song Library**: Browse and select tracks to play
- **Difficulty Levels**: Multiple difficulty settings per song
- **Highscores**: Track player performance and rankings
- **Note Patterns**: Dynamic note generation for gameplay

### Current Status

| Component | Status |
|-----------|--------|
| Frontend UI | ✅ Functional (login, register, menu) |
| Database Schema | ✅ Complete |
| HTLService (JSON conversion) | ✅ Implemented & Tested |
| Backend API Routes | ❌ Not implemented |
| Gameplay Component | ❌ Not implemented |
| Authentication Service | ❌ Not implemented |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              HIT THE LIGHTS                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────────┐         ┌──────────────────────┐                 │
│  │     FRONTEND         │         │      BACKEND         │                 │
│  │   (Angular 21)       │◄───────►│   (Express + SQLite) │                 │
│  │                      │  HTTP   │                      │                 │
│  │  • LoginComponent    │         │  • server.ts         │                 │
│  │  • Register          │         │  • HTLService        │                 │
│  │  • MenuComponent     │         │  • Unit (DB)         │                 │
│  │  • AppComponent      │         │                      │                 │
│  └──────────────────────┘         └──────────────────────┘                 │
│           │                                 │                               │
│           ▼                                 ▼                               │
│  ┌──────────────────────┐         ┌──────────────────────┐                 │
│  │    src/frontend/     │         │     src/backend/     │                 │
│  │    src/app/          │         │     htl.db (SQLite)  │                 │
│  └──────────────────────┘         └──────────────────────┘                 │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────┐          │
│  │                     TESTS (Jest/Jasmine)                      │          │
│  │  • src/tests/HTLService.spec.ts    (Jest - backend)          │          │
│  │  • src/app/app.spec.ts             (Angular)                 │          │
│  │  • src/frontend/**/*.spec.ts       (Angular)                 │          │
│  └──────────────────────────────────────────────────────────────┘          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| Angular | 21.1.0 | Frontend framework |
| TypeScript | 5.9.2 | Primary language |
| RxJS | 7.8.0 | Reactive programming |
| SCSS | - | Styling |
| Angular CLI | 21.1.3 | Build tooling |

### Backend
| Technology | Version | Purpose |
|------------|---------|---------|
| Express | 5.2.1 | HTTP server framework |
| better-sqlite3 | 12.6.2 | SQLite database driver |
| TypeScript | 5.9.2 | Primary language |

### Testing
| Technology | Version | Purpose |
|------------|---------|---------|
| Jest | 29.7.0 | Backend testing |
| ts-jest | 29.2.6 | TypeScript support for Jest |
| Angular TestBed | Built-in | Frontend component testing |
| Vitest | 4.0.8 | (Available but unused - prefer Jest) |

### Build Tools
| Tool | Version | Purpose |
|------|---------|---------|
| npm | 11.8.0 | Package manager |
| Node.js | Latest LTS | Runtime |

---

## Project Structure

```
Hit-The-Lights/
├── agents/
│   └── AGENTS.md              # This file
├── assets/
│   └── HTL(proj).png         # Logo asset
├── node_modules/              # Dependencies
├── public/                    # Public static files
├── src/
│   ├── app/
│   │   ├── app.config.ts      # Angular app configuration
│   │   ├── app.html           # Root template (router outlet)
│   │   ├── app.routes.ts      # Route definitions
│   │   ├── app.scss           # Root styles
│   │   ├── app.spec.ts        # App component tests
│   │   └── app.ts             # Root component
│   ├── backend/
│   │   ├── htl.db             # SQLite database file
│   │   ├── HTLService.ts      # Business logic & JSON conversion
│   │   ├── model.ts           # TypeScript type definitions
│   │   ├── package.json       # Backend-specific dependencies
│   │   ├── server.ts          # Express server entry point
│   │   ├── tsconfig.json      # Backend TypeScript config
│   │   ├── unit.ts            # Database transaction handler
│   │   ├── routers/           # Express routers
│   │   │   ├── authRouter.ts  # Authentication routes
│   │   │   └── index.ts       # Router exports
│   │   └── services/          # Business services
│   │       ├── RegistrationService.ts  # User registration
│   │       ├── AuthenticationService.ts # User authentication
│   │       └── index.ts       # Service exports
│   ├── frontend/
│   │   ├── login/
│   │   │   ├── login.component.html
│   │   │   ├── login.component.scss
│   │   │   ├── login.component.ts
│   │   │   └── login.module.ts
│   │   ├── menu/
│   │   │   ├── menu.html
│   │   │   ├── menu.scss
│   │   │   ├── menu.spec.ts
│   │   │   └── menu.ts
│   │   └── register/
│   │       ├── register.html
│   │       ├── register.scss
│   │       ├── register.spec.ts
│   │       └── register.ts
│   ├── tests/
│   │   └── HTLService.spec.ts # Backend service tests (Jest)
│   ├── index.html             # Main HTML entry
│   ├── main.ts                # Angular bootstrap
│   └── styles.scss            # Global styles
├── angular.json               # Angular CLI configuration
├── jest.config.js             # Jest configuration (backend tests)
├── package.json               # Root package.json
├── package-lock.json
├── README.md
├── tsconfig.json              # Root TypeScript config
├── tsconfig.app.json          # App-specific TypeScript config
└── tsconfig.spec.json         # Test-specific TypeScript config
```

---

## Frontend (Angular)

### Component Architecture

All components use Angular's **standalone component** pattern (no NgModules except `login.module.ts` which is legacy).

#### Key Components

| Component | Selector | Purpose |
|-----------|----------|---------|
| `App` | `app-root` | Root component, contains router outlet |
| `LoginComponent` | `app-login` | User login form with validation |
| `Register` | `app-register` | User registration (extends LoginComponent) |
| `MenuComponent` | `app-menu` | Main menu with song library |

#### Routing

```typescript
// src/app/app.routes.ts
const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: Register },
  { path: 'menu', component: MenuComponent }
];
```

#### Component Patterns

**Standalone Component Example:**
```typescript
@Component({
  selector: 'app-example',
  standalone: true,  // <-- Standalone pattern
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './example.html',
  styleUrls: ['./example.scss']
})
export class ExampleComponent { }
```

**Inheritance Pattern (Register extends Login):**
```typescript
export class Register extends LoginComponent {
  constructor(formBuilder: FormBuilder) {
    super(formBuilder);
  }
  // Extends login form behavior
}
```

### Form Handling

Uses **Reactive Forms** with validation:

```typescript
this.loginForm = this.formBuilder.group({
  username: ['', [Validators.required, Validators.minLength(3)]],
  password: ['', [Validators.required, Validators.minLength(6)]]
});
```

### Running Frontend

```bash
# Development server
npm start
# or
ng serve

# Open browser
http://localhost:4200
```

---

## Backend (Express/SQLite)

### Architecture

The backend follows a layered architecture:

```
┌─────────────────────────────────────────┐
│           server.ts                     │
│     (HTTP routes - NOT IMPLEMENTED)     │
├─────────────────────────────────────────┤
│           HTLService.ts                 │
│  (Business logic, JSON conversion)      │
├─────────────────────────────────────────┤
│           unit.ts                       │
│  (Database transactions, connections)   │
├─────────────────────────────────────────┤
│           htl.db (SQLite)               │
│  (Data persistence)                     │
└─────────────────────────────────────────┘
```

### Unit Class (Database Layer)

The `Unit` class manages database connections and transactions:

```typescript
const unit = new Unit(readOnly: boolean);

// Prepare statements with typed parameters
const stmt = unit.prepare<ResultType, ParamType>(
  'SELECT * FROM User WHERE id = $userId',
  { userId: 1 }
);

// Execute
const result = stmt.get();     // Single row
const results = stmt.all();    // All rows
stmt.run();                    // Execute (INSERT/UPDATE)

// Complete transaction
unit.complete(true);   // Commit
unit.complete(false);  // Rollback
```

### HTLService (Business Logic Layer)

Provides JSON serialization/deserialization for all entities:

#### toJSON Methods

| Method | Description |
|--------|-------------|
| `userToJSON(user)` | Convert User to JSON (excludes password) |
| `songToJSON(song, includeDifficulties?)` | Convert Song, optionally with difficulties |
| `difficultyToJSON(difficulty, includeNotes?)` | Convert Difficulty, optionally with notes |
| `noteToJSON(note)` | Convert Note to JSON |
| `highscoreToJSON(highscore)` | Convert Highscore (always includes username/song) |
| `toJSON(entity, type, options?)` | Generic router method |

#### fromJSON Methods

| Method | Validation |
|--------|------------|
| `userFromJSON(json)` | username ≥3 chars, password ≥6 |
| `songFromJSON(json)` | name/author required, BPM > 0 |
| `difficultyFromJSON(json)` | difficulty 1-10, valid song_id |
| `noteFromJSON(json)` | lane 1-4, non-negative time |
| `highscoreFromJSON(json)` | accuracy 0-100, auto-date |
| `fromJSON(json, type)` | Generic router method |

### Current Backend Status

**WARNING**: The backend currently has **no API routes** implemented. The `server.ts` only:
- Creates a database connection
- Immediately closes it
- Starts an Express server that does nothing

```typescript
// src/backend/server.ts (CURRENT - NON-FUNCTIONAL)
const app = express();
const unit = new Unit(false);
unit.complete(true);  // Immediately commits and closes!
app.listen(PORT);     // No routes defined!
```

### Running Backend

```bash
cd src/backend
npx ts-node server.ts
```

---

## Database Schema

### Entity Relationship Diagram

```
┌─────────────┐       ┌─────────────────┐       ┌─────────────┐
│    User     │       │   Highscore     │       │  Difficulty │
├─────────────┤       ├─────────────────┤       ├─────────────┤
│ PK id       │◄──────┤ FK user_id      │       │ PK id       │
│    username │       │ FK difficulty_id├──────►│ FK song_id  │
│    password │       │    score        │       │    difficulty
└─────────────┘       │    max_combo    │       │    note_count
                      │    accuracy     │       └──────┬──────┘
                      │    date         │              │
                      └─────────────────┘              │
                                                      │
┌─────────────┐                              ┌────────▼─────┐
│    Song     │                              │     Note     │
├─────────────┤                              ├──────────────┤
│ PK id       │◄─────────────────────────────┤ FK difficulty│
│    name     │                              │ PK id        │
│    author   │                              │    time_ms   │
│    bpm      │                              │    lane      │
└─────────────┘                              │    type      │
                                             │    duration  │
                                             └──────────────┘
```

### Table Definitions

```sql
-- Users table
CREATE TABLE User (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL
);

-- Songs table
CREATE TABLE Song (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  author TEXT NOT NULL,
  bpm INTEGER NOT NULL
);

-- Difficulty levels per song
CREATE TABLE Difficulty (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  song_id INTEGER NOT NULL,
  difficulty INTEGER NOT NULL,  -- 1-10 scale
  note_count INTEGER NOT NULL,
  FOREIGN KEY (song_id) REFERENCES Song(id)
);

-- Notes for gameplay (hit patterns)
CREATE TABLE Note (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  difficulty_id INTEGER NOT NULL,
  time_ms INTEGER NOT NULL,     -- Time in milliseconds
  lane INTEGER NOT NULL,        -- 1-4 ( gameplay lanes )
  type INTEGER NOT NULL,        -- Note type (normal, hold, etc.)
  duration_ms INTEGER,          -- For hold notes
  FOREIGN KEY (difficulty_id) REFERENCES Difficulty(id)
);

-- Highscores
CREATE TABLE Highscore (
  user_id INTEGER NOT NULL,
  difficulty_id INTEGER NOT NULL,
  score INTEGER NOT NULL,
  max_combo INTEGER NOT NULL,
  accuracy INTEGER NOT NULL,
  date TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES User(id),
  FOREIGN KEY (difficulty_id) REFERENCES Difficulty(id)
);
```

---

## Testing Guidelines

### Test File Locations

| Type | Location | Runner | Command |
|------|----------|--------|---------|
| Frontend | `src/**/*.spec.ts` (excluding tests folder) | Angular CLI | `ng test` |
| Backend | `src/tests/*.spec.ts` | Jest | `npm run test:backend` |

### Test Structure

All tests follow the same pattern (Jasmine/Jest compatible):

```typescript
describe('Component/Service Name', () => {
  let service: Service;

  beforeEach(() => {
    // Setup
  });

  afterEach(() => {
    // Cleanup
  });

  describe('methodName', () => {
    it('should do something specific', () => {
      // Arrange
      const input = { ... };
      
      // Act
      const result = service.method(input);
      
      // Assert
      expect(result).toEqual(expected);
    });

    it('should throw error for invalid input', () => {
      expect(() => service.method(invalid))
        .toThrow('Expected error message');
    });
  });
});
```

### Running Tests

```bash
# Frontend tests (Angular)
npm test
ng test

# Backend tests (Jest)
npm run test:backend

# Backend with coverage
npm run test:backend -- --coverage
```

### Writing Backend Tests

Backend tests use **Jest** with these key features:

1. **Use `new Unit(false)`** for write transactions in tests
2. **Always call `unit.complete(false)` in `afterEach`** to rollback
3. **Use `beforeEach`/`afterEach`** for setup/cleanup
4. **Test both success and error cases**

Example:
```typescript
describe('HTLService', () => {
  let unit: Unit;
  let service: HTLService;

  beforeEach(() => {
    unit = new Unit(false);  // Write mode
    service = new HTLService(unit);
  });

  afterEach(() => {
    unit.complete(false);  // Rollback - clean state
  });

  it('should work', () => {
    // Test here
  });
});
```

---

## Code Conventions

### TypeScript Style

- **Strict mode**: Enabled (`strict: true`)
- **Single quotes**: Use `'` not `"`
- **Print width**: 100 characters (Prettier)
- **Semicolons**: Required
- **Trailing commas**: None

### Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Classes | PascalCase | `HTLService`, `LoginComponent` |
| Interfaces | PascalCase | `UserJSON`, `SongData` |
| Type aliases | PascalCase | `User`, `NoteType` |
| Variables | camelCase | `userId`, `noteCount` |
| Constants | UPPER_SNAKE_CASE | `DB_NAME`, `MAX_LANES` |
| Files | kebab-case | `login.component.ts`, `htl-service.ts` |
| CSS classes | kebab-case | `.login-container`, `.song-card` |

### Import Organization

Group imports in this order:
1. Angular/core imports
2. Third-party imports
3. Application imports (absolute paths)
4. Relative imports

```typescript
// 1. Angular
import { Component, signal } from '@angular/core';
import { FormBuilder } from '@angular/forms';

// 2. Third-party
import { Observable } from 'rxjs';

// 3. Application absolute
import { UserService } from 'src/app/services/user.service';

// 4. Relative
import { LoginComponent } from '../login/login.component';
```

### Component Guidelines

1. **Use standalone components** (preferred over NgModules)
2. **Use signals** for state management (`signal()`, `computed()`)
3. **Prefix selectors** with `app-`
4. **One component per file**
5. **Inline small templates** (optional), external for large ones

### Backend Guidelines

1. **Always use parameterized queries** (never string concatenation)
2. **Use named parameters** (`$paramName` syntax)
3. **Close units properly** with `complete(commit)`
4. **Validate all inputs** before database operations
5. **Return typed results** from HTLService methods

---

## Development Workflow

### Starting Development

```bash
# 1. Install dependencies
npm install

# 2. Start frontend
npm start

# 3. Open browser
http://localhost:4200
```

### Making Changes

1. **Create feature branch** (if using git)
2. **Make changes**
3. **Run tests**:
   ```bash
   npm run test:backend  # Backend tests
   ng test               # Frontend tests
   ```
4. **Type check**:
   ```bash
   cd src/backend
   npx tsc --noEmit
   ```
5. **Test manually** in browser

### Adding New Features

#### Frontend Component

```bash
ng generate component frontend/feature-name
```

Or manually create:
1. `src/frontend/feature/feature.ts`
2. `src/frontend/feature/feature.html`
3. `src/frontend/feature/feature.scss`
4. `src/frontend/feature/feature.spec.ts`

#### Backend API Endpoint

1. Add route in `src/backend/server.ts`
2. Use HTLService for business logic
3. Use Unit for database operations
4. Add tests in `src/tests/`

Example:
```typescript
// server.ts
app.get('/api/users/:id', (req, res) => {
  const unit = new Unit(true);  // Read-only
  try {
    const service = new HTLService(unit);
    const stmt = unit.prepare<User>(
      'SELECT * FROM User WHERE id = $id',
      { id: req.params.id }
    );
    const user = stmt.get();
    if (user) {
      res.json(service.userToJSON(user));
    } else {
      res.status(404).json({ error: 'User not found' });
    }
  } finally {
    unit.complete();
  }
});
```

---

## Common Tasks

### Reset Database

Delete `src/backend/htl.db` and restart server. Tables are auto-created.

### Add New Database Table

Edit `src/backend/unit.ts`, add to `ensureTablesCreated()`:

```typescript
connection.exec(`
  CREATE TABLE IF NOT EXISTS NewTable (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  ) STRICT
`);
```

### Add New Route

1. Add to `src/app/app.routes.ts` (frontend)
2. Add Express route to `src/backend/server.ts` (backend)

### Debug Database Queries

Set `verbose: console.log` in `DB.createDBConnection()` to see all SQL.

---

## Troubleshooting

### Common Issues

#### "Cannot find module"
```bash
npm install
```

#### TypeScript errors
```bash
# Frontend
npx tsc --noEmit

# Backend
cd src/backend
npx tsc --noEmit
```

#### Port already in use
```bash
# Find and kill process on port 4200
# Windows
netstat -ano | findstr :4200
taskkill /PID <PID> /F

# Or use different port
ng serve --port 4201
```

#### SQLite "database is locked"
- Ensure previous Unit instances are closed
- Check for uncommitted transactions
- Restart the server

#### Tests failing with "table already exists"
Tests should use `unit.complete(false)` to rollback. If tables persist, delete `htl.db`.

### Debug Mode

Enable SQL logging in `unit.ts`:
```typescript
const db = new BetterSqlite3(dbFileName, {
  verbose: console.log  // Log all SQL
});
```

---

## TODOs and Future Work

### Critical Missing Features

1. **Authentication System**
   - [ ] JWT token implementation
   - [ ] Password hashing (bcrypt)
   - [ ] Login/logout API endpoints
   - [ ] Auth guards for routes

2. **API Endpoints**
   - [ ] POST /api/auth/login
   - [ ] POST /api/auth/register
   - [ ] GET /api/songs
   - [ ] GET /api/songs/:id/difficulties
   - [ ] POST /api/highscores
   - [ ] GET /api/highscores

3. **Gameplay Component**
   - [ ] Note rendering system
   - [ ] Input handling (keyboard/touch)
   - [ ] Score calculation
   - [ ] Audio synchronization

4. **Security**
   - [ ] Input sanitization
   - [ ] Rate limiting
   - [ ] CORS configuration
   - [ ] Helmet.js

### Nice to Have

- [ ] Song upload functionality
- [ ] Custom note pattern editor
- [ ] Multiplayer mode
- [ ] Leaderboards
- [ ] User profiles

---

## Quick Reference

### Commands

```bash
# Install
npm install

# Dev server
npm start

# Build
ng build

# Tests
npm test              # Frontend
npm run test:backend  # Backend

# Type check
cd src/backend && npx tsc --noEmit
```

### File Templates

**New Component** (`feature.ts`):
```typescript
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-feature',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './feature.html',
  styleUrls: ['./feature.scss']
})
export class FeatureComponent { }
```

**New API Route** (`server.ts`):
```typescript
app.get('/api/route', (req, res) => {
  const unit = new Unit(true);
  try {
    // Logic here
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    unit.complete();
  }
});
```

---

*End of AGENTS.md*
