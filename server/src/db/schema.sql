-- Schema Sorelle Presentes
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  full_name VARCHAR(255),
  phone VARCHAR(50),
  document VARCHAR(20),
  address TEXT,
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  product_specifications TEXT,
  technology TEXT,
  care_instructions TEXT,
  price NUMERIC(10, 2) NOT NULL,
  original_price NUMERIC(10, 2),
  category VARCHAR(50) NOT NULL,
  subcategory VARCHAR(100),
  image_url TEXT,
  images JSONB DEFAULT '[]',
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  in_stock BOOLEAN NOT NULL DEFAULT TRUE,
  quantity INTEGER NOT NULL DEFAULT 0,
  internal_code VARCHAR(100),
  sku VARCHAR(100),
  materials TEXT,
  dimensions TEXT,
  weight_kg NUMERIC(8, 3),
  length_cm NUMERIC(8, 2),
  width_cm NUMERIC(8, 2),
  height_cm NUMERIC(8, 2),
  variants JSONB NOT NULL DEFAULT '{"colors":[],"sizes":[],"stock":[]}',
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name VARCHAR(255) NOT NULL,
  customer_email VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(50),
  customer_address TEXT,
  items JSONB NOT NULL DEFAULT '[]',
  subtotal NUMERIC(10, 2) DEFAULT 0,
  wrapping_cost NUMERIC(10, 2) DEFAULT 0,
  shipping_cost NUMERIC(10, 2) DEFAULT 0,
  shipping_service_code VARCHAR(20),
  shipping_service_name VARCHAR(50),
  shipping_deadline_days INTEGER,
  total NUMERIC(10, 2) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'confirmado', 'em_preparo', 'enviado', 'entregue', 'cancelado')),
  payment_method VARCHAR(30) CHECK (payment_method IN ('pix', 'cartao_credito', 'boleto', 'cielo', 'test')),
  payment_status VARCHAR(30) NOT NULL DEFAULT 'aguardando_pagamento'
    CHECK (payment_status IN ('aguardando_pagamento', 'pago', 'recusado', 'cancelado')),
  gateway_order_number VARCHAR(64),
  notes TEXT,
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS affiliates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  code VARCHAR(50) UNIQUE NOT NULL,
  commission_rate NUMERIC(5, 2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('ativo', 'inativo', 'pendente')),
  payment_info TEXT,
  notes TEXT,
  total_sales NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_commission NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS affiliate_conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
  affiliate_name VARCHAR(255) NOT NULL,
  affiliate_code VARCHAR(50) NOT NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  order_total NUMERIC(10, 2) NOT NULL,
  commission_rate NUMERIC(5, 2) NOT NULL,
  commission_value NUMERIC(10, 2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'aprovado', 'pago', 'cancelado')),
  notes TEXT,
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_name VARCHAR(255) NOT NULL,
  product_image TEXT,
  price NUMERIC(10, 2) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  wrapping VARCHAR(20) NOT NULL DEFAULT 'none'
    CHECK (wrapping IN ('none', 'kraft', 'signature')),
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_created_date ON products(created_date DESC);
CREATE INDEX IF NOT EXISTS idx_orders_created_date ON orders(created_date DESC);
CREATE INDEX IF NOT EXISTS idx_cart_items_user_id ON cart_items(user_id);

CREATE TABLE IF NOT EXISTS app_settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migrações incrementais
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(30) NOT NULL DEFAULT 'aguardando_pagamento';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS gateway_order_number VARCHAR(64);

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IS NULL OR payment_method IN (
    'pix', 'cartao_credito', 'cartao_debito', 'boleto', 'dinheiro', 'pagar_na_loja', 'cielo', 'test'
  ));

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN ('aguardando_pagamento', 'pago', 'recusado', 'cancelado'));

ALTER TABLE products ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(8, 3);
ALTER TABLE products ADD COLUMN IF NOT EXISTS length_cm NUMERIC(8, 2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS width_cm NUMERIC(8, 2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS height_cm NUMERIC(8, 2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS internal_code VARCHAR(100);
UPDATE products SET quantity = 1 WHERE in_stock = true AND quantity = 0;
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_internal_code ON products(internal_code) WHERE internal_code IS NOT NULL AND internal_code <> '';

ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_cost NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_service_code VARCHAR(20);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_service_name VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_deadline_days INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_code VARCHAR(30);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_label_url TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cielo_authorization_code VARCHAR(64);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cielo_payment_id VARCHAR(64);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pix_qr_code_image TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pix_qr_code_text TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS boleto_url TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS boleto_digitable_line TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_pdf_url TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_xml_url TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS sipag_payment_id VARCHAR(64);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS sipag_authorization_code VARCHAR(128);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_gateway VARCHAR(20);

ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS document VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT;

CREATE TABLE IF NOT EXISTS wishlist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);

CREATE TABLE IF NOT EXISTS rma_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  reason VARCHAR(50) NOT NULL,
  description TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'aberta'
    CHECK (status IN ('aberta', 'em_analise', 'aprovada', 'recusada', 'concluida')),
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wishlist_user_id ON wishlist_items(user_id);
CREATE INDEX IF NOT EXISTS idx_rma_user_id ON rma_requests(user_id);

CREATE TABLE IF NOT EXISTS product_kits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  price NUMERIC(10, 2),
  original_price NUMERIC(10, 2),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_kit_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kit_id UUID NOT NULL REFERENCES product_kits(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(kit_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_product_kits_product_id ON product_kits(product_id);
CREATE INDEX IF NOT EXISTS idx_product_kit_items_kit_id ON product_kit_items(kit_id);
CREATE INDEX IF NOT EXISTS idx_product_kit_items_product_id ON product_kit_items(product_id);

ALTER TABLE product_kits ADD COLUMN IF NOT EXISTS price NUMERIC(10, 2);
ALTER TABLE product_kits ADD COLUMN IF NOT EXISTS original_price NUMERIC(10, 2);

ALTER TABLE products ADD COLUMN IF NOT EXISTS variants JSONB NOT NULL DEFAULT '{"colors":[],"sizes":[],"stock":[]}'::jsonb;
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS variant_color VARCHAR(100);
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS variant_size VARCHAR(50);

ALTER TABLE products ADD COLUMN IF NOT EXISTS product_specifications TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS technology TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS care_instructions TEXT;

CREATE TABLE IF NOT EXISTS brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  logo_url TEXT,
  website_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brands_active_sort ON brands(active, sort_order);

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_categories_active_sort ON categories(active, sort_order);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);

-- Seed das categorias originais (idempotente)
INSERT INTO categories (name, slug, description, sort_order) VALUES
  ('Casa', 'casa', 'Objetos que transformam seu lar em um refúgio de estilo e conforto.', 1),
  ('Decoração', 'decoracao', 'Peças artesanais e escultóricas que contam histórias únicas.', 2),
  ('Fragrâncias', 'fragancias', 'Aromas que envolvem cada ambiente em uma experiência sensorial.', 3),
  ('Cama, Mesa & Banho', 'cama_mesa_banho', 'Tecidos nobres e texturas que acariciam os sentidos.', 4)
ON CONFLICT (slug) DO NOTHING;

-- PIX e cartão de crédito habilitados por padrão no checkout
INSERT INTO app_settings (key, value) VALUES
  ('payment_methods_enabled', '["pix","cartao_credito"]')
ON CONFLICT (key) DO NOTHING;

UPDATE app_settings
SET value = '["pix","cartao_credito"]', updated_date = NOW()
WHERE key = 'payment_methods_enabled' AND value = '["pix"]';

-- Checkout Cielo: formato de notificação padrão POST (form-data)
INSERT INTO app_settings (key, value) VALUES
  ('cielo_notification_method', 'post')
ON CONFLICT (key) DO NOTHING;

INSERT INTO app_settings (key, value) VALUES
  ('payment_gateway', 'cielo')
ON CONFLICT (key) DO NOTHING;

-- Categoria de produto agora é validada pela tabela categories (constraint antiga removida)
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_category_check;

ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES categories(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
