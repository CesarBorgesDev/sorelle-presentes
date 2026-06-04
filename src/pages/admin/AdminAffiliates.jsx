import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Plus, Pencil, Trash2, Users, TrendingUp, DollarSign, Search } from 'lucide-react';
import AffiliateFormModal from './AffiliateFormModal';
import ConversionFormModal from './ConversionFormModal';

const statusColors = {
  ativo: 'bg-green-100 text-green-700',
  inativo: 'bg-red-100 text-red-700',
  pendente: 'bg-yellow-100 text-yellow-700',
};

const conversionColors = {
  pendente: 'bg-yellow-100 text-yellow-700',
  aprovado: 'bg-blue-100 text-blue-700',
  pago: 'bg-green-100 text-green-700',
  cancelado: 'bg-red-100 text-red-700',
};

export default function AdminAffiliates() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('afiliados');
  const [search, setSearch] = useState('');
  const [affiliateModal, setAffiliateModal] = useState(false);
  const [editingAffiliate, setEditingAffiliate] = useState(null);
  const [conversionModal, setConversionModal] = useState(false);

  const { data: affiliates = [], isLoading: loadingAff } = useQuery({
    queryKey: ['affiliates'],
    queryFn: () => base44.entities.Affiliate.list('-created_date'),
  });

  const { data: conversions = [], isLoading: loadingConv } = useQuery({
    queryKey: ['conversions'],
    queryFn: () => base44.entities.AffiliateConversion.list('-created_date', 100),
  });

  const deleteAffiliateMutation = useMutation({
    mutationFn: (id) => base44.entities.Affiliate.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['affiliates'] }),
  });

  const updateConversionMutation = useMutation({
    mutationFn: ({ id, status }) => base44.entities.AffiliateConversion.update(id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['conversions'] }),
  });

  const totalCommissionPending = conversions
    .filter(c => c.status === 'aprovado')
    .reduce((s, c) => s + (c.commission_value || 0), 0);

  const totalCommissionPaid = conversions
    .filter(c => c.status === 'pago')
    .reduce((s, c) => s + (c.commission_value || 0), 0);

  const filteredAffiliates = affiliates.filter(a =>
    a.name?.toLowerCase().includes(search.toLowerCase()) ||
    a.code?.toLowerCase().includes(search.toLowerCase()) ||
    a.email?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredConversions = conversions.filter(c =>
    c.affiliate_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.affiliate_code?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl tracking-wider text-foreground">Afiliados</h1>
          <p className="font-body text-muted-foreground mt-1">Gestão do programa de marketing de afiliados</p>
        </div>
        <div className="flex gap-2">
          {tab === 'afiliados' && (
            <button
              onClick={() => { setEditingAffiliate(null); setAffiliateModal(true); }}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-sm font-body text-sm tracking-wider hover:opacity-80 transition-opacity"
            >
              <Plus className="w-4 h-4" /> Novo Afiliado
            </button>
          )}
          {tab === 'conversoes' && (
            <button
              onClick={() => setConversionModal(true)}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-sm font-body text-sm tracking-wider hover:opacity-80 transition-opacity"
            >
              <Plus className="w-4 h-4" /> Registrar Conversão
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-card border border-border rounded-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="font-body text-xs text-muted-foreground tracking-wider uppercase">Afiliados Ativos</p>
            <Users className="w-4 h-4 text-primary" />
          </div>
          <p className="font-display text-2xl text-foreground">{affiliates.filter(a => a.status === 'ativo').length}</p>
        </div>
        <div className="bg-card border border-border rounded-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="font-body text-xs text-muted-foreground tracking-wider uppercase">Total Afiliados</p>
            <Users className="w-4 h-4 text-blue-600" />
          </div>
          <p className="font-display text-2xl text-foreground">{affiliates.length}</p>
        </div>
        <div className="bg-card border border-border rounded-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="font-body text-xs text-muted-foreground tracking-wider uppercase">Comissões a Pagar</p>
            <TrendingUp className="w-4 h-4 text-yellow-600" />
          </div>
          <p className="font-display text-2xl text-foreground">R$ {totalCommissionPending.toFixed(2).replace('.', ',')}</p>
        </div>
        <div className="bg-card border border-border rounded-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="font-body text-xs text-muted-foreground tracking-wider uppercase">Total Pago</p>
            <DollarSign className="w-4 h-4 text-green-600" />
          </div>
          <p className="font-display text-2xl text-foreground">R$ {totalCommissionPaid.toFixed(2).replace('.', ',')}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {['afiliados', 'conversoes'].map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); setSearch(''); }}
            className={`px-5 py-2.5 font-body text-sm tracking-wider capitalize transition-colors border-b-2 -mb-px
              ${tab === t ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            {t === 'afiliados' ? 'Afiliados' : 'Conversões'}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Buscar..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-sm font-body text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Affiliates Table */}
      {tab === 'afiliados' && (
        <div className="bg-card border border-border rounded-sm overflow-hidden">
          {loadingAff ? (
            <div className="p-12 text-center"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" /></div>
          ) : (
            <table className="w-full">
              <thead className="bg-secondary/50 border-b border-border">
                <tr>
                  <th className="text-left px-6 py-3 font-body text-xs text-muted-foreground tracking-widest uppercase">Afiliado</th>
                  <th className="text-left px-6 py-3 font-body text-xs text-muted-foreground tracking-widest uppercase hidden md:table-cell">Código</th>
                  <th className="text-left px-6 py-3 font-body text-xs text-muted-foreground tracking-widest uppercase hidden lg:table-cell">Comissão</th>
                  <th className="text-left px-6 py-3 font-body text-xs text-muted-foreground tracking-widest uppercase">Status</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredAffiliates.map(aff => (
                  <tr key={aff.id} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-body text-sm text-foreground font-medium">{aff.name}</p>
                      <p className="font-body text-xs text-muted-foreground">{aff.email}</p>
                    </td>
                    <td className="px-6 py-4 hidden md:table-cell">
                      <span className="font-mono text-sm text-foreground bg-secondary px-2.5 py-1 rounded-sm">{aff.code}</span>
                    </td>
                    <td className="px-6 py-4 hidden lg:table-cell">
                      <p className="font-body text-sm text-foreground">{aff.commission_rate}%</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-body ${statusColors[aff.status] || 'bg-secondary text-foreground'}`}>
                        {aff.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 justify-end">
                        <button onClick={() => { setEditingAffiliate(aff); setAffiliateModal(true); }}
                          className="p-1.5 text-muted-foreground hover:text-foreground transition-colors">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => { if (confirm('Excluir afiliado?')) deleteAffiliateMutation.mutate(aff.id); }}
                          className="p-1.5 text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredAffiliates.length === 0 && (
                  <tr><td colSpan={5} className="px-6 py-12 text-center font-body text-muted-foreground">Nenhum afiliado encontrado.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Conversions Table */}
      {tab === 'conversoes' && (
        <div className="bg-card border border-border rounded-sm overflow-hidden">
          {loadingConv ? (
            <div className="p-12 text-center"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" /></div>
          ) : (
            <table className="w-full">
              <thead className="bg-secondary/50 border-b border-border">
                <tr>
                  <th className="text-left px-6 py-3 font-body text-xs text-muted-foreground tracking-widest uppercase">Afiliado</th>
                  <th className="text-left px-6 py-3 font-body text-xs text-muted-foreground tracking-widest uppercase hidden md:table-cell">Pedido</th>
                  <th className="text-left px-6 py-3 font-body text-xs text-muted-foreground tracking-widest uppercase">Comissão</th>
                  <th className="text-left px-6 py-3 font-body text-xs text-muted-foreground tracking-widest uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredConversions.map(conv => (
                  <tr key={conv.id} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-body text-sm text-foreground font-medium">{conv.affiliate_name}</p>
                      <span className="font-mono text-xs text-muted-foreground">{conv.affiliate_code}</span>
                    </td>
                    <td className="px-6 py-4 hidden md:table-cell">
                      <p className="font-body text-sm text-foreground">R$ {conv.order_total?.toFixed(2).replace('.', ',')}</p>
                      {conv.order_id && <p className="font-body text-xs text-muted-foreground">{conv.order_id}</p>}
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-body text-sm text-foreground font-medium">R$ {conv.commission_value?.toFixed(2).replace('.', ',')}</p>
                      <p className="font-body text-xs text-muted-foreground">{conv.commission_rate}%</p>
                    </td>
                    <td className="px-6 py-4" onClick={e => e.stopPropagation()}>
                      <select
                        value={conv.status}
                        onChange={e => updateConversionMutation.mutate({ id: conv.id, status: e.target.value })}
                        className={`text-xs px-2.5 py-1 rounded-full font-body border-0 focus:outline-none cursor-pointer ${conversionColors[conv.status] || 'bg-secondary text-foreground'}`}
                      >
                        {['pendente', 'aprovado', 'pago', 'cancelado'].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
                {filteredConversions.length === 0 && (
                  <tr><td colSpan={4} className="px-6 py-12 text-center font-body text-muted-foreground">Nenhuma conversão registrada.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {affiliateModal && (
        <AffiliateFormModal affiliate={editingAffiliate} onClose={() => { setAffiliateModal(false); setEditingAffiliate(null); }} />
      )}
      {conversionModal && (
        <ConversionFormModal onClose={() => setConversionModal(false)} />
      )}
    </div>
  );
}