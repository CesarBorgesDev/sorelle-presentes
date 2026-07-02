import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/apiClient';
import { X } from 'lucide-react';

const CATEGORIES = ['ativo', 'inativo', 'pendente'];

export default function AffiliateFormModal({ affiliate, onClose }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: affiliate?.name || '',
    email: affiliate?.email || '',
    phone: affiliate?.phone || '',
    code: affiliate?.code || '',
    commission_rate: affiliate?.commission_rate ?? 10,
    status: affiliate?.status || 'pendente',
    payment_info: affiliate?.payment_info || '',
    notes: affiliate?.notes || '',
  });

  const mutation = useMutation({
    mutationFn: (data) =>
      affiliate
        ? api.entities.Affiliate.update(affiliate.id, data)
        : api.entities.Affiliate.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['affiliates'] });
      onClose();
    },
  });

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-card border border-border rounded-sm w-full max-w-lg shadow-xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <h2 className="font-display text-lg tracking-wide text-foreground">
            {affiliate ? 'Editar Afiliado' : 'Novo Afiliado'}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="font-body text-xs text-muted-foreground tracking-wider uppercase mb-1.5 block">Nome *</label>
              <input value={form.name} onChange={e => set('name', e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-sm font-body text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div>
              <label className="font-body text-xs text-muted-foreground tracking-wider uppercase mb-1.5 block">E-mail *</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-sm font-body text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div>
              <label className="font-body text-xs text-muted-foreground tracking-wider uppercase mb-1.5 block">Telefone</label>
              <input value={form.phone} onChange={e => set('phone', e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-sm font-body text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div>
              <label className="font-body text-xs text-muted-foreground tracking-wider uppercase mb-1.5 block">Código de Afiliado *</label>
              <input value={form.code} onChange={e => set('code', e.target.value.toUpperCase().replace(/\s/g, ''))}
                className="w-full px-3 py-2 bg-background border border-border rounded-sm font-body text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div>
              <label className="font-body text-xs text-muted-foreground tracking-wider uppercase mb-1.5 block">Comissão (%)</label>
              <input type="number" min="0" max="100" step="0.5" value={form.commission_rate} onChange={e => set('commission_rate', parseFloat(e.target.value))}
                className="w-full px-3 py-2 bg-background border border-border rounded-sm font-body text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div className="col-span-2">
              <label className="font-body text-xs text-muted-foreground tracking-wider uppercase mb-1.5 block">Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-sm font-body text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                {CATEGORIES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="font-body text-xs text-muted-foreground tracking-wider uppercase mb-1.5 block">Dados para Pagamento (PIX / Banco)</label>
              <input value={form.payment_info} onChange={e => set('payment_info', e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-sm font-body text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div className="col-span-2">
              <label className="font-body text-xs text-muted-foreground tracking-wider uppercase mb-1.5 block">Observações</label>
              <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3}
                className="w-full px-3 py-2 bg-background border border-border rounded-sm font-body text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 font-body text-sm text-muted-foreground hover:text-foreground border border-border rounded-sm">
            Cancelar
          </button>
          <button
            onClick={() => mutation.mutate(form)}
            disabled={!form.name || !form.email || !form.code || mutation.isPending}
            className="px-5 py-2 bg-primary text-primary-foreground font-body text-sm rounded-sm hover:opacity-80 disabled:opacity-50 transition-opacity"
          >
            {mutation.isPending ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}