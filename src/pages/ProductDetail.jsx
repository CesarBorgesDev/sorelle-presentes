import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { motion } from 'framer-motion';
import { ArrowLeft, Minus, Plus, ShoppingBag, Check, Heart, ChevronDown } from 'lucide-react';
import { resolveMediaUrl } from '@/lib/resolveMediaUrl';
import { Button } from '@/components/ui/button';
import RelatedKitsCarousel from '@/components/RelatedKitsCarousel';
import ProductShippingCalculator from '@/components/ProductShippingCalculator';
import ProductPaymentConditions from '@/components/ProductPaymentConditions';
import {
  buildVariantLabel,
  ensureVariantStockMatrix,
  getColorImages,
  getVariantStock,
  hasProductVariants,
  resolveVariantAvailability,
  usesSizeStock,
} from '@/lib/productVariants';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

const categoryLabels = {
  casa: 'Casa',
  decoracao: 'Decoração',
  fragancias: 'Fragrâncias',
  cama_mesa_banho: 'Cama, Mesa & Banho',
};

function ProductAccordionSection({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-b border-border">
      <CollapsibleTrigger className="flex w-full items-center justify-between py-4 text-left group">
        <span className="font-display text-sm tracking-widest uppercase text-foreground">
          {title}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="pb-5">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const [wishlisted, setWishlisted] = useState(false);
  const [activeImage, setActiveImage] = useState(0);
  const [selectedColorId, setSelectedColorId] = useState('');
  const [selectedSize, setSelectedSize] = useState('');
  const queryClient = useQueryClient();

  const { data: product, isLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: async () => {
      const products = await api.entities.Product.filter({ id });
      return products[0];
    },
  });

  const { data: relatedKitsData } = useQuery({
    queryKey: ['product-kits', id],
    queryFn: () => api.productKits.getByProduct(id),
    enabled: !!id,
  });

  const relatedKits = relatedKitsData?.kits || [];
  const variants = ensureVariantStockMatrix(product?.variants);
  const hasVariants = hasProductVariants(variants);
  const hasSizeGrid = usesSizeStock(variants);
  const selectedColor = variants.colors.find((color) => color.id === selectedColorId) || null;

  const availability = resolveVariantAvailability(product, selectedColorId, selectedSize);
  const available = availability.available;
  const stockQuantity = availability.quantity;
  const maxQuantity = available ? stockQuantity : 0;

  useEffect(() => {
    if (!product) return;
    const nextVariants = ensureVariantStockMatrix(product.variants);
    const firstAvailableColor = nextVariants.colors.find(
      (color) => getVariantStock(nextVariants, color.id, null) > 0
    ) || nextVariants.colors[0];
    setSelectedColorId(firstAvailableColor?.id || '');
    setSelectedSize('');
    setActiveImage(0);
    setQuantity(1);
  }, [product?.id]);

  useEffect(() => {
    if (!product || !hasSizeGrid) return;
    const nextVariants = ensureVariantStockMatrix(product.variants);

    if (selectedSize) {
      const currentStock = getVariantStock(nextVariants, selectedColorId, selectedSize);
      if (currentStock > 0) return;
    }

    const firstAvailableSize = nextVariants.sizes.find(
      (size) => getVariantStock(nextVariants, selectedColorId, size) > 0
    );
    setSelectedSize(firstAvailableSize || '');
  }, [product?.id, product?.variants, selectedColorId, hasSizeGrid, selectedSize]);

  useEffect(() => {
    setActiveImage(0);
  }, [selectedColorId]);

  useEffect(() => {
    if (maxQuantity > 0 && quantity > maxQuantity) {
      setQuantity(maxQuantity);
    }
  }, [maxQuantity, quantity]);

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
    if (availability.requiresSelection) {
      return;
    }

    const variantLabel = buildVariantLabel(selectedColor?.name, selectedSize);
    const displayName = variantLabel ? `${product.name} - ${variantLabel}` : product.name;
    const displayImage = getColorImages(product, selectedColorId)[0] || product.image_url;

    addToCartMutation.mutate({
      product_id: product.id,
      product_name: displayName,
      product_image: displayImage,
      price: product.price,
      quantity,
      wrapping: 'none',
      variant_color: selectedColorId || null,
      variant_size: selectedSize || null,
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

  const allImages = getColorImages(product, selectedColorId).map(resolveMediaUrl);

  const thumbnailButtonClass = (isActive) => (
    `rounded-sm overflow-hidden border-2 transition-all ${
      isActive ? 'border-primary opacity-100' : 'border-transparent opacity-60 hover:opacity-100'
    }`
  );

  return (
    <div className="pt-20 lg:pt-24">
      <div className="max-w-7xl mx-auto px-6 lg:px-16 py-8 lg:py-12">
        <Link
          to={`/categoria/${product.category}`}
          className="inline-flex items-center gap-2 font-body text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          {categoryLabels[product.category] || product.category}
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="flex gap-3 lg:gap-4">
              {allImages.length > 1 && (
                <div className="hidden lg:flex flex-col gap-2 w-[72px] shrink-0">
                  {allImages.map((img, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setActiveImage(i)}
                      className={`w-[72px] h-[88px] ${thumbnailButtonClass(activeImage === i)}`}
                    >
                      <img src={img} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="aspect-[4/5] rounded-sm overflow-hidden bg-secondary">
                  <img
                    src={allImages[activeImage]}
                    alt={product.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            </div>

            {allImages.length > 1 && (
              <div className="flex gap-2 mt-4 overflow-x-auto lg:hidden pb-1">
                {allImages.map((img, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setActiveImage(i)}
                    className={`w-16 h-20 shrink-0 ${thumbnailButtonClass(activeImage === i)}`}
                  >
                    <img src={img} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </motion.div>

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

            <div className="flex items-center gap-3 mb-8">
              <span className="font-body text-xl font-medium text-foreground">
                R$ {product.price?.toFixed(2).replace('.', ',')}
              </span>
              {product.original_price && (
                <span className="font-body text-sm text-muted-foreground line-through">
                  R$ {product.original_price?.toFixed(2).replace('.', ',')}
                </span>
              )}
            </div>

            <ProductPaymentConditions price={product.price} />

            {variants.colors.length > 0 && (
              <div className="mb-6">
                <p className="font-body text-xs tracking-wider uppercase text-muted-foreground mb-3">
                  Cor{selectedColor?.name ? `: ${selectedColor.name}` : ''}
                </p>
                <div className="flex flex-wrap gap-3">
                  {variants.colors.map((color) => {
                    const isSelected = selectedColorId === color.id;
                    return (
                      <button
                        key={color.id}
                        type="button"
                        onClick={() => setSelectedColorId(color.id)}
                        title={color.name}
                        className={`w-11 h-11 rounded-full overflow-hidden border-2 transition-all ${
                          isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-foreground/40'
                        }`}
                      >
                        {color.image_url ? (
                          <img
                            src={resolveMediaUrl(color.image_url)}
                            alt={color.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span
                            className="block w-full h-full"
                            style={{ backgroundColor: color.hex || '#cccccc' }}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {variants.sizes.length > 0 && (
              <div className="mb-6">
                <p className="font-body text-xs tracking-wider uppercase text-muted-foreground mb-3">
                  Tamanho{selectedSize ? `: ${selectedSize}` : ''}
                </p>
                <div className="flex flex-wrap gap-2">
                  {variants.sizes.map((size) => {
                    const isSelected = selectedSize === size;
                    const sizeAvailability = resolveVariantAvailability(product, selectedColorId, size);
                    const sizeStock = getVariantStock(variants, selectedColorId, size);
                    const disabled = (variants.colors.length > 0 && !selectedColorId)
                      || sizeAvailability.quantity <= 0;

                    return (
                      <button
                        key={size}
                        type="button"
                        disabled={disabled}
                        onClick={() => setSelectedSize(size)}
                        className={`min-w-[52px] h-auto min-h-[40px] px-3 py-2 border rounded-sm font-body text-sm transition-colors flex flex-col items-center justify-center ${
                          isSelected
                            ? 'border-foreground bg-secondary text-foreground'
                            : 'border-border text-foreground hover:bg-secondary/60'
                        } ${disabled ? 'opacity-40 cursor-not-allowed line-through' : ''}`}
                      >
                        <span>{size}</span>
                        {hasSizeGrid && !disabled && (
                          <span className="text-[10px] text-muted-foreground mt-0.5">
                            {sizeStock} un.
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mb-8">
              {product.description && (
                <ProductAccordionSection title="Descrição">
                  <p className="font-body text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                    {product.description}
                  </p>
                </ProductAccordionSection>
              )}

              {product.product_specifications && (
                <ProductAccordionSection title="Especificações do produto">
                  <p className="font-body text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                    {product.product_specifications}
                  </p>
                </ProductAccordionSection>
              )}

              {product.technology && (
                <ProductAccordionSection title="Tecnologia">
                  <p className="font-body text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                    {product.technology}
                  </p>
                </ProductAccordionSection>
              )}

              {product.care_instructions && (
                <ProductAccordionSection title="Cuidados">
                  <p className="font-body text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                    {product.care_instructions}
                  </p>
                </ProductAccordionSection>
              )}
            </div>

            {available && (
              <div className="flex items-center gap-4 mb-6">
                <span className="font-body text-sm text-muted-foreground">Quantidade</span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="w-9 h-9 border border-border rounded-sm flex items-center justify-center hover:bg-secondary transition-colors"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="font-body text-sm w-8 text-center">{quantity}</span>
                  <button
                    type="button"
                    onClick={() => setQuantity(Math.min(maxQuantity, quantity + 1))}
                    disabled={quantity >= maxQuantity}
                    className="w-9 h-9 border border-border rounded-sm flex items-center justify-center hover:bg-secondary transition-colors disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <span className="font-body text-xs text-muted-foreground">
                  {hasSizeGrid && selectedSize
                    ? `${stockQuantity} em estoque no tamanho ${selectedSize}`
                    : `${stockQuantity} em estoque`}
                </span>
              </div>
            )}

            {hasVariants && availability.requiresSelection && (
              <p className="font-body text-sm text-muted-foreground mb-4">
                {availability.missing === 'color'
                  ? 'Selecione uma cor para continuar.'
                  : 'Selecione um tamanho para continuar.'}
              </p>
            )}

            <div className="mb-6">
              <ProductShippingCalculator productId={product.id} quantity={quantity} />
            </div>

            <Button
              onClick={handleAddToCart}
              disabled={addToCartMutation.isPending || !available || availability.requiresSelection}
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

            {!available && !availability.requiresSelection && (
              <p className="font-body text-sm text-destructive mt-3 text-center">Produto indisponível</p>
            )}
          </motion.div>
        </div>

        <RelatedKitsCarousel kits={relatedKits} />
      </div>
    </div>
  );
}
