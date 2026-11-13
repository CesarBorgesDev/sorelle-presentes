import { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { api } from '@/api/apiClient';
import { resolveMediaUrl } from '@/lib/resolveMediaUrl';
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

function platformCatalogState(listings, productId, channelId) {
  const rows = (listings || []).filter(
    (listing) => listing.product_id === productId && listing.channel === channelId,
  );
  if (!rows.length) return 'nao_enviado';
  if (rows.some((row) => row.status === 'error')) return 'erro';
  if (rows.every((row) => row.status === 'published')) return 'enviado';
  return 'nao_enviado';
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

function mercadoLivreItemUrl(externalId) {
  const match = String(externalId || '').trim().toUpperCase().match(/^MLB(\d+)$/);
  if (!match) return '';
  return `https://produto.mercadolivre.com.br/MLB-${match[1]}`;
}

function marketplacePrice(price, percent) {
  const cents = Math.round((Number(price) || 0) * 100);
  const pct = Number(percent);
  const safe = Number.isFinite(pct) && pct > 0 ? pct : 0;
  return Math.round(cents * (1 + safe / 100)) / 100;
}

export default function AdminOmnichannel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [forms, setForms] = useState({});
  const [search, setSearch] = useState('');
  const [platformFilters, setPlatformFilters] = useState({});
  const [selectedChannel, setSelectedChannel] = useState('mercado_livre');
  const [selected, setSelected] = useState({});
  const [categories, setCategories] = useState({});
  const [prices, setPrices] = useState({});
  const [attributes, setAttributes] = useState({});
  const [categoryHints, setCategoryHints] = useState({});
  const [attributeFields, setAttributeFields] = useState({});
  const [syncMinutes, setSyncMinutes] = useState(15);
  const [markupPercent, setMarkupPercent] = useState(0);

  const applyOverview = (payload) => {
    setData(payload);
    setSyncMinutes(payload.sync_minutes || 15);
    setMarkupPercent(payload.price_markup_percent ?? 0);
    setForms((prev) => {
      const next = { ...prev };
      for (const channel of payload.channels || []) {
        const creds = { ...(next[channel.id] || {}), ...channel.credentials };
        if (channel.id === 'mercado_livre') {
          if (!creds.redirect_uri) creds.redirect_uri = channel.oauth_redirect_uri || '';
          if (!creds.listing_type_id) creds.listing_type_id = 'gold_special';
          if (!creds.shipping_mode) creds.shipping_mode = 'me2';
        }
        next[channel.id] = creds;
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
    setPrices((prev) => {
      const next = { ...prev };
      for (const listing of payload.listings || []) {
        const key = `${listing.product_id}:${listing.channel}`;
        if (next[key] == null && listing.price_override != null) {
          next[key] = Number(listing.price_override).toLocaleString('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
        }
      }
      return next;
    });
    setAttributes((prev) => {
      const next = { ...prev };
      for (const listing of payload.listings || []) {
        const key = `${listing.product_id}:${listing.channel}`;
        if (next[key] == null && listing.attributes && Object.keys(listing.attributes).length) {
          next[key] = listing.attributes;
        }
      }
      return next;
    });
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      applyOverview(await api.omnichannel.overview());
      const params = new URLSearchParams(window.location.search);
      if (params.get('ml') === 'ok') setNotice('Mercado Livre conectado.');
      if (params.get('ml') === 'erro') setError(params.get('motivo') || 'Não foi possível autorizar o Mercado Livre.');
      if (params.get('ml')) window.history.replaceState({}, '', window.location.pathname);
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

  const showAllChannels = selectedChannel === 'all';
  const visibleChannels = showAllChannels
    ? channels
    : channels.filter((channel) => channel.id === selectedChannel);

  const products = useMemo(() => {
    const term = search.trim().toLowerCase();
    const visibleIds = selectedChannel === 'all' ? null : new Set([selectedChannel]);
    const activeFilters = Object.entries(platformFilters).filter(([channelId, value]) => (
      value && (!visibleIds || visibleIds.has(channelId))
    ));
    return (data?.products || []).filter((product) => {
      if (term) {
        const matchesTerm = [product.name, product.sku, product.internal_code]
          .some((value) => String(value || '').toLowerCase().includes(term));
        if (!matchesTerm) return false;
      }
      return activeFilters.every(([channelId, value]) => (
        platformCatalogState(data?.listings, product.id, channelId) === value
      ));
    });
  }, [data, search, platformFilters, selectedChannel]);

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

  const saveListingPrice = async (productId, rawValue) => {
    const key = `${productId}:${selectedChannel}`;
    const priceOverride = String(rawValue ?? prices[key] ?? '').trim();
    const categoryId = categories[key] || '';
    if (!priceOverride && !categoryId && !listingStatus(productId, selectedChannel)) return;
    try {
      const result = await api.omnichannel.saveCategory(
        productId,
        selectedChannel,
        categoryId,
        priceOverride || null,
      );
      setData((prev) => ({ ...prev, listings: result.listings }));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  const authorizeMercadoLivre = async (channel) => {
    setBusy(channel.id);
    setError('');
    setNotice('');
    try {
      const result = await api.omnichannel.authorizeMercadoLivre(forms[channel.id] || {});
      window.location.href = result.url;
    } catch (err) {
      setError(err.message);
      setBusy('');
    }
  };

  const suggestCategory = async (product) => {
    setBusy(`cat-${product.id}`);
    setError('');
    try {
      const rows = await api.omnichannel.mercadoLivreCategories(product.name);
      setCategoryHints((prev) => ({ ...prev, [product.id]: rows }));
      if (!rows.length) setError('Nenhuma categoria encontrada para este produto.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  const chooseCategory = async (product, category) => {
    const key = `${product.id}:${selectedChannel}`;
    setCategories((prev) => ({ ...prev, [key]: category.category_id }));
    setCategoryHints((prev) => ({ ...prev, [product.id]: [] }));
    try {
      const result = await api.omnichannel.saveCategory(
        product.id,
        selectedChannel,
        category.category_id,
        String(prices[key] ?? '').trim() || null,
        attributes[key],
      );
      setData((prev) => ({ ...prev, listings: result.listings }));
      const fields = await api.omnichannel.mercadoLivreAttributes(category.category_id);
      setAttributeFields((prev) => ({ ...prev, [product.id]: fields }));
    } catch (err) {
      setError(err.message);
    }
  };

  const loadAttributeFields = async (product) => {
    const categoryId = categories[`${product.id}:${selectedChannel}`] || '';
    if (!/^MLB\d+$/i.test(categoryId)) {
      setError('Informe a categoria MLB antes de carregar os atributos.');
      return;
    }
    setBusy(`attr-${product.id}`);
    try {
      const fields = await api.omnichannel.mercadoLivreAttributes(categoryId);
      setAttributeFields((prev) => ({ ...prev, [product.id]: fields }));
      if (!fields.length) setNotice('Essa categoria não tem atributos obrigatórios além do SKU.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  const saveAttributes = async (productId, nextAttributes) => {
    const key = `${productId}:${selectedChannel}`;
    const attrs = nextAttributes || attributes[key] || {};
    try {
      const result = await api.omnichannel.saveCategory(
        productId,
        selectedChannel,
        categories[key] || '',
        String(prices[key] ?? '').trim() || null,
        attrs,
      );
      setData((prev) => ({ ...prev, listings: result.listings }));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  const productHasStock = (productId) => {
    const product = (data?.products || []).find((item) => item.id === productId);
    return (Number(product?.quantity) || 0) > 0;
  };

  const applyCatalogResult = (result, { successNotice, stockSkipped = 0 }) => {
    setData((prev) => ({ ...prev, listings: result.listings, logs: result.logs }));
    const failed = (result.results || []).filter((item) => !item.success && !item.skipped);
    const skippedMsgs = [...new Set(
      (result.results || []).filter((item) => item.skipped).map((item) => item.message).filter(Boolean),
    )];
    const notes = [];
    if (stockSkipped) notes.push(`${stockSkipped} produto(s) sem estoque não foram enviados.`);
    notes.push(...skippedMsgs);
    if (failed.length) {
      setError(failed.map((item) => item.message).filter(Boolean).slice(0, 3).join(' '));
      if (notes.length) setNotice(notes.join(' '));
      return;
    }
    setNotice([successNotice, ...notes].filter(Boolean).join(' '));
  };

  const sendProducts = async (productIds) => {
    const unique = [...new Set(productIds)];
    if (!unique.length) {
      setError('Selecione ao menos um produto.');
      return;
    }
    const targets = selectedChannel === 'all'
      ? channels.filter((item) => item.status === 'connected')
      : channels.filter((item) => item.id === selectedChannel && item.status === 'connected');
    if (!targets.length) {
      setError(selectedChannel === 'all'
        ? 'Nenhum canal conectado. Conecte uma plataforma antes de enviar.'
        : 'Conecte o canal selecionado antes de enviar.');
      return;
    }
    const withStock = unique.filter((id) => productHasStock(id));
    const stockSkipped = unique.length - withStock.length;
    if (!withStock.length) {
      setError('Produtos sem estoque não são enviados.');
      setNotice('');
      return;
    }
    setBusy(unique.length === 1 ? `send-${unique[0]}` : 'send');
    setError('');
    setNotice('');
    try {
      for (const productId of withStock) {
        for (const target of targets) {
          const key = `${productId}:${target.id}`;
          const categoryId = categories[key] || '';
          const priceOverride = String(prices[key] ?? '').trim();
          const attrs = attributes[key];
          if (selectedChannel === 'all' && !categoryId && !priceOverride && !attrs) continue;
          await api.omnichannel.saveCategory(
            productId,
            target.id,
            categoryId,
            priceOverride || null,
            attrs,
          );
        }
      }
      const result = await api.omnichannel.publish(withStock, targets.map((target) => target.id));
      const labels = targets.map((target) => target.label).join(', ');
      applyCatalogResult(result, {
        successNotice: `Envio concluído em ${labels}.`,
        stockSkipped,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  const updateProducts = async (productIds) => {
    const unique = [...new Set(productIds)];
    if (!unique.length) {
      setError('Selecione ao menos um produto.');
      return;
    }
    setBusy(unique.length === 1 ? `update-${unique[0]}` : 'update');
    setError('');
    setNotice('');
    try {
      const result = await api.omnichannel.updateListings(unique);
      applyCatalogResult(result, { successNotice: 'Anúncios atualizados.' });
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
      const saved = await api.omnichannel.saveSettings({
        syncMinutes: Number(syncMinutes),
        priceMarkupPercent: Number(markupPercent),
      });
      setSyncMinutes(saved.sync_minutes);
      setMarkupPercent(saved.price_markup_percent ?? 0);
      setNotice(
        saved.price_markup_percent > 0
          ? `Acréscimo de ${saved.price_markup_percent}% aplicado nos marketplaces. O preço do site não muda. Sincronização a cada ${saved.sync_minutes} minutos.`
          : `Marketplaces usam o mesmo preço do site. Sincronização a cada ${saved.sync_minutes} minutos.`
      );
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
            Mercado Livre, Magazine Luiza, Shopee, Temu e TikTok Shop. O site permanece mais barato: o acréscimo vale só para os marketplaces.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="font-body text-xs text-muted-foreground">
            Acréscimo nos marketplaces (%)
            <input
              type="number"
              min="0"
              max="500"
              step="0.01"
              value={markupPercent}
              onChange={(event) => setMarkupPercent(event.target.value)}
              className="mt-1 block w-28 border border-border bg-card px-3 py-2 text-sm text-foreground"
            />
          </label>
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
            Salvar
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
              {channel.id === 'mercado_livre' && (
                <div className="mb-4 space-y-1 font-body text-xs text-muted-foreground">
                  <p>Redirect URI para cadastrar no aplicativo: <span className="text-foreground">{channel.oauth_redirect_uri}</span></p>
                  <p>URL de notificações de pedidos: <span className="text-foreground">{channel.notifications_url}</span></p>
                </div>
              )}
              {channel.last_error && (
                <p className="font-body text-sm text-destructive mb-4">{channel.last_error}</p>
              )}
              <div className="grid gap-3 md:grid-cols-2">
                {channel.fields.map((field) => (
                  <label key={field.key} className="font-body text-xs text-muted-foreground">
                    {field.label}{field.required ? ' *' : ''}
                    {field.options ? (
                      <select
                        value={forms[channel.id]?.[field.key] ?? field.options[0]?.value ?? ''}
                        onChange={(event) => setField(channel.id, field.key, event.target.value)}
                        className="mt-1 block w-full border border-border bg-background px-3 py-2 text-sm text-foreground"
                      >
                        {field.options.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={field.secret ? 'password' : 'text'}
                        value={forms[channel.id]?.[field.key] ?? ''}
                        placeholder={field.key === 'redirect_uri' ? (channel.oauth_redirect_uri || field.placeholder || '') : (field.placeholder || '')}
                        autoComplete="off"
                        onChange={(event) => setField(channel.id, field.key, event.target.value)}
                        className="mt-1 block w-full border border-border bg-background px-3 py-2 text-sm text-foreground"
                      />
                    )}
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap gap-3 mt-4">
                {channel.id === 'mercado_livre' && (
                  <button
                    type="button"
                    onClick={() => authorizeMercadoLivre(channel)}
                    disabled={busy === channel.id}
                    className="bg-primary text-primary-foreground px-4 py-2 font-body text-sm tracking-wider hover:opacity-80 disabled:opacity-60"
                  >
                    {busy === channel.id ? 'Abrindo Mercado Livre…' : 'Autorizar no Mercado Livre'}
                  </button>
                )}
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
                Canal do envio
                <select
                  value={selectedChannel}
                  onChange={(event) => setSelectedChannel(event.target.value)}
                  className="mt-1 block border border-border bg-card px-3 py-2 text-sm text-foreground"
                >
                  <option value="all">Todos os canais</option>
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
            <div className="flex flex-col items-start gap-2 sm:items-end">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => sendProducts(Object.keys(selected).filter((id) => selected[id]))}
                  disabled={Boolean(busy)}
                  className="bg-primary text-primary-foreground px-5 py-2.5 font-body text-sm tracking-wider hover:opacity-80 disabled:opacity-60"
                >
                  {busy === 'send' ? 'Enviando…' : 'Enviar'}
                </button>
                <button
                  type="button"
                  onClick={() => updateProducts(Object.keys(selected).filter((id) => selected[id]))}
                  disabled={Boolean(busy)}
                  className="border border-border px-5 py-2.5 font-body text-sm tracking-wider hover:bg-secondary disabled:opacity-60"
                >
                  {busy === 'update' ? 'Atualizando…' : 'Atualizar'}
                </button>
              </div>
              <p className="font-body text-xs text-muted-foreground max-w-sm text-left sm:text-right">
                {showAllChannels
                  ? 'Enviar publica nos canais conectados e ignora produtos sem estoque.'
                  : 'Enviar publica no canal selecionado e ignora produtos sem estoque.'}
                {' '}Atualizar sincroniza preço e estoque dos anúncios já publicados.
              </p>
            </div>
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
                  <th className="px-3 py-3 font-medium">No site</th>
                  {!showAllChannels && (
                    <>
                      <th className="px-3 py-3 font-medium">No marketplace</th>
                      <th className="px-3 py-3 font-medium">Categoria do canal</th>
                    </>
                  )}
                  {visibleChannels.map((channel) => (
                    <th
                      key={channel.id}
                      className="px-3 py-3 font-medium whitespace-nowrap align-top"
                      title={STATUS_LABEL[channel.status] || channel.status}
                    >
                      <div>{showAllChannels ? channel.label : 'Status'}</div>
                      <select
                        value={platformFilters[channel.id] || ''}
                        onChange={(event) => setPlatformFilters((prev) => ({
                          ...prev,
                          [channel.id]: event.target.value,
                        }))}
                        aria-label={`Filtrar ${channel.label}`}
                        className="mt-2 block w-full min-w-[128px] border border-border bg-card px-2 py-1 text-xs font-normal text-foreground"
                      >
                        <option value="">Todos</option>
                        <option value="enviado">Enviado</option>
                        <option value="nao_enviado">Não enviado</option>
                        <option value="erro">Erro</option>
                      </select>
                    </th>
                  ))}
                  <th className="px-3 py-3 font-medium">Ações</th>
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
                      <td className="px-3 py-3 text-foreground">
                        <div className="flex items-center gap-3">
                          {product.image_url ? (
                            <img
                              src={resolveMediaUrl(product.image_url)}
                              alt={product.name}
                              className="w-10 h-10 object-cover rounded-sm bg-secondary shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-sm bg-secondary shrink-0" />
                          )}
                          <span>{product.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">{product.sku || product.internal_code || '—'}</td>
                      <td className="px-3 py-3">
                        {(Number(product.quantity) || 0) > 0 ? (
                          Number(product.quantity) || 0
                        ) : (
                          <span className="text-destructive whitespace-nowrap">Sem estoque</span>
                        )}
                      </td>
                      <td className="px-3 py-3">{money(product.price)}</td>
                      {!showAllChannels && (
                        <>
                      <td className="px-3 py-3">
                        <input
                          value={prices[categoryKey] ?? ''}
                          onChange={(event) => setPrices((prev) => ({
                            ...prev,
                            [categoryKey]: event.target.value,
                          }))}
                          onBlur={(event) => saveListingPrice(product.id, event.target.value)}
                          title="Deixe vazio para usar o acréscimo percentual"
                          placeholder={money(marketplacePrice(product.price, markupPercent))}
                          inputMode="decimal"
                          className="w-28 border border-border bg-background px-2 py-1.5 text-sm"
                        />
                      </td>
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
                        {selectedChannel === 'mercado_livre' && (
                          <div className="mt-2 space-y-2">
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => suggestCategory(product)}
                                disabled={busy === `cat-${product.id}`}
                                className="border border-border px-2 py-1 text-xs hover:bg-secondary disabled:opacity-60"
                              >
                                Sugerir categoria
                              </button>
                              <button
                                type="button"
                                onClick={() => loadAttributeFields(product)}
                                disabled={busy === `attr-${product.id}`}
                                className="border border-border px-2 py-1 text-xs hover:bg-secondary disabled:opacity-60"
                              >
                                Atributos
                              </button>
                            </div>
                            {(categoryHints[product.id] || []).map((hint) => (
                              <button
                                key={hint.category_id}
                                type="button"
                                onClick={() => chooseCategory(product, hint)}
                                className="block w-full text-left text-xs text-foreground hover:underline"
                              >
                                {hint.category_id} — {hint.category_name}
                              </button>
                            ))}
                            {(attributeFields[product.id] || []).map((field) => (
                              <label key={field.id} className="block text-xs text-muted-foreground">
                                {field.name}
                                {field.values?.length ? (
                                  <select
                                    value={attributes[categoryKey]?.[field.id] || ''}
                                    onChange={(event) => {
                                      const next = { ...(attributes[categoryKey] || {}), [field.id]: event.target.value };
                                      setAttributes((prev) => ({ ...prev, [categoryKey]: next }));
                                      saveAttributes(product.id, next);
                                    }}
                                    className="mt-1 block w-full border border-border bg-background px-2 py-1 text-sm text-foreground"
                                  >
                                    <option value="">Selecione</option>
                                    {field.values.map((option) => (
                                      <option key={option.id} value={option.id}>{option.name}</option>
                                    ))}
                                  </select>
                                ) : (
                                  <input
                                    value={attributes[categoryKey]?.[field.id] || ''}
                                    onChange={(event) => setAttributes((prev) => ({
                                      ...prev,
                                      [categoryKey]: { ...(prev[categoryKey] || {}), [field.id]: event.target.value },
                                    }))}
                                    onBlur={(event) => {
                                      const next = { ...(attributes[categoryKey] || {}), [field.id]: event.target.value };
                                      saveAttributes(product.id, next);
                                    }}
                                    className="mt-1 block w-full border border-border bg-background px-2 py-1 text-sm text-foreground"
                                  />
                                )}
                              </label>
                            ))}
                          </div>
                        )}
                      </td>
                        </>
                      )}
                      {visibleChannels.map((channel) => {
                        const platformListing = listingStatus(product.id, channel.id);
                        const adLinks = channel.id === 'mercado_livre'
                          ? [...new Map(
                            listingsFor(product.id, channel.id)
                              .filter((row) => row.status === 'published' && mercadoLivreItemUrl(row.external_id))
                              .map((row) => [row.external_id, row]),
                          ).values()]
                          : [];
                        return (
                          <td key={channel.id} className="px-3 py-3 align-top">
                            {platformListing ? (
                              <>
                                <span className={`px-2 py-1 text-xs whitespace-nowrap ${statusClass(platformListing.status)}`}>
                                  {STATUS_LABEL[platformListing.status] || platformListing.status}
                                </span>
                                {adLinks.map((row) => (
                                  <a
                                    key={row.external_id}
                                    href={mercadoLivreItemUrl(row.external_id)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-1 block text-xs text-primary hover:underline whitespace-nowrap"
                                  >
                                    {adLinks.length > 1 && row.external_sku
                                      ? `Ver anúncio (${row.external_sku})`
                                      : 'Ver anúncio'}
                                  </a>
                                ))}
                                {platformListing.last_error && (
                                  <p className="text-xs text-destructive mt-1 max-w-[160px]">{platformListing.last_error}</p>
                                )}
                              </>
                            ) : (
                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                {channel.status === 'connected' ? 'Não enviado' : 'Desconectado'}
                              </span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-3 py-3 align-top">
                        <div className="flex flex-col gap-1">
                          <button
                            type="button"
                            onClick={() => sendProducts([product.id])}
                            disabled={Boolean(busy) || (Number(product.quantity) || 0) <= 0}
                            title={(Number(product.quantity) || 0) <= 0
                              ? 'Produto sem estoque'
                              : (showAllChannels ? 'Enviar para os canais conectados' : `Enviar para ${channelLabel(selectedChannel)}`)}
                            className="border border-border px-2 py-1 text-xs hover:bg-secondary disabled:opacity-50"
                          >
                            {busy === `send-${product.id}` || busy === 'send' ? 'Enviando…' : 'Enviar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => updateProducts([product.id])}
                            disabled={Boolean(busy)}
                            title="Atualizar preço e estoque nos anúncios já publicados"
                            className="border border-border px-2 py-1 text-xs hover:bg-secondary disabled:opacity-50"
                          >
                            {busy === `update-${product.id}` || busy === 'update' ? 'Atualizando…' : 'Atualizar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!products.length && (
                  <tr>
                    <td colSpan={6 + (showAllChannels ? 0 : 2) + visibleChannels.length} className="px-3 py-6 text-muted-foreground">Nenhum produto encontrado.</td>
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
