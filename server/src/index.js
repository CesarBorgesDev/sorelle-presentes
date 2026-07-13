import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { config, assertRequiredConfig } from './config/env.js';
import { corsMiddleware } from './config/cors.js';
import pool, { checkDatabaseConnection } from './config/db.js';
import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import productKitRoutes from './routes/productKits.js';
import orderRoutes from './routes/orders.js';
import affiliateRoutes from './routes/affiliates.js';
import affiliateConversionRoutes from './routes/affiliateConversions.js';
import cartItemRoutes from './routes/cartItems.js';
import settingsRoutes from './routes/settings.js';
import imageRoutes from './routes/images.js';
import checkoutRoutes from './routes/checkout.js';
import shippingRoutes from './routes/shipping.js';
import accountRoutes from './routes/account.js';
import pagesRoutes from './routes/pages.js';
import homeBannersRoutes from './routes/homeBanners.js';
import brandRoutes from './routes/brands.js';
import categoryRoutes from './routes/categories.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(corsMiddleware);
app.use(express.json({ limit: '15mb' }));

app.use('/api/uploads', (req, res, next) => {
  if (req.path.startsWith('/invoices')) {
    return res.status(404).json({ message: 'Recurso não encontrado' });
  }
  next();
});
app.use('/api/uploads', express.static(path.join(__dirname, '../uploads')));

app.get('/api/health', async (_req, res) => {
  try {
    await checkDatabaseConnection();
    res.json({
      status: 'ok',
      message: 'Sorelle API funcionando',
      db: 'up',
      env: config.nodeEnv,
    });
  } catch (err) {
    console.error('[health] Banco indisponível:', err.message);
    res.status(503).json({
      status: 'degraded',
      message: 'API online, banco de dados indisponível',
      db: 'down',
    });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/product-kits', productKitRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/affiliates', affiliateRoutes);
app.use('/api/affiliate-conversions', affiliateConversionRoutes);
app.use('/api/cart-items', cartItemRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/images', imageRoutes);
app.use('/api/checkout', checkoutRoutes);
app.use('/api/shipping', shippingRoutes);
app.use('/api/account', accountRoutes);
app.use('/api/pages', pagesRoutes);
app.use('/api/home-banners', homeBannersRoutes);
app.use('/api/brands', brandRoutes);
app.use('/api/categories', categoryRoutes);

app.use((_req, res) => {
  res.status(404).json({ message: 'Rota não encontrada' });
});

app.use((err, _req, res, _next) => {
  console.error('[API] Erro não tratado:', err);
  res.status(500).json({ message: 'Erro interno do servidor' });
});

assertRequiredConfig();

const server = app.listen(config.port, config.host, () => {
  console.log(`[Sorelle API] ${config.nodeEnv} → http://${config.host}:${config.port}`);
  console.log(`[Sorelle API] CORS FRONTEND=${config.frontendUrl || '(auto)'} | API=${config.appPublicUrl || '(auto)'}`);
});

function shutdown(signal) {
  console.log(`[Sorelle API] Encerrando (${signal})...`);
  server.close(async () => {
    await pool.end().catch(() => {});
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
