import { Router } from 'express';
import pool from '../config/db.js';
import { optionalAuth } from '../middleware/auth.js';
import {
  addMessage,
  attachVisitorProfile,
  findOrCreateByToken,
  getConversationByToken,
  isSessionToken,
  listMessages,
  newSessionToken,
  publicConversation,
  setMessageWaId,
} from '../services/chatStore.js';
import { forwardSiteMessageToWhatsApp } from '../services/baileys.js';
import { emitChatMessage, emitConversationUpdate } from '../services/realtime.js';
import { applyChannelChoice, maybeRunSalesBot } from '../services/salesBot.js';

const router = Router();

function sessionFromRequest(req) {
  return String(req.headers['x-chat-session'] || req.body?.session_token || '').trim();
}

async function loadUserProfile(userId) {
  if (!userId) return { name: null, phone: null };
  const result = await pool.query(
    'SELECT full_name, phone FROM users WHERE id = $1 LIMIT 1',
    [userId]
  );
  const row = result.rows[0];
  return {
    name: row?.full_name || null,
    phone: row?.phone || null,
  };
}

async function requireConversation(req, res) {
  const token = sessionFromRequest(req);
  if (!isSessionToken(token)) {
    res.status(401).json({ message: 'Sessão de chat inválida' });
    return null;
  }
  const conversation = await getConversationByToken(token);
  if (!conversation) {
    res.status(401).json({ message: 'Sessão de chat não encontrada' });
    return null;
  }
  return conversation;
}

router.post('/session', optionalAuth, async (req, res) => {
  try {
    const token = sessionFromRequest(req) || newSessionToken();
    const profile = await loadUserProfile(req.user?.id);
    const visitorName = String(req.body?.visitor_name || profile.name || '').trim();
    const visitorPhone = req.body?.visitor_phone || profile.phone || null;
    let conversation = await findOrCreateByToken(token, {
      visitorName,
      visitorPhone,
      userId: req.user?.id || null,
    });

    if (visitorName || visitorPhone || req.user?.id) {
      conversation = await attachVisitorProfile(conversation, {
        visitorName: visitorName || undefined,
        visitorPhone: visitorPhone || undefined,
        userId: req.user?.id || null,
      });
    }

    res.json(await publicConversation(conversation));
  } catch (err) {
    console.error('[chat] session:', err);
    res.status(500).json({ message: 'Não foi possível iniciar o chat' });
  }
});

router.patch('/session', optionalAuth, async (req, res) => {
  try {
    const conversation = await requireConversation(req, res);
    if (!conversation) return;

    const visitorName = req.body?.visitor_name != null
      ? String(req.body.visitor_name).trim()
      : undefined;
    const visitorPhone = req.body?.visitor_phone != null
      ? String(req.body.visitor_phone)
      : undefined;

    const updated = await attachVisitorProfile(conversation, {
      visitorName,
      visitorPhone,
      userId: req.user?.id || null,
    });
    res.json(await publicConversation(updated));
  } catch (err) {
    console.error('[chat] patch session:', err);
    res.status(500).json({ message: 'Não foi possível atualizar o chat' });
  }
});

router.post('/channel', async (req, res) => {
  try {
    const conversation = await requireConversation(req, res);
    if (!conversation) return;
    const raw = String(req.body?.channel || '').trim().toLowerCase();
    const channel = raw === 'human' || raw === 'humano' ? 'human' : '';
    if (!channel) {
      return res.status(400).json({ message: 'Informe o atendimento humano' });
    }
    await applyChannelChoice(conversation, channel);
    const fresh = await getConversationByToken(conversation.session_token);
    const messages = await listMessages(fresh.id);
    res.json({ conversation: await publicConversation(fresh), messages });
  } catch (err) {
    console.error('[chat] channel:', err);
    res.status(500).json({ message: 'Não foi possível escolher o atendimento' });
  }
});

router.get('/messages', async (req, res) => {
  try {
    const conversation = await requireConversation(req, res);
    if (!conversation) return;
    const messages = await listMessages(conversation.id);
    res.json({ conversation: await publicConversation(conversation), messages });
  } catch (err) {
    console.error('[chat] list messages:', err);
    res.status(500).json({ message: 'Não foi possível carregar as mensagens' });
  }
});

router.post('/messages', async (req, res) => {
  try {
    const conversation = await requireConversation(req, res);
    if (!conversation) return;

    const body = String(req.body?.body || '').trim();
    if (!body) {
      return res.status(400).json({ message: 'Digite uma mensagem' });
    }

    const message = await addMessage({
      conversationId: conversation.id,
      direction: 'inbound',
      source: 'site',
      body,
      incrementUnread: true,
    });

    const fresh = await getConversationByToken(conversation.session_token);
    emitChatMessage(fresh, message);
    emitConversationUpdate(fresh);

    try {
      const sent = await forwardSiteMessageToWhatsApp(fresh, body);
      const waId = sent?.key?.id;
      if (waId) await setMessageWaId(message.id, waId);
    } catch (err) {
      console.error('[chat] Falha ao enviar no WhatsApp:', err.message);
    }

    res.status(201).json({ conversation: await publicConversation(fresh), message });
    maybeRunSalesBot({ conversation: fresh, inboundText: body }).catch((err) => {
      console.error('[bot] chat:', err.message);
    });
  } catch (err) {
    console.error('[chat] send message:', err);
    res.status(500).json({ message: 'Não foi possível enviar a mensagem' });
  }
});

export default router;
