import { Router } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../config/db.js';
import { generateToken, requireAuth } from '../middleware/auth.js';
import { rowToEntity } from '../utils/helpers.js';

const router = Router();

router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'E-mail e senha são obrigatórios' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'A senha deve ter pelo menos 6 caracteres' });
    }

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ message: 'Este e-mail já está cadastrado' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, role, created_date',
      [email.toLowerCase(), passwordHash, 'user']
    );

    const user = rowToEntity(result.rows[0]);
    const token = generateToken(user);

    res.status(201).json({ access_token: token, user });
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
      'SELECT id, email, password_hash, role, created_date FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'E-mail ou senha inválidos' });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ message: 'E-mail ou senha inválidos' });
    }

    const entity = rowToEntity({ id: user.id, email: user.email, role: user.role, created_date: user.created_date });
    const token = generateToken(entity);

    res.json({ access_token: token, user: entity });
  } catch (err) {
    console.error('Erro no login:', err);
    res.status(500).json({ message: 'Erro ao fazer login' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, role, full_name, phone, document, address, created_date FROM users WHERE id = $1',
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }
    res.json(rowToEntity(result.rows[0]));
  } catch (err) {
    console.error('Erro ao buscar usuário:', err);
    res.status(500).json({ message: 'Erro interno' });
  }
});

router.post('/reset-password-request', async (req, res) => {
  const { email } = req.body;
  // Em produção, enviaria e-mail com token. Por ora, retorna sucesso genérico.
  console.log(`Solicitação de reset de senha para: ${email}`);
  res.json({ message: 'Se o e-mail existir, você receberá instruções para redefinir a senha.' });
});

export default router;
