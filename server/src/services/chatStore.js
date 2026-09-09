import crypto from 'crypto';
import pool from '../config/db.js';
import { jidToPhone, normalizeBrazilPhone, phoneToJid } from './phone.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isSessionToken(value) {
  return UUID_RE.test(String(value || '').trim());
}

export function newSessionToken() {
  return crypto.randomUUID();
}

function parseBotContext(raw) {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function mapConversation(row) {
  if (!row) return null;
  return {
    id: row.id,
    session_token: row.session_token,
    visitor_name: row.visitor_name,
    visitor_phone: row.visitor_phone,
    visitor_jid: row.visitor_jid,
    user_id: row.user_id,
    status: row.status,
    last_message_at: row.last_message_at,
    unread_admin: Number(row.unread_admin || 0),
    bot_paused: Boolean(row.bot_paused),
    bot_stage: row.bot_stage || 'greeting',
    bot_context: parseBotContext(row.bot_context),
    last_message_preview: row.last_message_preview ?? undefined,
    created_date: row.created_date,
    updated_date: row.updated_date,
  };
}

function mapMessage(row) {
  if (!row) return null;
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    direction: row.direction,
    source: row.source,
    body: row.body,
    wa_message_id: row.wa_message_id,
    created_date: row.created_date,
  };
}

export async function getConversationByToken(sessionToken) {
  if (!isSessionToken(sessionToken)) return null;
  const result = await pool.query(
    'SELECT * FROM whatsapp_conversations WHERE session_token = $1 LIMIT 1',
    [sessionToken]
  );
  return mapConversation(result.rows[0]);
}

export async function getConversationById(id) {
  const result = await pool.query(
    'SELECT * FROM whatsapp_conversations WHERE id = $1 LIMIT 1',
    [id]
  );
  return mapConversation(result.rows[0]);
}

export function conversationTag(conversation) {
  return String(conversation?.id || '').replace(/-/g, '').slice(0, 8).toLowerCase();
}

export async function getConversationByTag(tag) {
  const clean = String(tag || '').replace(/[^0-9a-f]/gi, '').toLowerCase().slice(0, 8);
  if (clean.length < 8) return null;
  const result = await pool.query(
    `SELECT * FROM whatsapp_conversations
     WHERE REPLACE(id::text, '-', '') LIKE $1
     LIMIT 1`,
    [`${clean}%`]
  );
  return mapConversation(result.rows[0]);
}

export async function getLatestOpenConversation({ siteOnly = false } = {}) {
  const result = await pool.query(
    `SELECT * FROM whatsapp_conversations
     WHERE status = 'open'
       AND ($1::boolean = false OR visitor_jid IS NULL)
     ORDER BY last_message_at DESC NULLS LAST, created_date DESC
     LIMIT 1`,
    [Boolean(siteOnly)]
  );
  return mapConversation(result.rows[0]);
}

export async function getConversationByJid(jid) {
  if (!jid) return null;
  const phone = jidToPhone(jid);
  const result = await pool.query(
    `SELECT * FROM whatsapp_conversations
     WHERE visitor_jid = $1
        OR ($2::text IS NOT NULL AND visitor_phone = $2)
     ORDER BY last_message_at DESC NULLS LAST, created_date DESC
     LIMIT 1`,
    [jid, phone]
  );
  return mapConversation(result.rows[0]);
}

export async function createConversation({
  sessionToken,
  visitorName,
  visitorPhone,
  visitorJid,
  userId,
} = {}) {
  const token = isSessionToken(sessionToken) ? sessionToken : newSessionToken();
  const phone = normalizeBrazilPhone(visitorPhone);
  const jid = visitorJid || phoneToJid(phone);
  const result = await pool.query(
    `INSERT INTO whatsapp_conversations
       (session_token, visitor_name, visitor_phone, visitor_jid, user_id, status)
     VALUES ($1, $2, $3, $4, $5, 'open')
     RETURNING *`,
    [
      token,
      visitorName ? String(visitorName).trim().slice(0, 255) : null,
      phone,
      jid,
      userId || null,
    ]
  );
  return mapConversation(result.rows[0]);
}

export async function findOrCreateByToken(sessionToken, extras = {}) {
  const existing = await getConversationByToken(sessionToken);
  if (existing) return existing;
  return createConversation({ sessionToken, ...extras });
}

export async function listConversations({ status, limit = 80 } = {}) {
  const params = [];
  let where = '';
  if (status === 'open' || status === 'closed') {
    params.push(status);
    where = `WHERE c.status = $${params.length}`;
  }
  params.push(Math.min(Math.max(Number(limit) || 80, 1), 200));
  const result = await pool.query(
    `SELECT c.*,
            (
              SELECT LEFT(m.body, 140)
              FROM whatsapp_messages m
              WHERE m.conversation_id = c.id
              ORDER BY m.created_date DESC
              LIMIT 1
            ) AS last_message_preview
     FROM whatsapp_conversations c
     ${where}
     ORDER BY c.last_message_at DESC NULLS LAST, c.created_date DESC
     LIMIT $${params.length}`,
    params
  );
  return result.rows.map(mapConversation);
}

export async function listMessages(conversationId, { limit = 200 } = {}) {
  const result = await pool.query(
    `SELECT * FROM whatsapp_messages
     WHERE conversation_id = $1
     ORDER BY created_date ASC
     LIMIT $2`,
    [conversationId, Math.min(Math.max(Number(limit) || 200, 1), 500)]
  );
  return result.rows.map(mapMessage);
}

export async function addMessage({
  conversationId,
  direction,
  source,
  body,
  waMessageId = null,
  incrementUnread = false,
}) {
  const text = String(body || '').trim().slice(0, 4000);
  if (!text) return null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let inserted;
    try {
      const result = await client.query(
        `INSERT INTO whatsapp_messages
           (conversation_id, direction, source, body, wa_message_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [conversationId, direction, source, text, waMessageId || null]
      );
      inserted = result.rows[0];
    } catch (err) {
      if (err?.code === '23505' && waMessageId) {
        await client.query('ROLLBACK');
        const existing = await pool.query(
          'SELECT * FROM whatsapp_messages WHERE wa_message_id = $1 LIMIT 1',
          [waMessageId]
        );
        return mapMessage(existing.rows[0]);
      }
      throw err;
    }

    await client.query(
      `UPDATE whatsapp_conversations
       SET last_message_at = NOW(),
           updated_date = NOW(),
           status = 'open',
           unread_admin = CASE WHEN $2 THEN unread_admin + 1 ELSE unread_admin END
       WHERE id = $1`,
      [conversationId, Boolean(incrementUnread)]
    );
    await client.query('COMMIT');
    return mapMessage(inserted);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function setMessageWaId(messageId, waMessageId) {
  if (!messageId || !waMessageId) return;
  await pool.query(
    'UPDATE whatsapp_messages SET wa_message_id = $2 WHERE id = $1 AND wa_message_id IS NULL',
    [messageId, waMessageId]
  );
}

export async function hasWaMessage(waMessageId) {
  if (!waMessageId) return false;
  const result = await pool.query(
    'SELECT id FROM whatsapp_messages WHERE wa_message_id = $1 LIMIT 1',
    [waMessageId]
  );
  return result.rows.length > 0;
}

export async function markAdminRead(conversationId) {
  await pool.query(
    `UPDATE whatsapp_conversations
     SET unread_admin = 0, updated_date = NOW()
     WHERE id = $1`,
    [conversationId]
  );
}

export async function setConversationStatus(conversationId, status) {
  const next = status === 'closed' ? 'closed' : 'open';
  const result = await pool.query(
    `UPDATE whatsapp_conversations
     SET status = $2, updated_date = NOW()
     WHERE id = $1
     RETURNING *`,
    [conversationId, next]
  );
  return mapConversation(result.rows[0]);
}

export async function attachVisitorProfile(conversation, {
  visitorName,
  visitorPhone,
  userId,
} = {}) {
  const name = visitorName != null
    ? String(visitorName).trim().slice(0, 255) || null
    : conversation.visitor_name;
  const phone = visitorPhone != null
    ? normalizeBrazilPhone(visitorPhone)
    : conversation.visitor_phone;
  const jid = phoneToJid(phone) || conversation.visitor_jid;
  const nextUserId = userId || conversation.user_id;

  if (jid) {
    const existing = await getConversationByJid(jid);
    if (existing && existing.id !== conversation.id) {
      await pool.query(
        'UPDATE whatsapp_messages SET conversation_id = $1 WHERE conversation_id = $2',
        [existing.id, conversation.id]
      );
      const merged = await pool.query(
        `UPDATE whatsapp_conversations
         SET session_token = $1,
             visitor_name = COALESCE($2, visitor_name),
             visitor_phone = COALESCE($3, visitor_phone),
             visitor_jid = COALESCE($4, visitor_jid),
             user_id = COALESCE($5, user_id),
             status = 'open',
             unread_admin = unread_admin + $6,
             updated_date = NOW()
         WHERE id = $7
         RETURNING *`,
        [
          conversation.session_token,
          name,
          phone,
          jid,
          nextUserId,
          conversation.unread_admin || 0,
          existing.id,
        ]
      );
      await pool.query('DELETE FROM whatsapp_conversations WHERE id = $1', [conversation.id]);
      return mapConversation(merged.rows[0]);
    }
  }

  const result = await pool.query(
    `UPDATE whatsapp_conversations
     SET visitor_name = COALESCE($2, visitor_name),
         visitor_phone = $3,
         visitor_jid = $4,
         user_id = COALESCE($5, user_id),
         updated_date = NOW()
     WHERE id = $1
     RETURNING *`,
    [conversation.id, name, phone, jid, nextUserId]
  );
  return mapConversation(result.rows[0]);
}

export async function updateBotState(conversationId, { stage, context, paused } = {}) {
  const result = await pool.query(
    `UPDATE whatsapp_conversations
     SET bot_stage = COALESCE($2, bot_stage),
         bot_context = COALESCE($3::jsonb, bot_context),
         bot_paused = COALESCE($4, bot_paused),
         updated_date = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      conversationId,
      stage || null,
      context ? JSON.stringify(context) : null,
      typeof paused === 'boolean' ? paused : null,
    ]
  );
  return mapConversation(result.rows[0]);
}

export async function publicConversation(conversation) {
  if (!conversation) return null;
  return {
    id: conversation.id,
    session_token: conversation.session_token,
    visitor_name: conversation.visitor_name,
    visitor_phone: conversation.visitor_phone,
    status: conversation.status,
    bot_stage: conversation.bot_stage || 'discover',
    bot_paused: Boolean(conversation.bot_paused),
    channel: conversation.bot_context?.channel || null,
  };
}
