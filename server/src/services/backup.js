import { spawn } from 'child_process';
import { createReadStream } from 'fs';
import { cp, mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, '../../uploads');

function formatSqlValue(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 'NULL';
    return String(value);
  }
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (value instanceof Date) return `'${value.toISOString()}'`;
  if (Buffer.isBuffer(value)) return `'\\x${value.toString('hex')}'`;
  if (typeof value === 'object') {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function dumpDatabaseSql(pool) {
  const { rows: tables } = await pool.query(`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `);

  const lines = [
    '-- Sorelle Presentes — backup de dados',
    `-- Gerado em: ${new Date().toISOString()}`,
    '-- Restaurar: psql -d sorelle -f database.sql (após migrate do schema)',
    '',
    'BEGIN;',
    'SET session_replication_role = replica;',
    '',
  ];

  for (const { tablename } of tables) {
    const quoted = `"${tablename.replace(/"/g, '""')}"`;
    lines.push(`-- Tabela ${tablename}`);
    lines.push(`TRUNCATE TABLE ${quoted} CASCADE;`);

    const { rows } = await pool.query(`SELECT * FROM ${quoted}`);
    if (rows.length === 0) {
      lines.push('');
      continue;
    }

    const columns = Object.keys(rows[0]).map((col) => `"${col.replace(/"/g, '""')}"`);
    for (const row of rows) {
      const values = Object.keys(row).map((col) => formatSqlValue(row[col]));
      lines.push(
        `INSERT INTO ${quoted} (${columns.join(', ')}) VALUES (${values.join(', ')});`
      );
    }
    lines.push('');
  }

  lines.push('SET session_replication_role = DEFAULT;');
  lines.push('COMMIT;');
  lines.push('');
  return lines.join('\n');
}

function runTar(archivePath, workDir) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'tar',
      ['-czf', archivePath, '-C', workDir, 'database.sql', 'LEIA-ME.txt', 'uploads'],
      { stdio: ['ignore', 'ignore', 'pipe'] }
    );
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => {
      reject(new Error(`Falha ao executar tar: ${err.message}`));
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `tar encerrou com código ${code}`));
    });
  });
}

/**
 * Gera arquivo .tar.gz com database.sql + pasta uploads.
 * Retorna { archivePath, cleanup } — chame cleanup() após o download.
 */
export async function createBackupArchive(pool) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const workDir = await mkdtemp(path.join(tmpdir(), 'sorelle-backup-'));
  const archivePath = path.join(tmpdir(), `sorelle-backup-${stamp}.tar.gz`);

  const cleanup = async () => {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
    await rm(archivePath, { force: true }).catch(() => {});
  };

  try {
    const sql = await dumpDatabaseSql(pool);
    await writeFile(path.join(workDir, 'database.sql'), sql, 'utf8');

    await writeFile(
      path.join(workDir, 'LEIA-ME.txt'),
      [
        'Backup Sorelle Presentes',
        `Data: ${new Date().toISOString()}`,
        '',
        'Conteúdo:',
        '- database.sql — dados das tabelas (INSERT)',
        '- uploads/ — imagens, etiquetas e notas fiscais',
        '',
        'Restauração sugerida:',
        '1. Subir o schema (npm run db:migrate)',
        '2. psql "$DATABASE_URL" -f database.sql',
        '3. Copiar uploads/ para a pasta uploads do servidor',
        '',
        'Atenção: este arquivo contém dados sensíveis (pedidos, configurações, tokens).',
        '',
      ].join('\n'),
      'utf8'
    );

    const uploadsDest = path.join(workDir, 'uploads');
    await mkdir(uploadsDest, { recursive: true });
    try {
      await cp(UPLOADS_DIR, uploadsDest, { recursive: true });
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }

    await runTar(archivePath, workDir);
    await rm(workDir, { recursive: true, force: true }).catch(() => {});

    return {
      archivePath,
      filename: `sorelle-backup-${stamp}.tar.gz`,
      cleanup: async () => {
        await rm(archivePath, { force: true }).catch(() => {});
      },
      createReadStream: () => createReadStream(archivePath),
    };
  } catch (err) {
    await cleanup();
    throw err;
  }
}
