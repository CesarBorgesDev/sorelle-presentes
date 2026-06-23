import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import orderRoutes from './routes/orders.js';
import affiliateRoutes from './routes/affiliates.js';
import affiliateConversionRoutes from './routes/affiliateConversions.js';
import cartItemRoutes from './routes/cartItems.js';
import settingsRoutes from './routes/settings.js';
import imageRoutes from './routes/images.js';
import checkoutRoutes from './routes/checkout.js';
import shippingRoutes from './routes/shipping.js';
import accountRoutes from './routes/account.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '15mb' }));

app.use('/api/uploads', express.static(path.join(__dirname, '../uploads')));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', message: 'Sorelle API funcionando' });
});

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/affiliates', affiliateRoutes);
app.use('/api/affiliate-conversions', affiliateConversionRoutes);
app.use('/api/cart-items', cartItemRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/images', imageRoutes);
app.use('/api/checkout', checkoutRoutes);
app.use('/api/shipping', shippingRoutes);
app.use('/api/account', accountRoutes);

app.use((_req, res) => {
  res.status(404).json({ message: 'Rota não encontrada' });
});

app.use((err, _req, res, _next) => {
  console.error('Erro não tratado:', err);
  res.status(500).json({ message: 'Erro interno do servidor' });
});

app.listen(PORT, () => {
  console.log(`Servidor Sorelle rodando em http://localhost:${PORT}`);
});
