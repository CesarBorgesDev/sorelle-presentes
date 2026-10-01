import pool from '../../config/db.js';
import { maskToken } from '../settings.js';
import { CHANNELS, SECRET_KEYS, getChannel } from './constants.js';

function maskCredentials(credentials) {
  const output = {};
  for (const [key, value] of Object.entries(credentials || {})) {
    if (SECRET_KEYS.has(key) && value) {
      output[key] = maskToken(String(value));
    } else if (!SECRET_KEYS.has(key)) {
      output[key] = value ?? '';
    }
  }
  return output;
}

export function mergeCredentials(existing, incoming) {
  const next = { ...(existing || {}) };
  for (const [key, value] of Object.entries(incoming || {})) {
    if (key.startsWith('has_') || value == null) continue;
    const text = typeof value === 'string' ? value.trim() : value;
    if (typeof text === 'string' && SECRET_KEYS.has(key)) {
      if (text.includes('•')) continue;
      if (!text) {
        delete next[key];
        continue;
      }
    }
    next[key] = text;
  }
  return next;
}

function toPublic(definition, row) {
  return {
    id: definition.id,
    label: definition.label,
    hint: definition.hint,
    fields: definition.fields,
    status: row?.status || 'disconnected',
    shop_id: row?.shop_id || null,
    shop_name: row?.shop_name || null,
    last_error: row?.last_error || null,
    connected_at: row?.connected_at ? new Date(row.connected_at).toISOString() : null,
    credentials: maskCredentials(row?.credentials || {}),
  };
}

export async function listPublicAccounts() {
  const result = await pool.query('SELECT * FROM channel_accounts');
  const byChannel = new Map(result.rows.map((row) => [row.channel, row]));
  return CHANNELS.map((definition) => toPublic(definition, byChannel.get(definition.id)));
}

export async function getAccount(channel) {
  if (!getChannel(channel)) {
    throw Object.assign(new Error('Canal desconhecido.'), { status: 400 });
  }
  const result = await pool.query('SELECT * FROM channel_accounts WHERE channel = $1', [channel]);
  return result.rows[0] || null;
}

export async function saveAccount(channel, incoming, {
  status,
  shopId = null,
  shopName = null,
  lastError = null,
  markConnected = false,
} = {}) {
  const current = await getAccount(channel);
  const credentials = mergeCredentials(current?.credentials || {}, incoming);
  const nextStatus = status || current?.status || 'disconnected';
  await pool.query(
    `INSERT INTO channel_accounts (
       channel, status, credentials, shop_id, shop_name, last_error, connected_at, updated_date
     ) VALUES ($1, $2, $3::jsonb, $4, $5, $6, CASE WHEN $7::boolean THEN NOW() ELSE NULL END, NOW())
     ON CONFLICT (channel) DO UPDATE SET
       status = EXCLUDED.status,
       credentials = EXCLUDED.credentials,
       shop_id = COALESCE(EXCLUDED.shop_id, channel_accounts.shop_id),
       shop_name = COALESCE(EXCLUDED.shop_name, channel_accounts.shop_name),
       last_error = EXCLUDED.last_error,
       connected_at = CASE WHEN $7::boolean THEN NOW() ELSE channel_accounts.connected_at END,
       updated_date = NOW()`,
    [
      channel,
      nextStatus,
      JSON.stringify(credentials),
      shopId,
      shopName,
      lastError,
      markConnected,
    ]
  );
  return getAccount(channel);
}

export async function replaceCredentials(channel, credentials, extra = {}) {
  await pool.query(
    `UPDATE channel_accounts
     SET credentials = $2::jsonb,
         shop_id = COALESCE($3, shop_id),
         shop_name = COALESCE($4, shop_name),
         updated_date = NOW()
     WHERE channel = $1`,
    [channel, JSON.stringify(credentials), extra.shopId || null, extra.shopName || null]
  );
}

export async function disconnectAccount(channel) {
  const current = await getAccount(channel);
  const credentials = { ...(current?.credentials || {}) };
  for (const key of ['access_token', 'refresh_token', 'code']) {
    delete credentials[key];
  }
  await pool.query(
    `INSERT INTO channel_accounts (channel, status, credentials, last_error, updated_date)
     VALUES ($1, 'disconnected', $2::jsonb, NULL, NOW())
     ON CONFLICT (channel) DO UPDATE SET
       status = 'disconnected',
       credentials = EXCLUDED.credentials,
       last_error = NULL,
       updated_date = NOW()`,
    [channel, JSON.stringify(credentials)]
  );
  return getAccount(channel);
}
