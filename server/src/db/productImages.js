const IMG = (id) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=800&q=80`;

export const sampleProducts = [
  {
    name: 'Vaso Orgânico em Cerâmica',
    description: 'Vaso artesanal com formas orgânicas, perfeito para flores secas ou arranjos minimalistas.',
    price: 189.90,
    original_price: 229.90,
    category: 'decoracao',
    subcategory: 'Vasos',
    image_url: IMG('1618220179428-22790b461013'),
    featured: true,
    in_stock: true,
    materials: 'Cerâmica artesanal',
    dimensions: '22cm x 15cm',
  },
  {
    name: 'Vela Aromática Lavanda',
    description: 'Vela de cera de soja com essência de lavanda, queima limpa de até 40 horas.',
    price: 79.90,
    category: 'fragancias',
    subcategory: 'Velas',
    image_url: IMG('1597848212624-a19eb35e2651'),
    featured: true,
    in_stock: true,
    materials: 'Cera de soja, óleo essencial',
    dimensions: '9cm x 8cm',
  },
  {
    name: 'Jogo de Toalhas Premium',
    description: 'Conjunto de toalhas de banho e rosto em algodão egípcio 600 fios.',
    price: 349.90,
    category: 'cama_mesa_banho',
    subcategory: 'Toalhas',
    image_url: IMG('1631049307264-da0ec9d70304'),
    featured: false,
    in_stock: true,
    materials: 'Algodão egípcio',
    dimensions: 'Banho 70x140cm, Rosto 50x90cm',
  },
  {
    name: 'Bandeja Decorativa em Madeira',
    description: 'Bandeja em madeira maciça com acabamento natural, ideal para servir ou decorar.',
    price: 159.90,
    category: 'casa',
    subcategory: 'Bandejas',
    image_url: IMG('1556909114-f6e7ad7d3136'),
    featured: true,
    in_stock: true,
    materials: 'Madeira maciça',
    dimensions: '35cm x 25cm',
  },
];

export async function syncProductImages(pool) {
  for (const product of sampleProducts) {
    const result = await pool.query(
      `UPDATE products SET image_url = $1, updated_date = NOW() WHERE name = $2`,
      [product.image_url, product.name]
    );
    if (result.rowCount > 0) {
      console.log(`Imagem atualizada: ${product.name}`);
    }
  }
}
