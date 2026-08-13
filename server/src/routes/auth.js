import { Router } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../config/db.js';
import { config } from '../config/env.js';
import { generateToken, requireAuth } from '../middleware/auth.js';
import { rowToEntity } from '../utils/helpers.js';
import {
  buildGoogleAuthorizeUrl,
  decodeOAuthState,
  getGoogleProfileFromCode,
  isProfileComplete,
} from '../services/googleAuth.js';
import {
  isPlaceholderFullName,
  normalizeDocument,
  normalizeZipCode,
  profileIncompleteMessage,
  resolvePersonName,
} from '../utils/userProfile.js';

const router = Router();

function publicUser(row) {
  return rowToEntity({
    id: row.id,
    email: row.email,
    role: row.role,
    full_name: resolvePersonName(row.full_name, row.email) || null,
    phone: row.phone,
    document: row.document,
    address: row.address,
    zip_code: row.zip_code,
    google_id: row.google_id || null,
    created_date: row.created_date,
  });
}

function frontendRedirect(path) {
  const base = (config.frontendUrl || 'http://localhost:3000').replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

async function findOrCreateGoogleUser(profile) {
  const googleName = isPlaceholderFullName(profile.fullName, profile.email)
    ? null
    : String(profile.fullName || '').trim() || null;
  const byGoogle = await pool.query(
    `SELECT id, email, role, full_name, phone, document, address, zip_code, google_id, created_date
     FROM users WHERE google_id = $1`,
    [profile.googleId]
  );
  if (byGoogle.rows[0]) {
    return byGoogle.rows[0];
  }

  const byEmail = await pool.query(
    `SELECT id, email, role, full_name, phone, document, address, zip_code, google_id, created_date
     FROM users WHERE LOWER(email) = LOWER($1)`,
    [profile.email]
  );

  if (byEmail.rows[0]) {
    const nextName = resolvePersonName(byEmail.rows[0].full_name, profile.email) || googleName;
    const linked = await pool.query(
      `UPDATE users
       SET google_id = $1,
           full_name = COALESCE($2, full_name),
           updated_date = NOW()
       WHERE id = $3
       RETURNING id, email, role, full_name, phone, document, address, zip_code, google_id, created_date`,
      [profile.googleId, nextName, byEmail.rows[0].id]
    );
    return linked.rows[0];
  }

  const created = await pool.query(
    `INSERT INTO users (email, password_hash, role, full_name, google_id)
     VALUES ($1, NULL, 'user', $2, $3)
     RETURNING id, email, role, full_name, phone, document, address, zip_code, google_id, created_date`,
    [profile.email, googleName, profile.googleId]
  );
  return created.rows[0];
}

router.post('/register', async (req, res) => {
  try {
    const {
      email,
      password,
      full_name,
      phone,
      document,
      address,
      zip_code,
    } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'E-mail e senha são obrigatórios' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'A senha deve ter pelo menos 6 caracteres' });
    }

    const profileDraft = {
      email: String(email).trim().toLowerCase(),
      full_name: String(full_name || '').trim(),
      phone: String(phone || '').trim(),
      document: normalizeDocument(document),
      address: String(address || '').trim(),
      zip_code: normalizeZipCode(zip_code),
    };

    const incomplete = profileIncompleteMessage(profileDraft);
    if (incomplete) {
      return res.status(400).json({ message: incomplete });
    }

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [profileDraft.email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ message: 'Este e-mail já está cadastrado' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, role, full_name, phone, document, address, zip_code)
       VALUES ($1, $2, 'user', $3, $4, $5, $6, $7)
       RETURNING id, email, role, full_name, phone, document, address, zip_code, google_id, created_date`,
      [
        profileDraft.email,
        passwordHash,
        profileDraft.full_name,
        profileDraft.phone,
        profileDraft.document,
        profileDraft.address,
        profileDraft.zip_code,
      ]
    );

    const user = publicUser(result.rows[0]);
    const token = generateToken(user);

    res.status(201).json({
      access_token: token,
      user,
      needs_profile: !isProfileComplete(user),
    });
  } catch (err) {
    console.error('Erro no registro:', err);
    res.status(500).json({ message: 'Erro ao criar conta' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'E-mail e senha são obrigatórios' });
    }

    const result = await pool.query(
      `SELECT id, email, password_hash, role, full_name, phone, document, address, zip_code, google_id, created_date
       FROM users WHERE email = $1`,
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'E-mail ou senha inválidos' });
    }

    const user = result.rows[0];
    if (!user.password_hash) {
      return res.status(401).json({
        message: 'Esta conta usa login com Google. Clique em Continuar com Google.',
      });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ message: 'E-mail ou senha inválidos' });
    }

    const entity = publicUser(user);
    const token = generateToken(entity);

    res.json({
      access_token: token,
      user: entity,
      needs_profile: !isProfileComplete(entity),
    });
  } catch (err) {
    console.error('Erro no login:', err);
    res.status(500).json({ message: 'Erro ao fazer login' });
  }
});

router.get('/google', (req, res) => {
  try {
    const returnUrl = typeof req.query.returnUrl === 'string' ? req.query.returnUrl : '/';
    const url = buildGoogleAuthorizeUrl({ returnUrl });
    res.redirect(url);
  } catch (err) {
    console.error('[Google Auth] authorize:', err.message);
    const message = encodeURIComponent(err.message || 'Login com Google indisponível');
    res.redirect(frontendRedirect(`/login?error=${message}`));
  }
});

router.get('/google/callback', async (req, res) => {
  const state = decodeOAuthState(req.query.state);
  const returnUrl = typeof state.returnUrl === 'string' && state.returnUrl.startsWith('/')
    ? state.returnUrl
    : '/';

  try {
    if (req.query.error) {
      throw new Error(String(req.query.error_description || req.query.error));
    }
    const code = req.query.code;
    if (!code) {
      throw new Error('Código de autorização Google ausente');
    }

    const profile = await getGoogleProfileFromCode(String(code));
    const row = await findOrCreateGoogleUser(profile);
    const user = publicUser(row);
    const token = generateToken(user);
    const needsProfile = !isProfileComplete(user);

    const params = new URLSearchParams({
      token,
      returnUrl,
      needsProfile: needsProfile ? '1' : '0',
    });
    res.redirect(frontendRedirect(`/auth/callback?${params}`));
  } catch (err) {
    console.error('[Google Auth] callback:', err.message);
    const message = encodeURIComponent(err.message || 'Falha no login com Google');
    const params = new URLSearchParams({
      error: message,
      returnUrl,
    });
    res.redirect(frontendRedirect(`/login?${params}`));
  }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, email, role, full_name, phone, document, address, zip_code, google_id, created_date
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }
    const user = publicUser(result.rows[0]);
    res.json({
      ...user,
      needs_profile: !isProfileComplete(user),
    });
  } catch (err) {
    console.error('Erro ao buscar usuário:', err);
    res.status(500).json({ message: 'Erro interno' });
  }
});

router.post('/reset-password-request', async (req, res) => {
  const { email } = req.body;
  console.log(`Solicitação de reset de senha para: ${email}`);
  res.json({ message: 'Se o e-mail existir, você receberá instruções para redefinir a senha.' });
});

export default router;
