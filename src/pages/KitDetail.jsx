import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { motion } from 'framer-motion';
import { ArrowLeft, Check, ShoppingBag, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency, getKitItemPrices } from '@/lib/kitPricing';
import { isProductAvailable } from '@/lib/productStock';
import { resolveMediaUrl } from '@/lib/resolveMediaUrl';

export default function KitDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [added, setAdded] = useState(false);
  const [addError, setAddError] = useState('');

  const { data: kit, isLoading, isError } = useQuery({
    queryKey: ['kit', id],
    queryFn: () => api.productKits.getById(id),
  });

  const allProducts = kit?.all_products || [];
  const unavailableProducts = allProducts.filter((product) => !isProductAvailable(product));
  const canPurchase = allProducts.length > 0 && unavailableProducts.length === 0;

  const pricedItems = useMemo(
    () => getKitItemPrices(allProducts, kit?.kit_price ?? kit?.price),
    [allProducts, kit?.kit_price, kit?.price]
  );

  const addKitMutation = useMutation({
    mutationFn: async () => {
      for (const { product, cartPrice } of pricedItems) {
        await api.entities.CartItem.create({
          product_id: product.id,
          product_name: product.name,
          product_image: product.image_url,
          price: cartPrice,
          quantity: 1,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] });
      setAddError('');
      setAdded(true);
      setTimeout(() => setAdded(false), 2500);
    },
    onError: (err) => {
      setAddError(err.message || 'Não foi possível adicionar o kit ao carrinho');
    },
  });

  const handleAddKit = () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    if (!canPurchase) return;
    setAddError('');
    addKitMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="pt-20 lg:pt-24 px-6 lg:px-16">
        <div className="max-w-5xl mx-auto py-12 space-y-6 animate-pulse">
          <div className="h-4 bg-secondary rounded w-32" />
          <div className="h-10 bg-secondary rounded w-64" />
          <div className="h-40 bg-secondary rounded-sm" />
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {Array(3).fill(0).map((_, index) => (
              <div key={index} className="h-48 bg-secondary rounded-sm" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (isError || !kit) {
    return (
      <div className="pt-20 lg:pt-24 text-center py-32 px-6">
        <p className="font-body text-muted-foreground mb-6">Kit não encontrado.</p>
        <Link to="/" className="font-body text-sm text-foreground underline underline-offset-4">
          Voltar para a loja
        </Link>
      </div>
    );
  }

  const hasDiscount = kit.discount_amount != null && kit.discount_amount > 0;

  return (
    <div className="pt-20 lg:pt-24">
      <div className="max-w-5xl mx-auto px-6 lg:px-16 py-8 lg:py-12">
        <Link
          to={kit.anchor_product ? `/produto/${kit.anchor_product.id}` : '/'}
          className="inline-flex items-center gap-2 font-body text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar ao produto
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <p className="text-xs tracking-[0.3em] uppercase text-muted-foreground font-body mb-3">
            Kit especial
          </p>
          <h1 className="font-display text-3xl lg:text-4xl tracking-wider text-foreground mb-8">
            {kit.name}
          </h1>

          <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-6 mb-10">
            <div className="bg-card border border-border rounded-sm p-6 lg:p-8">
              <h2 className="font-display text-lg tracking-wider text-foreground mb-5">
                Itens inclusos
              </h2>
              <div className="space-y-4">
                {allProducts.map((product) => (
                  <Link
                    key={product.id}
                    to={`/produto/${product.id}`}
                    className="flex items-center gap-4 p-3 rounded-sm border border-border hover:bg-secondary/40 transition-colors"
                  >
                    <div className="w-16 h-20 shrink-0 rounded-sm overflow-hidden bg-secondary">
                      {product.image_url ? (
                        <img
                          src={resolveMediaUrl(product.image_url)}
                          alt={product.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground font-body">
                          Sem foto
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-display text-sm tracking-wide text-foreground truncate">
                        {product.name}
                      </p>
                      <p className="font-body text-sm text-muted-foreground mt-1">
                        {formatCurrency(product.price)}
                      </p>
                      {!isProductAvailable(product) && (
                        <p className="font-body text-xs text-destructive mt-1">Indisponível</p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            <div className="bg-secondary/30 border border-border rounded-sm p-6 lg:p-8 lg:sticky lg:top-28 lg:self-start">
              <div className="flex items-start gap-3 mb-6">
                <Tag className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="font-body text-sm text-muted-foreground">
                    Comprando separado
                  </p>
                  <p className="font-body text-lg text-foreground line-through">
                    {formatCurrency(kit.reference_price)}
                  </p>
                </div>
              </div>

              {kit.kit_price != null && (
                <div className="mb-6">
                  <p className="font-body text-sm text-muted-foreground mb-1">
                    Preço do kit
                  </p>
                  <p className="font-display text-3xl tracking-wider text-foreground">
                    {formatCurrency(kit.kit_price)}
                  </p>
                </div>
              )}

              {hasDiscount && (
                <div className="rounded-sm bg-primary/10 border border-primary/20 px-4 py-4 mb-6">
                  <p className="font-body text-xs tracking-widest uppercase text-primary mb-1">
                    Você economiza
                  </p>
                  <p className="font-display text-2xl tracking-wider text-primary">
                    {formatCurrency(kit.discount_amount)}
                  </p>
                  {kit.discount_percent != null && (
                    <p className="font-body text-sm text-primary/80 mt-1">
                      {kit.discount_percent}% de desconto
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-2 mb-6 font-body text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Total avulso</span>
                  <span className="text-foreground">{formatCurrency(kit.products_total)}</span>
                </div>
                {kit.kit_price != null && (
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Total do kit</span>
                    <span className="text-foreground font-medium">{formatCurrency(kit.kit_price)}</span>
                  </div>
                )}
              </div>

              <Button
                onClick={handleAddKit}
                disabled={addKitMutation.isPending || !canPurchase}
                className="w-full bg-foreground text-background hover:bg-foreground/90 font-body tracking-wider uppercase text-sm py-6 rounded-sm"
              >
                {added ? (
                  <span className="flex items-center gap-2"><Check className="w-4 h-4" /> Kit adicionado</span>
                ) : (
                  <span className="flex items-center gap-2"><ShoppingBag className="w-4 h-4" /> Comprar kit completo</span>
                )}
              </Button>

              {!canPurchase && (
                <p className="font-body text-sm text-destructive mt-3 text-center">
                  {unavailableProducts.length > 0
                    ? 'Um ou mais itens do kit estão indisponíveis.'
                    : 'Este kit não possui itens para compra.'}
                </p>
              )}

              {addError && (
                <p className="font-body text-sm text-destructive mt-3 text-center">{addError}</p>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
