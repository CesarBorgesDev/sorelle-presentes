import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { getSetting, setSetting } from '../services/settings.js';
import {
  addMessage,
  getConversationById,
  listConversations,
  listMessages,
  markAdminRead,
  setConversationStatus,
  setMessageWaId,
  updateBotState,
} from '../services/chatStore.js';
import {
  getWhatsAppStatus,
  isWhatsAppConnected,
  logoutWhatsApp,
  forwardSiteMessageToWhatsApp,
  sendWhatsApp,
  startWhatsApp,
} from '../services/baileys.js';
import { emitChatMessage, emitConversationUpdate } from '../services/realtime.js';
import { normalizeBrazilPhone, formatPhoneDisplay } from '../services/phone.js';

const router = Router();

router.use(requireAuth, requireAdmin);

router.get('/status', (_req, res) => {
  res.json(getWhatsAppStatus());
});

router.get('/qr', async (_req, res) => {
  try {
    const status = await startWhatsApp();
    res.json(status);
  } catch (err) {
    console.error('[whatsapp] qr:', err);
    res.status(500).json({ message: 'Não foi possível gerar o QR Code' });
  }
});

router.post('/connect', async (_req, res) => {
  try {
    const status = await startWhatsApp();
    res.json(status);
  } catch (err) {
    console.error('[whatsapp] connect:', err);
    res.status(500).json({ message: 'Não foi possível conectar o WhatsApp' });
  }
});

router.post('/logout', async (_req, res) => {
  try {
    const status = await logoutWhatsApp();
    res.json(status);
  } catch (err) {
    console.error('[whatsapp] logout:', err);
    res.status(500).json({ message: 'Não foi possível desconectar o WhatsApp' });
  }
});

router.get('/notify-phone', async (_req, res) => {
  const phone = (await getSetting('whatsapp_notify_phone')) || '';
  res.json({
    phone,
    display: formatPhoneDisplay(phone),
    connected: isWhatsAppConnected(),
  });
});

router.get('/bot', async (_req, res) => {
  const enabled = (await getSetting('whatsapp_bot_enabled')) !== 'false';
  res.json({ enabled });
});

router.put('/bot', async (req, res) => {
  const enabled = req.body?.enabled !== false && req.body?.enabled !== 'false';
  await setSetting('whatsapp_bot_enabled', enabled ? 'true' : 'false');
  res.json({ enabled });
});

router.put('/notify-phone', async (req, res) => {
  try {
    const raw = String(req.body?.phone || '').trim();
    if (!raw) {
      await setSetting('whatsapp_notify_phone', '');
      return res.json({ phone: '', display: '' });
    }
    const phone = normalizeBrazilPhone(raw);
    if (!phone) {
      return res.status(400).json({ message: 'Informe um WhatsApp válido com DDD' });
    }
    await setSetting('whatsapp_notify_phone', phone);
    res.json({ phone, display: formatPhoneDisplay(phone) });
  } catch (err) {
    console.error('[whatsapp] notify-phone:', err);
    res.status(500).json({ message: 'Não foi possível salvar o número' });
  }
});

router.get('/conversations', async (req, res) => {
  try {
    const status = req.query.status === 'closed' ? 'closed' : req.query.status === 'all' ? undefined : 'open';
    const conversations = await listConversations({
      status,
      limit: req.query.limit,
    });
    res.json(conversations);
  } catch (err) {
    console.error('[whatsapp] conversations:', err);
    res.status(500).json({ message: 'Não foi possível listar as conversas' });
  }
});

router.get('/conversations/:id/messages', async (req, res) => {
  try {
    const conversation = await getConversationById(req.params.id);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversa não encontrada' });
    }
    await markAdminRead(conversation.id);
    const messages = await listMessages(conversation.id);
    const fresh = await getConversationById(conversation.id);
    res.json({ conversation: fresh, messages });
  } catch (err) {
    console.error('[whatsapp] conversation messages:', err);
    res.status(500).json({ message: 'Não foi possível carregar a conversa' });
  }
});

router.post('/conversations/:id/messages', async (req, res) => {
  try {
    const conversation = await getConversationById(req.params.id);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversa não encontrada' });
    }
    const body = String(req.body?.body || '').trim();
    if (!body) {
      return res.status(400).json({ message: 'Digite uma mensagem' });
    }

    await updateBotState(conversation.id, { paused: true, stage: 'human' });

    const message = await addMessage({
      conversationId: conversation.id,
      direction: 'outbound',
      source: 'admin',
      body,
      incrementUnread: false,
    });

    const fresh = await getConversationById(conversation.id);
    emitChatMessage(fresh, message);
    emitConversationUpdate(fresh);

    try {
      const sent = fresh?.visitor_jid
        ? await sendWhatsApp(fresh.visitor_jid, body)
        : await forwardSiteMessageToWhatsApp(fresh, body, { fromAdmin: true });
      const waId = sent?.key?.id;
      if (waId) await setMessageWaId(message.id, waId);
    } catch (err) {
      console.error('[whatsapp] Falha ao responder no WhatsApp:', err.message);
    }

    res.status(201).json({ conversation: fresh, message });
  } catch (err) {
    console.error('[whatsapp] reply:', err);
    res.status(500).json({ message: 'Não foi possível enviar a resposta' });
  }
});

router.patch('/conversations/:id', async (req, res) => {
  try {
    const conversation = await getConversationById(req.params.id);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversa não encontrada' });
    }
    let updated = conversation;
    if (req.body?.status) {
      updated = await setConversationStatus(conversation.id, req.body.status);
    }
    if (typeof req.body?.bot_paused === 'boolean') {
      updated = await updateBotState(conversation.id, {
        paused: req.body.bot_paused,
        stage: req.body.bot_paused ? 'human' : 'discover',
      });
    }
    emitConversationUpdate(updated);
    res.json(updated);
  } catch (err) {
    console.error('[whatsapp] patch conversation:', err);
    res.status(500).json({ message: 'Não foi possível atualizar a conversa' });
  }
});

export default router;
