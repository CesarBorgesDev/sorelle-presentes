import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { isAllowedOrigin } from '../config/cors.js';
import { getConversationByToken, isSessionToken } from './chatStore.js';

let io = null;

function verifyAdminToken(token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    if (payload?.role !== 'admin') return null;
    return payload;
  } catch {
    return null;
  }
}

export function initRealtime(httpServer) {
  io = new Server(httpServer, {
    path: '/api/socket.io',
    cors: {
      origin(origin, callback) {
        if (isAllowedOrigin(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error('Origem não permitida'));
      },
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    const auth = socket.handshake.auth || {};
    const admin = verifyAdminToken(auth.token);
    if (admin) {
      socket.data.admin = admin;
      socket.join('admin:inbox');
    }

    socket.on('chat:join', async (payload = {}) => {
      const sessionToken = String(payload.sessionToken || auth.sessionToken || '').trim();
      if (!isSessionToken(sessionToken)) return;
      const conversation = await getConversationByToken(sessionToken);
      if (!conversation) return;
      socket.data.sessionToken = conversation.session_token;
      socket.join(`chat:${conversation.session_token}`);
    });

    socket.on('admin:join', () => {
      if (socket.data.admin) socket.join('admin:inbox');
    });
  });

  return io;
}

export function getIo() {
  return io;
}

export function emitToConversation(sessionToken, event, payload) {
  if (!io || !sessionToken) return;
  io.to(`chat:${sessionToken}`).emit(event, payload);
}

export function emitToAdmin(event, payload) {
  io?.to('admin:inbox').emit(event, payload);
}

export function emitChatMessage(conversation, message) {
  if (!conversation) return;
  const payload = { conversation, message };
  emitToConversation(conversation.session_token, 'chat:message', payload);
  emitToAdmin('chat:message', payload);
}

export function emitConversationUpdate(conversation) {
  if (!conversation) return;
  emitToAdmin('chat:conversation', { conversation });
}

export function emitWhatsAppStatus(payload) {
  emitToAdmin('whatsapp:status', payload);
}

export function emitWhatsAppQr(qrDataUrl) {
  emitToAdmin('whatsapp:qr', { qr: qrDataUrl });
}

export async function closeRealtime() {
  if (!io) return;
  await new Promise((resolve) => io.close(resolve));
  io = null;
}
