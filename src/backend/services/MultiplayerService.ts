import { Unit } from '../database/unit';

export type GameRoomStatus = 'pending' | 'active' | 'finished' | 'cancelled';

export interface CreateRoomRequest {
  difficultyId: number;
  challengerId: number;
  inviteeId: number;
}

export interface CreateRoomResult {
  success: boolean;
  roomId?: string;
  error?: string;
}

export interface RoomResult {
  id: string;
  difficultyId: number;
  challengerId: number;
  inviteeId: number;
  status: GameRoomStatus;
  winnerId: number | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface PlayerMatchStats {
  score: number;
  maxCombo: number;
  accuracy: number;
  radiant: number;
  shinning: number;
  glimmer: number;
  shattered: number;
}

export interface MatchPlayerResult {
  userId: number;
  username: string;
  profilePictureUrl: string | null;
  score: number;
  maxCombo: number;
  accuracy: number;
  radiant: number;
  shinning: number;
  glimmer: number;
  shattered: number;
  finalPlacement: number | null;
}

export interface MatchResult {
  winnerId: number | null;
  results: MatchPlayerResult[];
}

export interface SubmitResultRequest {
  roomId: string;
  userId: number;
  stats: PlayerMatchStats;
}

export class MultiplayerService {
  constructor(private unit: Unit) {}

  async createRoom(request: CreateRoomRequest): Promise<CreateRoomResult> {
    if (request.challengerId === request.inviteeId) {
      return { success: false, error: 'Cannot challenge yourself' };
    }
    if (!request.difficultyId || !request.challengerId || !request.inviteeId) {
      return { success: false, error: 'difficultyId, challengerId, and inviteeId are required' };
    }

    const difficultyCheck = this.unit.prepare<{ id: number }, { difficultyId: number }>(
      'SELECT id FROM Difficulty WHERE id = $difficultyId',
      { difficultyId: request.difficultyId }
    );
    if (!(await difficultyCheck.get())) {
      return { success: false, error: 'Difficulty not found' };
    }

    const insert = this.unit.prepare<
      { id: string },
      { difficultyId: number; challengerId: number; inviteeId: number }
    >(
      `INSERT INTO GameRoom (difficulty_id, challenger_id, invitee_id, status)
       VALUES ($difficultyId, $challengerId, $inviteeId, 'pending')
       RETURNING id`,
      { difficultyId: request.difficultyId, challengerId: request.challengerId, inviteeId: request.inviteeId }
    );
    const row = await insert.get();
    if (!row) {
      return { success: false, error: 'Failed to create room' };
    }
    return { success: true, roomId: row.id };
  }

  async getRoom(roomId: string): Promise<RoomResult | null> {
    const stmt = this.unit.prepare<
      {
        id: string;
        difficulty_id: number;
        challenger_id: number;
        invitee_id: number;
        status: GameRoomStatus;
        winner_id: number | null;
        created_at: string;
        started_at: string | null;
        finished_at: string | null;
      },
      { roomId: string }
    >(
      `SELECT id, difficulty_id, challenger_id, invitee_id, status, winner_id, created_at, started_at, finished_at
       FROM GameRoom WHERE id = $roomId`,
      { roomId }
    );
    const row = await stmt.get();
    if (!row) return null;
    return {
      id: row.id,
      difficultyId: row.difficulty_id,
      challengerId: row.challenger_id,
      inviteeId: row.invitee_id,
      status: row.status,
      winnerId: row.winner_id,
      createdAt: row.created_at,
      startedAt: row.started_at,
      finishedAt: row.finished_at
    };
  }

  async acceptInvite(roomId: string, userId: number): Promise<{ success: boolean; error?: string }> {
    const room = await this.getRoom(roomId);
    if (!room) return { success: false, error: 'Room not found' };
    if (room.inviteeId !== userId) return { success: false, error: 'Only the invitee can accept' };
    if (room.status !== 'pending') return { success: false, error: 'Room is no longer pending' };

    const createdAt = new Date(room.createdAt).getTime();
    if (Date.now() - createdAt > 5 * 60 * 1000) {
      await this.setStatus(roomId, 'cancelled');
      return { success: false, error: 'Invite expired' };
    }

    return { success: true };
  }

  async setStatus(roomId: string, status: GameRoomStatus): Promise<void> {
    if (status === 'active') {
      await this.unit.unsafe(
        `UPDATE GameRoom SET status = $1, started_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [status, roomId]
      );
    } else if (status === 'finished' || status === 'cancelled') {
      await this.unit.unsafe(
        `UPDATE GameRoom SET status = $1, finished_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [status, roomId]
      );
    } else {
      await this.unit.unsafe(
        `UPDATE GameRoom SET status = $1 WHERE id = $2`,
        [status, roomId]
      );
    }
  }

  async submitResult(request: SubmitResultRequest): Promise<{ success: boolean; error?: string }> {
    const room = await this.getRoom(request.roomId);
    if (!room) return { success: false, error: 'Room not found' };
    if (room.status !== 'active' && room.status !== 'finished') {
      return { success: false, error: 'Room is not active' };
    }
    if (request.userId !== room.challengerId && request.userId !== room.inviteeId) {
      return { success: false, error: 'Not a room participant' };
    }

    const insert = this.unit.prepare<
      { id: number },
      {
        roomId: string;
        userId: number;
        score: number;
        maxCombo: number;
        accuracy: number;
        radiant: number;
        shinning: number;
        glimmer: number;
        shattered: number;
      }
    >(
      `INSERT INTO GameRoomResult
       (room_id, user_id, score, max_combo, accuracy, radiant, shinning, glimmer, shattered)
       VALUES ($roomId, $userId, $score, $maxCombo, $accuracy, $radiant, $shinning, $glimmer, $shattered)
       RETURNING id`,
      {
        roomId: request.roomId,
        userId: request.userId,
        score: request.stats.score,
        maxCombo: request.stats.maxCombo,
        accuracy: request.stats.accuracy,
        radiant: request.stats.radiant,
        shinning: request.stats.shinning,
        glimmer: request.stats.glimmer,
        shattered: request.stats.shattered
      }
    );
    const row = await insert.get();
    if (!row) return { success: false, error: 'Failed to submit result' };
    return { success: true };
  }

  async calculateAndStoreWinner(roomId: string): Promise<MatchResult> {
    const resultsStmt = this.unit.prepare<
      {
        userId: number;
        username: string;
        profilePictureUrl: string | null;
        score: number;
        maxCombo: number;
        accuracy: number;
        radiant: number;
        shinning: number;
        glimmer: number;
        shattered: number;
        finalPlacement: number | null;
      },
      { roomId: string }
    >(
      `SELECT
        grr.user_id AS userId,
        u.username,
        u.profilePictureUrl AS profilePictureUrl,
        grr.score,
        grr.max_combo AS maxCombo,
        grr.accuracy,
        grr.radiant,
        grr.shinning,
        grr.glimmer,
        grr.shattered,
        grr.final_placement AS finalPlacement
       FROM GameRoomResult grr
       JOIN "User" u ON u.id = grr.user_id
       WHERE grr.room_id = $roomId`,
      { roomId }
    );
    const rows = await resultsStmt.all();
    if (rows.length === 0) {
      await this.setStatus(roomId, 'finished');
      return { winnerId: null, results: [] };
    }

    const ranked = [...rows].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;
      return b.maxCombo - a.maxCombo;
    });

    const winnerId = ranked[0].score === ranked[1]?.score &&
                     ranked[0].accuracy === ranked[1]?.accuracy &&
                     ranked[0].maxCombo === ranked[1]?.maxCombo
                     ? null
                     : ranked[0].userId;

    for (let i = 0; i < ranked.length; i++) {
      await this.unit.unsafe(
        `UPDATE GameRoomResult SET final_placement = $1 WHERE room_id = $2 AND user_id = $3`,
        [i + 1, roomId, ranked[i].userId]
      );
    }

    await this.unit.unsafe(
      `UPDATE GameRoom SET winner_id = $1, status = 'finished', finished_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [winnerId, roomId]
    );

    return { winnerId, results: ranked };
  }
}
