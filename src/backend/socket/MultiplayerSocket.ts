import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { JWTService } from '../utils/JWTService';
import { MultiplayerService, PlayerMatchStats } from '../services/MultiplayerService';
import { Unit } from '../database/unit';

interface AuthenticatedSocket extends Socket {
  userId?: number;
  username?: string;
}

interface RoomState {
  roomId: string;
  challengerId: number;
  inviteeId: number;
  sockets: Map<number, AuthenticatedSocket>;
  ready: Set<number>;
  finished: Set<number>;
  disconnectTimers: Map<number, NodeJS.Timeout>;
  active: boolean;
}

const rooms = new Map<string, RoomState>();
const userSocketMap = new Map<number, AuthenticatedSocket>();

function getOpponentId(room: RoomState, userId: number): number {
  return room.challengerId === userId ? room.inviteeId : room.challengerId;
}

async function finalizeRoom(roomId: string): Promise<void> {
  const room = rooms.get(roomId);
  if (!room || room.active === false) return;
  room.active = false;

  const unit = new Unit(false);
  try {
    const multiplayerService = new MultiplayerService(unit);
    const { winnerId, results } = await multiplayerService.calculateAndStoreWinner(roomId);
    await unit.complete(true);

    for (const socket of room.sockets.values()) {
      socket.emit('match:result', { winnerId, results });
    }
  } catch (err: any) {
    await unit.complete(false);
    console.error('Failed to finalize room:', err);
    for (const socket of room.sockets.values()) {
      socket.emit('room:error', { message: 'Failed to finalize match' });
    }
  }
  rooms.delete(roomId);
}

export function initMultiplayerSocket(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: (origin, callback) => callback(null, true),
      credentials: true
    }
  });

  io.use((socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token || typeof token !== 'string') {
        return next(new Error('Authentication required'));
      }
      const payload = JWTService.verify(token);
      if (!payload) {
        return next(new Error('Invalid or expired token'));
      }
      socket.userId = payload.userId;
      socket.username = payload.username;
      next();
    } catch (err: any) {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    const userId = socket.userId!;
    userSocketMap.set(userId, socket);

    socket.on('room:join', async ({ roomId }: { roomId: string }) => {
      const unit = new Unit(true);
      const multiplayerService = new MultiplayerService(unit);
      const roomRow = await multiplayerService.getRoom(roomId);
      await unit.complete();

      if (!roomRow) {
        socket.emit('room:error', { message: 'Room not found' });
        return;
      }
      if (roomRow.challengerId !== userId && roomRow.inviteeId !== userId) {
        socket.emit('room:error', { message: 'Not a participant' });
        return;
      }
      if (roomRow.status === 'finished' || roomRow.status === 'cancelled') {
        socket.emit('room:error', { message: 'Room already closed' });
        return;
      }

      socket.join(roomId);

      let room = rooms.get(roomId);
      if (!room) {
        room = {
          roomId,
          challengerId: roomRow.challengerId,
          inviteeId: roomRow.inviteeId,
          sockets: new Map(),
          ready: new Set(),
          finished: new Set(),
          disconnectTimers: new Map(),
          active: true
        };
        rooms.set(roomId, room);
      }

      const existingTimer = room.disconnectTimers.get(userId);
      if (existingTimer) clearTimeout(existingTimer);
      room.disconnectTimers.delete(userId);
      room.sockets.set(userId, socket);

      const role = room.challengerId === userId ? 'challenger' : 'invitee';
      socket.emit('room:joined', { roomId, opponentId: getOpponentId(room, userId), role });

      const opponentSocket = room.sockets.get(getOpponentId(room, userId));
      if (opponentSocket) {
        opponentSocket.emit('room:opponent-joined', {});
      }
    });

    socket.on('room:ready', async ({ roomId }: { roomId: string }) => {
      const room = rooms.get(roomId);
      if (!room || !room.active) return;
      room.ready.add(userId);

      if (room.ready.size === 2) {
        const unit = new Unit(false);
        const multiplayerService = new MultiplayerService(unit);
        await multiplayerService.setStatus(roomId, 'active');
        await unit.complete(true);

        const serverTimeMs = Date.now() + 3500;
        io.to(roomId).emit('match:countdown', { value: 3 });
        setTimeout(() => io.to(roomId).emit('match:countdown', { value: 2 }), 1000);
        setTimeout(() => io.to(roomId).emit('match:countdown', { value: 1 }), 2000);
        setTimeout(() => io.to(roomId).emit('match:start', { serverTimeMs }), 3000);
      }
    });

    socket.on('match:state', ({ roomId, state }: { roomId: string; state: any }) => {
      const room = rooms.get(roomId);
      if (!room || !room.active) return;
      const opponentId = getOpponentId(room, userId);
      const opponentSocket = room.sockets.get(opponentId);
      if (opponentSocket) {
        opponentSocket.emit('match:opponent-state', state);
      }
    });

    socket.on('match:finished', async ({ roomId, stats }: { roomId: string; stats: PlayerMatchStats }) => {
      const room = rooms.get(roomId);
      if (!room || !room.active) return;
      room.finished.add(userId);

      const unit = new Unit(false);
      const multiplayerService = new MultiplayerService(unit);
      await multiplayerService.submitResult({ roomId, userId, stats });
      await unit.complete(true);

      if (room.finished.size === 2) {
        await finalizeRoom(roomId);
      }
    });

    socket.on('disconnect', () => {
      userSocketMap.delete(userId);
      for (const room of rooms.values()) {
        if (room.sockets.get(userId) === socket) {
          const timer = setTimeout(async () => {
            if (!room.active) return;
            room.active = false;
            const unit = new Unit(false);
            try {
              const multiplayerService = new MultiplayerService(unit);
              await multiplayerService.setStatus(room.roomId, 'cancelled');
              await unit.complete(true);
            } catch (err) {
              await unit.complete(false);
            }
            const opponentId = getOpponentId(room, userId);
            const opponentSocket = room.sockets.get(opponentId);
            if (opponentSocket) {
              opponentSocket.emit('room:error', { message: 'Opponent disconnected' });
            }
            rooms.delete(room.roomId);
          }, 30000);
          room.disconnectTimers.set(userId, timer);
        }
      }
    });
  });

  return io;
}
