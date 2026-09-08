import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import { getSetting } from './settings.js';
import {
  addMessage,
  conversationTag,
  createConversation,
  getConversationByJid,
  getConversationByTag,
  getLatestOpenConversation,
  hasWaMessage,
  updateBotState,
} from './chatStore.js';
import {
  emitChatMessage,
  emitConversationUpdate,
  emitWhatsAppQr,
  emitWhatsAppStatus,
} from './realtime.js';
import { isIgnoredJid, isSameJid, jidToPhone, phoneToJid } from './phone.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const AUTH_DIR = path.join(__dirname, '../../data/baileys-auth');

const logger = pino({ level: 'silent' });

let sock = null;
let saveCreds = null;
let starting = false;
let reconnectTimer = null;
let reconnectAttempt = 0;
let lastQr = null;
let connectionStatus = 'disconnected';
let connectedPhone = null;
let shouldReconnect = true;
const recentSentIds = new Set();
const SITE_FORWARD_RE = /^💬/;

function rememberSentId(id) {
  if (!id) return;
  recentSentIds.add(id);
  setTimeout(() => recentSentIds.delete(id), 60_000);
}

function broadcastStatus() {
  emitWhatsAppStatus(getWhatsAppStatus());
}

export function getWhatsAppStatus() {
  return {
    status: connectionStatus,
    connected: connectionStatus === 'connected' && Boolean(sock),
    phone: connectedPhone,
    qr: connectionStatus === 'qr' ? lastQr : null,
  };
}

export function isWhatsAppConnected() {
  return connectionStatus === 'connected' && Boolean(sock);
}

async function ensureAuthDir() {
  await fs.mkdir(AUTH_DIR, { recursive: true });
}

async function hasSavedCreds() {
  try {
    await fs.access(path.join(AUTH_DIR, 'creds.json'));
    return true;
  } catch {
    return false;
  }
}

async function clearAuthDir() {
  await fs.rm(AUTH_DIR, { recursive: true, force: true });
  await ensureAuthDir();
}

function setStatus(status, phone = connectedPhone) {
  connectionStatus = status;
  if (phone !== undefined) connectedPhone = phone;
  if (status !== 'qr') lastQr = null;
  broadcastStatus();
}

function extractWaText(message) {
  if (!message) return '';
  const inner = message.ephemeralMessage?.message
    || message.viewOnceMessage?.message
    || message.viewOnceMessageV2?.message
    || message.viewOnceMessageV2Extension?.message
    || message.documentWithCaptionMessage?.message
    || message;

  if (inner.protocolMessage || inner.reactionMessage || inner.senderKeyDistributionMessage) {
    return '';
  }

  return inner.conversation
    || inner.extendedTextMessage?.text
    || inner.imageMessage?.caption
    || inner.videoMessage?.caption
    || inner.documentMessage?.caption
    || inner.buttonsResponseMessage?.selectedDisplayText
    || inner.listResponseMessage?.title
    || inner.templateButtonReplyMessage?.selectedDisplayText
    || (inner.imageMessage ? '[Imagem]' : '')
    || (inner.videoMessage ? '[Vídeo]' : '')
    || (inner.audioMessage ? '[Áudio]' : '')
    || (inner.stickerMessage ? '[Figurinha]' : '')
    || (inner.documentMessage ? '[Documento]' : '')
    || '';
}

async function getNotifyJid() {
  const phone = await getSetting('whatsapp_notify_phone');
  return phoneToJid(phone);
}

export function getSelfJid() {
  const raw = sock?.user?.id;
  if (!raw) return null;
  const phone = jidToPhone(raw);
  if (phone) return `${phone}@s.whatsapp.net`;
  const user = String(raw).split(':')[0];
  if (user.includes('@')) return user;
  return `${user}@s.whatsapp.net`;
}

function isOwnJid(jid) {
  if (!jid) return false;
  if (isSameJid(jid, getSelfJid())) return true;
  const lid = sock?.user?.lid;
  if (lid && (jid === lid || String(jid).split(':')[0] === String(lid).split(':')[0])) {
    return true;
  }
  const raw = sock?.user?.id;
  return Boolean(raw && (jid === raw || String(jid).split(':')[0] === String(raw).split(':')[0]));
}

export async function resolveBridgeJid(conversation) {
  if (conversation?.visitor_jid) return conversation.visitor_jid;
  const notifyJid = await getNotifyJid();
  if (notifyJid) return notifyJid;
  return getSelfJid();
}

async function isBridgeInboxJid(jid) {
  if (isOwnJid(jid)) return true;
  const notifyJid = await getNotifyJid();
  return Boolean(notifyJid && isSameJid(jid, notifyJid));
}

export async function sendWhatsApp(jid, text) {
  if (!isWhatsAppConnected() || !jid || !text) return null;
  const sent = await sock.sendMessage(jid, { text: String(text).slice(0, 4000) });
  rememberSentId(sent?.key?.id);
  return sent;
}

function buildSiteForwardText(conversation, text, { fromAdmin = false } = {}) {
  const name = conversation?.visitor_name || 'Visitante';
  const tag = conversationTag(conversation);
  const body = String(text || '').trim();
  if (conversation?.visitor_jid && !fromAdmin) {
    return `💬 ${name} (site):\n${body}`;
  }
  if (fromAdmin && conversation?.visitor_jid) {
    return body;
  }
  const who = fromAdmin ? 'Sorelle' : name;
  return `💬 Site · ${who} [#${tag}]\n${body}`;
}

export async function forwardSiteMessageToWhatsApp(conversation, text, options = {}) {
  if (!isWhatsAppConnected()) {
    console.warn('[whatsapp] Mensagem do site não enviada: WhatsApp desconectado');
    return null;
  }
  const jid = await resolveBridgeJid(conversation);
  if (!jid) {
    console.warn('[whatsapp] Sem destino para encaminhar a mensagem do site');
    return null;
  }
  const payload = buildSiteForwardText(conversation, text, options);
  try {
    return await sendWhatsApp(jid, payload);
  } catch (err) {
    const fallback = sock?.user?.id;
    if (fallback && fallback !== jid && !conversation?.visitor_jid) {
      try {
        return await sendWhatsApp(fallback, payload);
      } catch (retryErr) {
        console.error('[whatsapp] Falha ao encaminhar mensagem do site:', retryErr.message);
        return null;
      }
    }
    console.error('[whatsapp] Falha ao encaminhar mensagem do site:', err.message);
    return null;
  }
}

export async function notifyStoreNewSiteMessage(conversation, text) {
  return forwardSiteMessageToWhatsApp(conversation, text);
}

function parseConversationTag(text) {
  const match = String(text || '').match(/\[#([0-9a-f]{8})\]/i)
    || String(text || '').match(/^#([0-9a-f]{8})\b/i);
  return match?.[1] || null;
}

function isOurSiteForward(text) {
  return SITE_FORWARD_RE.test(String(text || '').trim());
}

function stripReplyTag(text) {
  return String(text || '')
    .replace(/^\s*\[#[0-9a-f]{8}\]\s*/i, '')
    .replace(/^\s*#[0-9a-f]{8}\s*/i, '')
    .trim();
}

async function resolveBridgeConversation(text) {
  const tag = parseConversationTag(text);
  if (tag) {
    const tagged = await getConversationByTag(tag);
    if (tagged) return tagged;
  }
  return (await getLatestOpenConversation({ siteOnly: true }))
    || (await getLatestOpenConversation());
}

async function handleIncomingWaMessage(msg) {
  if (!msg?.key || msg.broadcast) return;
  const jid = msg.key.remoteJid;
  if (isIgnoredJid(jid)) return;

  const waMessageId = msg.key.id;
  if (waMessageId && (recentSentIds.has(waMessageId) || await hasWaMessage(waMessageId))) {
    return;
  }

  const text = extractWaText(msg.message);
  if (!text) return;

  const fromMe = Boolean(msg.key.fromMe);
  const bridgeInbox = await isBridgeInboxJid(jid);

  if (fromMe && isOurSiteForward(text)) return;

  if (bridgeInbox) {
    const conversation = await resolveBridgeConversation(text);
    if (!conversation) return;
    const body = stripReplyTag(text);
    if (!body || isOurSiteForward(body)) return;
    const message = await addMessage({
      conversationId: conversation.id,
      direction: 'outbound',
      source: 'whatsapp',
      body,
      waMessageId,
      incrementUnread: false,
    });
    if (!message) return;
    emitChatMessage(conversation, message);
    emitConversationUpdate(conversation);
    updateBotState(conversation.id, { paused: true, stage: 'human' }).catch(() => {});
    return;
  }

  let conversation = await getConversationByJid(jid);
  if (!conversation) {
    if (fromMe) return;
    const phone = jidToPhone(jid);
    conversation = await createConversation({
      visitorName: msg.pushName || null,
      visitorPhone: phone,
      visitorJid: jid.includes('@s.whatsapp.net') ? `${phone}@s.whatsapp.net` : jid,
    });
  }

  const message = await addMessage({
    conversationId: conversation.id,
    direction: fromMe ? 'outbound' : 'inbound',
    source: 'whatsapp',
    body: text,
    waMessageId,
    incrementUnread: !fromMe,
  });
  if (!message) return;

  const fresh = await getConversationByJid(jid);
  emitChatMessage(fresh || conversation, message);
  emitConversationUpdate(fresh || conversation);

  if (fromMe) {
    updateBotState((fresh || conversation).id, { paused: true, stage: 'human' }).catch(() => {});
    return;
  }

  import('./salesBot.js')
    .then(({ maybeRunSalesBot }) => maybeRunSalesBot({
      conversation: fresh || conversation,
      inboundText: text,
    }))
    .catch((err) => console.error('[bot] whatsapp:', err.message));
}

function scheduleReconnect() {
  if (!shouldReconnect) return;
  if (reconnectTimer) return;
  reconnectAttempt += 1;
  const delay = Math.min(1000 * 2 ** Math.min(reconnectAttempt, 5), 60000);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    startWhatsApp().catch((err) => {
      console.error('[whatsapp] Reconexão falhou:', err.message);
    });
  }, delay);
}

export async function startWhatsApp() {
  if (starting || sock) return getWhatsAppStatus();
  if (isWhatsAppConnected()) return getWhatsAppStatus();

  starting = true;
  shouldReconnect = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  try {
    await ensureAuthDir();
    setStatus('connecting');

    const { state, saveCreds: persistCreds } = await useMultiFileAuthState(AUTH_DIR);
    saveCreds = persistCreds;

    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));

    sock = makeWASocket({
      version,
      logger,
      printQRInTerminal: false,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      browser: Browsers.ubuntu('Chrome'),
      markOnlineOnConnect: false,
      syncFullHistory: false,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          lastQr = await QRCode.toDataURL(qr);
          connectionStatus = 'qr';
          connectedPhone = null;
          emitWhatsAppQr(lastQr);
          broadcastStatus();
        } catch (err) {
          console.error('[whatsapp] Falha ao gerar QR:', err.message);
        }
      }

      if (connection === 'open') {
        reconnectAttempt = 0;
        const meId = sock?.user?.id || '';
        connectedPhone = jidToPhone(meId);
        lastQr = null;
        setStatus('connected', connectedPhone);
        console.log('[whatsapp] Conectado', connectedPhone || '');
      }

      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;
        sock = null;
        if (loggedOut) {
          shouldReconnect = false;
          await clearAuthDir().catch(() => {});
          setStatus('disconnected', null);
          console.warn('[whatsapp] Sessão encerrada. Escaneie o QR novamente.');
          return;
        }
        setStatus('connecting', connectedPhone);
        scheduleReconnect();
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify' && type !== 'append') return;
      for (const msg of messages || []) {
        try {
          await handleIncomingWaMessage(msg);
        } catch (err) {
          console.error('[whatsapp] Erro ao processar mensagem:', err.message);
        }
      }
    });

    return getWhatsAppStatus();
  } catch (err) {
    sock = null;
    setStatus('disconnected', null);
    console.error('[whatsapp] Falha ao iniciar:', err.message);
    scheduleReconnect();
    throw err;
  } finally {
    starting = false;
  }
}

export async function startWhatsAppIfSessionExists() {
  if (await hasSavedCreds()) {
    startWhatsApp().catch((err) => {
      console.error('[whatsapp] Auto-conexão falhou:', err.message);
    });
  }
}

export async function logoutWhatsApp() {
  shouldReconnect = false;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  try {
    if (sock) {
      await sock.logout().catch(() => {});
      sock.end?.(undefined);
    }
  } catch {
    // sessão já encerrada
  }
  sock = null;
  saveCreds = null;
  lastQr = null;
  await clearAuthDir().catch(() => {});
  setStatus('disconnected', null);
  return getWhatsAppStatus();
}

export async function closeWhatsApp() {
  shouldReconnect = false;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  try {
    sock?.end?.(undefined);
  } catch {
    // ignore
  }
  sock = null;
}
