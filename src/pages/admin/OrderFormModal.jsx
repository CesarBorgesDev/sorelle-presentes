import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { X, Plus, Trash2 } from 'lucide-react';

export default function OrderFormModal({ onClose }) {
  const queryClient = useQueryClient();
  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: () => base44.entities.Product.list() });

  const [form, setForm] = useState({
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    customer_address: '',
    payment_method: 'pix',
    notes: '',
    status: 'pendente',
    items: [],
  });

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const addItem = () => {
    setForm(f => ({
      ...f,
      items: [...f.items, { product_id: '', product_name: '', quantity: 1, unit_price: 0, total: 0 }],
    }));
  };

  const updateItem = (index, field, value) => {
    setForm(f => {
      const items = [...f.items];
      items[index] = { ...items[index], [field]: value };
      if (field === 'product_id') {
        const prod = products.find(p => p.id === value);
        if (prod) {
          items[index].product_name = prod.name;
          items[index].unit_price = prod.price;
          items[index].total = prod.price * items[index].quantity;
        }
      }
      if (field === 'quantity') {
        items[index].total = items[index].unit_price * parseFloat(value || 0);
      }
      return { ...f, items };
    });
  };

  const removeItem = (index) => {
    setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== index) }));
  };

  const subtotal = form.items.reduce((s, i) => s + (i.total || 0), 0);

  const mutation = useMutation({
    mutationFn: (data) => base44.entities.Order.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      onClose();
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    mutation.mutate({ ...form, subtotal, total: subtotal });
  };

  const inputClass = "w-full px-3 py-2.5 bg-background border border-border rounded-sm font-body text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";
  const labelClass = "block font-body text-xs text-muted-foreground tracking-wider uppercase mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-sm w-full max-w-2xl max-h-[90vh] overflow-auto shadow-xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-border sticky top-0 bg-card">
          <h2 className="font-display text-xl tracking-wide text-foreground">Novo Pedido</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-6 space-y-6">
          {/* Customer */}
          <div>
            <p className="font-display text-sm tracking-wider text-foreground mb-4">Dados do Cliente</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Nome *</label>
                <input required className={inputClass} value={form.customer_name} onChange={e => set('customer_name', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>E-mail *</label>
                <input required type="email" className={inputClass} value={form.customer_email} onChange={e => set('customer_email', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Telefone</label>
                <input className={inputClass} value={form.customer_phone} onChange={e => set('customer_phone', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Forma de Pagamento</label>
                <select className={inputClass} value={form.payment_method} onChange={e => set('payment_method', e.target.value)}>
                  <option value="pix">PIX</option>
                  <option value="cartao_credito">Cartão de Crédito</option>
                  <option value="boleto">Boleto</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>Endereço de Entrega</label>
                <input className={inputClass} value={form.customer_address} onChange={e => set('customer_address', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="font-display text-sm tracking-wider text-foreground">Itens do Pedido</p>
              <button type="button" onClick={addItem} className="flex items-center gap-1.5 text-xs text-primary hover:opacity-70 font-body tracking-wider">
                <Plus className="w-3.5 h-3.5" /> Adicionar Item
              </button>
            </div>
            <div className="space-y-3">
              {form.items.map((item, index) => (
                <div key={index} className="flex items-center gap-3 p-3 bg-secondary/30 rounded-sm">
                  <select
                    className="flex-1 px-3 py-2 bg-background border border-border rounded-sm font-body text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    value={item.product_id}
                    onChange={e => updateItem(index, 'product_id', e.target.value)}
                  >
                    <option value="">Selecionar produto</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <input
                    type="number" min="1"
                    className="w-16 px-3 py-2 bg-background border border-border rounded-sm font-body text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    value={item.quantity}
                    onChange={e => updateItem(index, 'quantity', e.target.value)}
                  />
                  <span className="font-body text-sm text-muted-foreground whitespace-nowrap">
                    R$ {item.total?.toFixed(2).replace('.', ',')}
                  </span>
                  <button type="button" onClick={() => removeItem(index)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {form.items.length === 0 && (
                <p className="text-center py-6 font-body text-sm text-muted-foreground">Adicione produtos ao pedido</p>
              )}
            </div>

            {form.items.length > 0 && (
              <div className="flex justify-end mt-4 pt-4 border-t border-border">
                <p className="font-body text-sm text-foreground">
                  Total: <span className="font-medium">R$ {subtotal.toFixed(2).replace('.', ',')}</span>
                </p>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className={labelClass}>Observações</label>
            <textarea rows={2} className={inputClass} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Observações adicionais sobre o pedido..." />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <button type="button" onClick={onClose} className="px-5 py-2.5 font-body text-sm text-muted-foreground hover:text-foreground tracking-wider transition-colors">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="px-6 py-2.5 bg-primary text-primary-foreground rounded-sm font-body text-sm tracking-wider hover:opacity-80 transition-opacity disabled:opacity-50"
            >
              {mutation.isPending ? 'Salvando...' : 'Criar Pedido'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}