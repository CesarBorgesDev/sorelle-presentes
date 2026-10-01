import { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { api } from '@/api/apiClient';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const STATUS_LABEL = {
  connected: 'Conectado',
  disconnected: 'Desconectado',
  error: 'Erro',
  published: 'Publicado',
  pending: 'Pendente',
  paused: 'Pausado',
};

function statusClass(status) {
  if (status === 'connected' || status === 'published') return 'bg-green-100 text-green-700';
  if (status === 'error') return 'bg-red-100 text-red-700';
  return 'bg-secondary text-muted-foreground';
}

function formatWhen(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function AdminOmnichannel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [forms, setForms] = useState({});
  const [search, setSearch] = useState('');
  const [selectedChannel, setSelectedChannel] = useState('mercado_livre');
  const [selected, setSelected] = useState({});
  const [categories, setCategories] = useState({});
  const [syncMinutes, setSyncMinutes] = useState(15);

  const applyOverview = (payload) => {
    setData(payload);
    setSyncMinutes(payload.sync_minutes || 15);
    setForms((prev) => {
      const next = { ...prev };
      for (const channel of payload.channels || []) {
        next[channel.id] = { ...(next[channel.id] || {}), ...channel.credentials };
      }
      return next;
    });
    setCategories((prev) => {
      const next = { ...prev };
      for (const listing of payload.listings || []) {
        const key = `${listing.product_id}:${listing.channel}`;
        if (next[key] == null) next[key] = listing.category_id || '';
      }
      return next;
    });
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      applyOverview(await api.omnichannel.overview());
    } catch (err) {
      setError(err.message || 'Não foi possível carregar o Omnichannel.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const channels = data?.channels || [];
  const channelLabel = (id) => channels.find((channel) => channel.id === id)?.label || id;

  const products = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data?.products || []).filter((product) => {
      if (!term) return true;
      return [product.name, product.sku, product.internal_code]
        .some((value) => String(value || '').toLowerCase().includes(term));
    });
  }, [data, search]);

  const setField = (channelId, key, value) => {
    setForms((prev) => ({
      ...prev,
      [channelId]: { ...(prev[channelId] || {}), [key]: value },
    }));
  };

  const connect = async (channel) => {
    setBusy(channel.id);
    setError('');
    setNotice('');
    try {
      const updated = await api.omnichannel.connect(channel.id, forms[channel.id] || {});
      setData((prev) => ({
        ...prev,
        channels: prev.channels.map((item) => (item.id === updated.id ? updated : item)),
      }));
      setForms((prev) => ({ ...prev, [channel.id]: updated.credentials || {} }));
      setNotice(`${updated.label} conectado.`);
    } catch (err) {
      setError(err.message);
      await load();
    } finally {
      setBusy('');
    }
  };

  const disconnect = async (channel) => {
    setBusy(channel.id);
    setError('');
    setNotice('');
    try {
      const updated = await api.omnichannel.disconnect(channel.id);
      setData((prev) => ({
        ...prev,
        channels: prev.channels.map((item) => (item.id === updated.id ? updated : item)),
      }));
      setForms((prev) => ({ ...prev, [channel.id]: updated.credentials || {} }));
      setNotice(`${updated.label} desconectado.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  const listingsFor = (productId, channel) => (
    (data?.listings || []).filter((listing) => listing.product_id === productId && listing.channel === channel)
  );

  const listingStatus = (productId, channel) => {
    const rows = listingsFor(productId, channel);
    if (!rows.length) return null;
    if (rows.some((row) => row.status === 'error')) return rows.find((row) => row.status === 'error');
    if (rows.every((row) => row.status === 'published')) return rows[0];
    return rows[0];
  };

  const publishSelected = async () => {
    const productIds = Object.keys(selected).filter((id) => selected[id]);
    if (!productIds.length) {
      setError('Selecione ao menos um produto.');
      return;
    }
    setBusy('publish');
    setError('');
    setNotice('');
    try {
      for (const productId of productIds) {
        const categoryId = categories[`${productId}:${selectedChannel}`] || '';
        await api.omnichannel.saveCategory(productId, selectedChannel, categoryId);
      }
      const result = await api.omnichannel.publish(productIds, [selectedChannel]);
      setData((prev) => ({ ...prev, listings: result.listings, logs: result.logs }));
      const failed = (result.results || []).filter((item) => !item.success);
      if (failed.length) {
        setError(failed.map((item) => item.message).filter(Boolean).slice(0, 3).join(' '));
      } else {
        setNotice('Publicação enviada aos canais conectados.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  const syncNow = async () => {
    setBusy('sync');
    setError('');
    setNotice('');
    try {
      const result = await api.omnichannel.sync();
      setData((prev) => ({
        ...prev,
        channels: result.channels || prev.channels,
        listings: result.listings || prev.listings,
        orders: result.orders || prev.orders,
        logs: result.logs || prev.logs,
      }));
      if (result.message && result.success === false) setError(result.message);
      else setNotice('Sincronização concluída.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  const saveInterval = async () => {
    setBusy('interval');
    setError('');
    setNotice('');
    try {
      const saved = await api.omnichannel.saveSettings(Number(syncMinutes));
      setSyncMinutes(saved.sync_minutes);
      setNotice(`Pedidos e estoque serão sincronizados a cada ${saved.sync_minutes} minutos.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  const toggleAll = (checked) => {
    const next = {};
    if (checked) {
      for (const product of products) next[product.id] = true;
    }
    setSelected(next);
  };

  if (loading && !data) {
    return <p className="font-body text-muted-foreground">Carregando Omnichannel…</p>;
  }

  return (
    <div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl tracking-wider text-foreground">Omnichannel</h1>
          <p className="font-body text-muted-foreground mt-1">
            Mercado Livre, Magazine Luiza, Shopee, Temu e TikTok Shop.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="font-body text-xs text-muted-foreground">
            Intervalo (min)
            <input
              type="number"
              min="5"
              max="240"
              value={syncMinutes}
              onChange={(event) => setSyncMinutes(event.target.value)}
              className="mt-1 block w-24 border border-border bg-card px-3 py-2 text-sm text-foreground"
            />
          </label>
          <button
            type="button"
            onClick={saveInterval}
            disabled={busy === 'interval'}
            className="border border-border px-4 py-2.5 font-body text-sm tracking-wider hover:bg-secondary"
          >
            Salvar intervalo
          </button>
          <button
            type="button"
            onClick={syncNow}
            disabled={busy === 'sync'}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 font-body text-sm tracking-wider hover:opacity-80 disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${busy === 'sync' ? 'animate-spin' : ''}`} />
            Sincronizar agora
          </button>
        </div>
      </div>

      {error && <p className="mb-4 font-body text-sm text-destructive">{error}</p>}
      {notice && <p className="mb-4 font-body text-sm text-green-700">{notice}</p>}

      <Tabs defaultValue="canais">
        <TabsList>
          <TabsTrigger value="canais">Canais</TabsTrigger>
          <TabsTrigger value="catalogo">Catálogo</TabsTrigger>
          <TabsTrigger value="pedidos">Pedidos e log</TabsTrigger>
        </TabsList>

        <TabsContent value="canais" className="mt-6 space-y-4">
          {channels.map((channel) => (
            <section key={channel.id} className="border border-border bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div>
                  <h2 className="font-display text-xl tracking-wide text-foreground">{channel.label}</h2>
                  {channel.shop_name && (
                    <p className="font-body text-xs text-muted-foreground mt-1">{channel.shop_name}</p>
                  )}
                </div>
                <span className={`px-2 py-1 text-xs font-body ${statusClass(channel.status)}`}>
                  {STATUS_LABEL[channel.status] || channel.status}
                </span>
              </div>
              <p className="font-body text-sm text-muted-foreground mb-4">{channel.hint}</p>
              {channel.last_error && (
                <p className="font-body text-sm text-destructive mb-4">{channel.last_error}</p>
              )}
              <div className="grid gap-3 md:grid-cols-2">
                {channel.fields.map((field) => (
                  <label key={field.key} className="font-body text-xs text-muted-foreground">
                    {field.label}{field.required ? ' *' : ''}
                    <input
                      type={field.secret ? 'password' : 'text'}
                      value={forms[channel.id]?.[field.key] ?? ''}
                      placeholder={field.placeholder || ''}
                      autoComplete="off"
                      onChange={(event) => setField(channel.id, field.key, event.target.value)}
                      className="mt-1 block w-full border border-border bg-background px-3 py-2 text-sm text-foreground"
                    />
                  </label>
                ))}
              </div>
              <div className="flex gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => connect(channel)}
                  disabled={busy === channel.id}
                  className="bg-primary text-primary-foreground px-4 py-2 font-body text-sm tracking-wider hover:opacity-80 disabled:opacity-60"
                >
                  {busy === channel.id ? 'Conectando…' : 'Conectar'}
                </button>
                <button
                  type="button"
                  onClick={() => disconnect(channel)}
                  disabled={busy === channel.id || channel.status === 'disconnected'}
                  className="border border-border px-4 py-2 font-body text-sm tracking-wider hover:bg-secondary disabled:opacity-50"
                >
                  Desconectar
                </button>
              </div>
            </section>
          ))}
        </TabsContent>

        <TabsContent value="catalogo" className="mt-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between mb-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <label className="font-body text-xs text-muted-foreground">
                Canal
                <select
                  value={selectedChannel}
                  onChange={(event) => setSelectedChannel(event.target.value)}
                  className="mt-1 block border border-border bg-card px-3 py-2 text-sm text-foreground"
                >
                  {channels.map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      {channel.label} ({STATUS_LABEL[channel.status] || channel.status})
                    </option>
                  ))}
                </select>
              </label>
              <label className="font-body text-xs text-muted-foreground">
                Buscar
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Nome ou SKU"
                  className="mt-1 block border border-border bg-card px-3 py-2 text-sm text-foreground"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={publishSelected}
              disabled={busy === 'publish'}
              className="bg-primary text-primary-foreground px-5 py-2.5 font-body text-sm tracking-wider hover:opacity-80 disabled:opacity-60"
            >
              {busy === 'publish' ? 'Publicando…' : 'Publicar selecionados'}
            </button>
          </div>
          <div className="overflow-auto border border-border">
            <table className="w-full text-left font-body text-sm">
              <thead className="bg-secondary text-muted-foreground">
                <tr>
                  <th className="px-3 py-3">
                    <input type="checkbox" onChange={(event) => toggleAll(event.target.checked)} />
                  </th>
                  <th className="px-3 py-3 font-medium">Produto</th>
                  <th className="px-3 py-3 font-medium">SKU</th>
                  <th className="px-3 py-3 font-medium">Estoque</th>
                  <th className="px-3 py-3 font-medium">Categoria do canal</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => {
                  const listing = listingStatus(product.id, selectedChannel);
                  const categoryKey = `${product.id}:${selectedChannel}`;
                  return (
                    <tr key={product.id} className="border-t border-border">
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={Boolean(selected[product.id])}
                          onChange={(event) => setSelected((prev) => ({
                            ...prev,
                            [product.id]: event.target.checked,
                          }))}
                        />
                      </td>
                      <td className="px-3 py-3 text-foreground">{product.name}</td>
                      <td className="px-3 py-3 text-muted-foreground">{product.sku || product.internal_code || '—'}</td>
                      <td className="px-3 py-3">{Number(product.quantity) || 0}</td>
                      <td className="px-3 py-3">
                        <input
                          value={categories[categoryKey] ?? listing?.category_id ?? ''}
                          onChange={(event) => setCategories((prev) => ({
                            ...prev,
                            [categoryKey]: event.target.value,
                          }))}
                          placeholder="ID da categoria"
                          className="w-full min-w-[140px] border border-border bg-background px-2 py-1.5 text-sm"
                        />
                      </td>
                      <td className="px-3 py-3">
                        {listing ? (
                          <span className={`px-2 py-1 text-xs ${statusClass(listing.status)}`}>
                            {STATUS_LABEL[listing.status] || listing.status}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Não publicado</span>
                        )}
                        {listing?.last_error && (
                          <p className="text-xs text-destructive mt-1 max-w-xs">{listing.last_error}</p>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!products.length && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-muted-foreground">Nenhum produto encontrado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="pedidos" className="mt-6 space-y-8">
          <div className="overflow-auto border border-border">
            <table className="w-full text-left font-body text-sm">
              <thead className="bg-secondary text-muted-foreground">
                <tr>
                  <th className="px-3 py-3 font-medium">Canal</th>
                  <th className="px-3 py-3 font-medium">Pedido externo</th>
                  <th className="px-3 py-3 font-medium">Cliente</th>
                  <th className="px-3 py-3 font-medium">Total</th>
                  <th className="px-3 py-3 font-medium">Importado em</th>
                </tr>
              </thead>
              <tbody>
                {(data?.orders || []).map((order) => (
                  <tr key={`${order.channel}-${order.external_order_id}`} className="border-t border-border">
                    <td className="px-3 py-3">{channelLabel(order.channel)}</td>
                    <td className="px-3 py-3">{order.external_order_id}</td>
                    <td className="px-3 py-3">{order.customer_name || '—'}</td>
                    <td className="px-3 py-3">{money(order.total)}</td>
                    <td className="px-3 py-3 text-muted-foreground">{formatWhen(order.imported_at)}</td>
                  </tr>
                ))}
                {!data?.orders?.length && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-muted-foreground">Nenhum pedido importado ainda.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div>
            <h2 className="font-display text-xl tracking-wide text-foreground mb-3">Log</h2>
            <div className="border border-border divide-y divide-border">
              {(data?.logs || []).map((entry) => (
                <div key={entry.id} className="px-4 py-3 font-body text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={entry.success ? 'text-green-700' : 'text-destructive'}>
                      {entry.success ? 'Ok' : 'Erro'}
                    </span>
                    <span className="text-muted-foreground">{channelLabel(entry.channel)}</span>
                    <span className="text-muted-foreground">{entry.action}</span>
                    <span className="text-muted-foreground">{formatWhen(entry.created_date)}</span>
                  </div>
                  <p className="mt-1 text-foreground">{entry.message}</p>
                </div>
              ))}
              {!data?.logs?.length && (
                <p className="px-4 py-6 text-muted-foreground font-body text-sm">Nenhuma sincronização registrada.</p>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
