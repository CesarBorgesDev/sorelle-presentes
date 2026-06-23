import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { getSetting } from '../services/settings.js';
import { generateProductScene, DEFAULT_IMAGE_MODEL } from '../services/imageGeneration.js';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, '../../uploads/generated');
const PRODUCTS_DIR = path.join(__dirname, '../../uploads/products');
const TEMP_DIR = path.join(__dirname, '../../uploads/temp');

for (const dir of [UPLOADS_DIR, PRODUCTS_DIR, TEMP_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function parseBase64Image(image, fallbackMime = 'image/jpeg') {
  const raw = String(image || '').trim();
  const dataUrlMatch = raw.match(/^data:([^;]+);base64,(.+)$/);
  if (dataUrlMatch) {
    return { mimeType: dataUrlMatch[1], data: dataUrlMatch[2] };
  }
  return { mimeType: fallbackMime, data: raw };
}

function saveImageBuffer({ data, mimeType, targetDir }) {
  const ext = MIME_EXT[mimeType] || 'jpg';
  const filename = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
  const filepath = path.join(targetDir, filename);
  fs.writeFileSync(filepath, Buffer.from(data, 'base64'));
  return filename;
}

router.post('/upload-product', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { image, mime_type: mimeTypeHint } = req.body;

    if (!image) {
      return res.status(400).json({ message: 'Envie uma imagem para upload' });
    }

    const { mimeType, data } = parseBase64Image(image, mimeTypeHint || 'image/jpeg');
    if (!MIME_EXT[mimeType]) {
      return res.status(400).json({ message: 'Formato não suportado. Use JPG, PNG ou WebP.' });
    }

    const filename = saveImageBuffer({ data, mimeType, targetDir: PRODUCTS_DIR });

    res.json({
      image_url: `/api/uploads/products/${filename}`,
      message: 'Imagem enviada com sucesso',
    });
  } catch (err) {
    console.error('Erro no upload de imagem:', err);
    res.status(500).json({ message: err.message || 'Erro ao enviar imagem' });
  }
});

router.post('/generate-scene', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { image, mime_type, product_name, category, materials } = req.body;

    if (!image) {
      return res.status(400).json({ message: 'Envie uma foto do produto para gerar o cenário a partir dela' });
    }

    const pollinationsApiKey = await getSetting('pollinations_api_key');
    const huggingfaceApiToken = await getSetting('huggingface_api_token');
    const stableHordeApiKey = await getSetting('stable_horde_api_key') || process.env.STABLE_HORDE_API_KEY;
    const imageModel = (await getSetting('image_model')) || DEFAULT_IMAGE_MODEL;
    const publicBaseUrl = process.env.APP_PUBLIC_URL || (await getSetting('app_public_url'));

    const generated = await generateProductScene({
      imageBase64: image,
      mimeType: mime_type || 'image/jpeg',
      productName: product_name,
      category,
      materials,
      pollinationsApiKey,
      huggingfaceApiToken,
      stableHordeApiKey,
      publicBaseUrl,
      model: imageModel,
    });

    const filename = saveImageBuffer({
      data: generated.data,
      mimeType: generated.mimeType,
      targetDir: UPLOADS_DIR,
    });

    res.json({
      image_url: `/api/uploads/generated/${filename}`,
      message: image
        ? 'Imagem gerada a partir da foto enviada'
        : 'Imagem gerada com sucesso (Pollinations — API gratuita)',
    });
  } catch (err) {
    console.error('Erro ao gerar imagem:', err);
    res.status(500).json({ message: err.message || 'Erro ao gerar imagem' });
  }
});

export default router;
