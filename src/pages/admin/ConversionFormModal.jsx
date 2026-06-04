import React, { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { X } from 'lucide-react';

export default function ConversionFormModal({ onClose }) {
  const queryClient = useQueryClient();
  const { data: affiliates = [] } = useQuery({
    queryKey: ['affiliates'],
    queryFn: () => base44.entities.Affiliate.list(),
  });

  const [form, setForm] = useState({
    affiliate_id: '',
    affiliate_name: '',
    affiliate_code: '',
    order_id: '',
    order_total: '',
    commission_rate: 0,
    commission_value: 0,
    status: 'pendente',
    notes: '',
  });

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleAffiliateChange = (id) => {
    const aff = affiliates.find(a => a.id === id);
    if (aff) {
      const commission_value = ((form.order_total || 0) * aff.commission_rate) / 100;
      setForm(f => ({
        ...f,
        affiliate_id: aff.id,
        affiliate_name: aff.name,
        affiliate_code: aff.code,
        commission_rate: aff.commission_rate,
        commission_value,
      }));
    }
  };

  const handleOrderTotalChange = (val) => {
    const total = parseFloat(val) || 0;
    const commission_value = (total * form.commission_rate) / 100;
    setForm(f => ({ ...f, order_total: total, commission_value }));
  };

  const mutation = useMutation({
    mutationFn: (data) => base44.entities.AffiliateConversion.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversions'] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-card border border-border rounded-sm w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <h2 className="font-display text-lg tracking-wide text-foreground">Registrar Conversão</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="font-body text-xs text-muted-foreground tracking-wider uppercase mb-1.5 block">Afiliado *</label>
            <select value={form.affiliate_id} onChange={e => handleAffiliateChange(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-border rounded-sm font-body text-sm focus:outline-none focus:ring-1 focus:ring-ring">
              <option value="">Selecione o afiliado</option>
              {affiliates.map(a => <option key={a.id} value={a.id}>{a.name} ({a.code})</option>)}
            </select>
          </div>
          <div>
            <label className="font-body text-xs text-muted-foreground tracking-wider uppercase mb-1.5 block">ID do Pedido</label>
            <input value={form.order_id} onChange={e => set('order_id', e.target.value)}
              className="w-full px-3 py-2 bg-background border border-border rounded-sm font-body text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="font-body text-xs text-muted-foreground tracking-wider uppercase mb-1.5 block">Valor do Pedido (R$)</label>
              <input type="number" min="0" step="0.01" value={form.order_total} onChange={e => handleOrderTotalChange(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-sm font-body text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div>
              <label className="font-body text-xs text-muted-foreground tracking-wider uppercase mb-1.5 block">Comissão Gerada (R$)</label>
              <input type="number" value={form.commission_value.toFixed(2)} readOnly
                className="w-full px-3 py-2 bg-secondary border border-border rounded-sm font-body text-sm text-muted-foreground" />
            </div>
          </div>
          <div>
            <label className="font-body text-xs text-muted-foreground tracking-wider uppercase mb-1.5 block">Status</label>
            <select value={form.status} onChange={e => set('status', e.target.value)}
              className="w-full px-3 py-2 bg-background border border-border rounded-sm font-body text-sm focus:outline-none focus:ring-1 focus:ring-ring">
              {['pendente', 'aprovado', 'pago', 'cancelado'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="font-body text-xs text-muted-foreground tracking-wider uppercase mb-1.5 block">Observações</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2}
              className="w-full px-3 py-2 bg-background border border-border rounded-sm font-body text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 font-body text-sm text-muted-foreground hover:text-foreground border border-border rounded-sm">
            Cancelar
          </button>
          <button
            onClick={() => mutation.mutate(form)}
            disabled={!form.affiliate_id || !form.order_total || mutation.isPending}
            className="px-5 py-2 bg-primary text-primary-foreground font-body text-sm rounded-sm hover:opacity-80 disabled:opacity-50 transition-opacity"
          >
            {mutation.isPending ? 'Salvando...' : 'Registrar'}
          </button>
        </div>
      </div>
    </div>
  );
}