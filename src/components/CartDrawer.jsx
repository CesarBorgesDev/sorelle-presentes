import React from 'react';
import { Link } from 'react-router-dom';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Minus, Plus, X, Package } from 'lucide-react';
import { api } from '@/api/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export default function CartDrawer({ open, onClose }) {
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();

  const { data: items = [] } = useQuery({
    queryKey: ['cart'],
    queryFn: () => api.entities.CartItem.list(),
    enabled: isAuthenticated && open,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.entities.CartItem.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cart'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.entities.CartItem.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cart'] }),
  });

  const subtotal = items.reduce((sum, item) => sum + item.price * (item.quantity || 1), 0);
  const total = subtotal;

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-lg bg-background flex flex-col">
        <SheetHeader className="border-b border-border pb-4">
          <SheetTitle className="font-display text-xl tracking-wider">Seu Carrinho</SheetTitle>
        </SheetHeader>

        {items.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Package className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
              <p className="font-body text-muted-foreground">Seu carrinho está vazio</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto py-4 space-y-6">
              {items.map((item) => (
                <div key={item.id} className="flex gap-4">
                  <div className="w-20 h-24 rounded-sm overflow-hidden bg-secondary flex-shrink-0">
                    {item.product_image && (
                      <img src={item.product_image} alt={item.product_name} className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                      <h4 className="font-display text-sm tracking-wide text-foreground truncate pr-2">
                        {item.product_name}
                      </h4>
                      <button onClick={() => deleteMutation.mutate(item.id)} className="text-muted-foreground hover:text-foreground">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="font-body text-sm text-foreground mt-1">
                      R$ {item.price?.toFixed(2).replace('.', ',')}
                    </p>
                    {/* Quantity */}
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={() => updateMutation.mutate({ id: item.id, data: { quantity: Math.max(1, (item.quantity || 1) - 1) } })}
                        className="w-7 h-7 border border-border rounded-sm flex items-center justify-center hover:bg-secondary"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="font-body text-sm w-6 text-center">{item.quantity || 1}</span>
                      <button
                        onClick={() => updateMutation.mutate({ id: item.id, data: { quantity: (item.quantity || 1) + 1 } })}
                        className="w-7 h-7 border border-border rounded-sm flex items-center justify-center hover:bg-secondary"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <SheetFooter className="border-t border-border pt-4 flex-col gap-3">
              <div className="w-full space-y-2">
                <div className="flex justify-between font-body text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>R$ {subtotal.toFixed(2).replace('.', ',')}</span>
                </div>
                <div className="flex justify-between font-display text-base pt-2 border-t border-border">
                  <span>Total</span>
                  <span>R$ {total.toFixed(2).replace('.', ',')}</span>
                </div>
              </div>
              <Button asChild className="w-full bg-foreground text-background hover:bg-foreground/90 font-body tracking-wider uppercase text-sm py-6">
                <Link to="/checkout" onClick={onClose}>Finalizar Compra</Link>
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}