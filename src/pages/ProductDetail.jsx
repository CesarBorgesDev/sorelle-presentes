import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { motion } from 'framer-motion';
import { ArrowLeft, Minus, Plus, ShoppingBag, Check, Heart } from 'lucide-react';
import { getProductImages } from '@/lib/productImages';
import { resolveMediaUrl } from '@/lib/resolveMediaUrl';
import { Button } from '@/components/ui/button';

const categoryLabels = {
  casa: 'Casa',
  decoracao: 'Decoração',
  fragancias: 'Fragrâncias',
  cama_mesa_banho: 'Cama, Mesa & Banho',
};

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const [wishlisted, setWishlisted] = useState(false);
  const [activeImage, setActiveImage] = useState(0);
  const queryClient = useQueryClient();

  const { data: product, isLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: async () => {
      const products = await api.entities.Product.filter({ id });
      return products[0];
    },
  });

  const addToCartMutation = useMutation({
    mutationFn: (data) => api.entities.CartItem.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] });
      setAdded(true);
      setTimeout(() => setAdded(false), 2000);
    },
  });

  const wishlistMutation = useMutation({
    mutationFn: (productId) => api.account.addToWishlist(productId),
    onSuccess: () => {
      setWishlisted(true);
      queryClient.invalidateQueries({ queryKey: ['wishlist'] });
      setTimeout(() => setWishlisted(false), 2000);
    },
  });

  const handleAddToWishlist = () => {
    if (!product) return;
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    wishlistMutation.mutate(product.id);
  };

  const handleAddToCart = () => {
    if (!product) return;
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    addToCartMutation.mutate({
      product_id: product.id,
      product_name: product.name,
      product_image: product.image_url,
      price: product.price,
      quantity,
      wrapping: 'none',
    });
  };

  if (isLoading) {
    return (
      <div className="pt-20 lg:pt-24 px-6 lg:px-16">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 py-12">
          <div className="aspect-[4/5] bg-secondary rounded-sm animate-pulse" />
          <div className="space-y-4 py-8">
            <div className="h-3 bg-secondary rounded w-24" />
            <div className="h-8 bg-secondary rounded w-64" />
            <div className="h-4 bg-secondary rounded w-32" />
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="pt-20 lg:pt-24 text-center py-32">
        <p className="font-body text-muted-foreground">Produto não encontrado.</p>
      </div>
    );
  }

  const allImages = getProductImages(product).map(resolveMediaUrl);

  return (
    <div className="pt-20 lg:pt-24">
      <div className="max-w-7xl mx-auto px-6 lg:px-16 py-8 lg:py-12">
        {/* Breadcrumb */}
        <Link
          to={`/categoria/${product.category}`}
          className="inline-flex items-center gap-2 font-body text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          {categoryLabels[product.category] || product.category}
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16">
          {/* Images - Scrollable Left */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="aspect-[4/5] rounded-sm overflow-hidden bg-secondary mb-4">
              <img
                src={allImages[activeImage]}
                alt={product.name}
                className="w-full h-full object-cover"
              />
            </div>
            {allImages.length > 1 && (
              <div className="flex gap-2">
                {allImages.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveImage(i)}
                    className={`w-16 h-20 rounded-sm overflow-hidden border-2 transition-all ${
                      activeImage === i ? 'border-primary' : 'border-transparent opacity-60 hover:opacity-100'
                    }`}
                  >
                    <img src={img} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </motion.div>

          {/* Info - Sticky Right */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="lg:sticky lg:top-28 lg:self-start"
          >
            <p className="text-xs tracking-[0.3em] uppercase text-muted-foreground font-body mb-3">
              {product.subcategory || categoryLabels[product.category]}
            </p>

            <h1 className="font-display text-2xl lg:text-3xl tracking-wider text-foreground mb-4">
              {product.name}
            </h1>

            <div className="flex items-center gap-3 mb-6">
              <span className="font-body text-xl font-medium text-foreground">
                R$ {product.price?.toFixed(2).replace('.', ',')}
              </span>
              {product.original_price && (
                <span className="font-body text-sm text-muted-foreground line-through">
                  R$ {product.original_price?.toFixed(2).replace('.', ',')}
                </span>
              )}
            </div>

            {product.description && (
              <p className="font-body text-sm text-muted-foreground leading-relaxed mb-8">
                {product.description}
              </p>
            )}

            {/* Details */}
            <div className="space-y-3 mb-8 pb-8 border-b border-border">
              {product.materials && (
                <div className="flex justify-between font-body text-sm">
                  <span className="text-muted-foreground">Material</span>
                  <span className="text-foreground">{product.materials}</span>
                </div>
              )}
              {product.dimensions && (
                <div className="flex justify-between font-body text-sm">
                  <span className="text-muted-foreground">Dimensões</span>
                  <span className="text-foreground">{product.dimensions}</span>
                </div>
              )}
              {product.sku && (
                <div className="flex justify-between font-body text-sm">
                  <span className="text-muted-foreground">SKU</span>
                  <span className="text-foreground">{product.sku}</span>
                </div>
              )}
            </div>

            {/* Quantity */}
            <div className="flex items-center gap-4 mb-6">
              <span className="font-body text-sm text-muted-foreground">Quantidade</span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-9 h-9 border border-border rounded-sm flex items-center justify-center hover:bg-secondary transition-colors"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="font-body text-sm w-8 text-center">{quantity}</span>
                <button
                  onClick={() => setQuantity(quantity + 1)}
                  className="w-9 h-9 border border-border rounded-sm flex items-center justify-center hover:bg-secondary transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Add to Cart */}
            <Button
              onClick={handleAddToCart}
              disabled={addToCartMutation.isPending || !product.in_stock}
              className="w-full bg-foreground text-background hover:bg-foreground/90 font-body tracking-wider uppercase text-sm py-6 rounded-sm"
            >
              {added ? (
                <span className="flex items-center gap-2"><Check className="w-4 h-4" /> Adicionado</span>
              ) : (
                <span className="flex items-center gap-2"><ShoppingBag className="w-4 h-4" /> Adicionar ao Carrinho</span>
              )}
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={handleAddToWishlist}
              disabled={wishlistMutation.isPending}
              className="w-full mt-3 font-body tracking-wider text-sm py-6 rounded-sm gap-2"
            >
              {wishlisted ? (
                <><Check className="w-4 h-4" /> Na lista de desejos</>
              ) : (
                <><Heart className="w-4 h-4" /> Adicionar à lista de desejos</>
              )}
            </Button>

            {!product.in_stock && (
              <p className="font-body text-sm text-destructive mt-3 text-center">Produto indisponível</p>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}