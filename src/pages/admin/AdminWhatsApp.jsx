import React, { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { MessageCircle, QrCode, Unlink, Send, Loader2, Circle, CheckCircle2 } from 'lucide-react';
import { api, getSocketUrl } from '@/api/apiClient';
import WhatsAppIcon from '@/components/WhatsAppIcon';

function formatTime(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    });
  } catch {
    return '';
  }
}

function statusLabel(status) {
  if (status === 'connected') return 'Conectado';
  if (status === 'qr') return 'Escaneie o QR Code';
  if (status === 'connecting') return 'Conectando…';
  return 'Desconectado';
}

export default function AdminWhatsApp() {
  const [waStatus, setWaStatus] = useState({ status: 'disconnected', connected: false, phone: null, qr: null });
  const [notifyPhone, setNotifyPhone] = useState('');
  const [notifySaving, setNotifySaving] = useState(false);
  const [notifyMessage, setNotifyMessage] = useState('');
  const [botEnabled, setBotEnabled] = useState(true);
  const [botSaving, setBotSaving] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingQr, setLoadingQr] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef(null);
  const selectedIdRef = useRef(null);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const selected = useMemo(
    () => conversations.find((item) => item.id === selectedId) || null,
    [conversations, selectedId]
  );

  const upsertConversation = (conversation) => {
    if (!conversation?.id) return;
    setConversations((prev) => {
      const without = prev.filter((item) => item.id !== conversation.id);
      return [conversation, ...without].sort((a, b) => {
        const da = new Date(a.last_message_at || a.created_date || 0).getTime();
        const db = new Date(b.last_message_at || b.created_date || 0).getTime();
        return db - da;
      });
    });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [status, notify, list, bot] = await Promise.all([
          api.whatsapp.status(),
          api.whatsapp.getNotifyPhone(),
          api.whatsapp.conversations({ status: 'open' }),
          api.whatsapp.getBot(),
        ]);
        if (cancelled) return;
        setWaStatus(status);
        setNotifyPhone(notify.phone || '');
        setConversations(list);
        setBotEnabled(bot.enabled !== false);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Falha ao carregar o WhatsApp');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('sorelle_access_token');
    const socket = io(getSocketUrl(), {
      path: '/api/socket.io',
      transports: ['websocket', 'polling'],
      auth: { token },
    });
    socket.on('connect', () => socket.emit('admin:join'));
    socket.on('whatsapp:status', (payload) => {
      if (payload) setWaStatus((prev) => ({ ...prev, ...payload }));
    });
    socket.on('whatsapp:qr', ({ qr }) => {
      setWaStatus((prev) => ({ ...prev, status: 'qr', qr, connected: false }));
    });
    socket.on('chat:conversation', ({ conversation }) => {
      upsertConversation(conversation);
    });
    socket.on('chat:message', ({ conversation, message }) => {
      upsertConversation(conversation);
      if (message && conversation?.id === selectedIdRef.current) {
        setMessages((prev) => {
          if (prev.some((item) => item.id === message.id)) return prev;
          return [...prev, message];
        });
      }
    });
    return () => socket.disconnect();
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo?.(0, listRef.current.scrollHeight);
  }, [messages, selectedId]);

  const loadThread = async (id) => {
    setSelectedId(id);
    setError('');
    try {
      const data = await api.whatsapp.messages(id);
      setMessages(data.messages || []);
      if (data.conversation) upsertConversation({ ...data.conversation, unread_admin: 0 });
    } catch (err) {
      setError(err.message || 'Não foi possível abrir a conversa');
    }
  };

  const startQr = async () => {
    setLoadingQr(true);
    setError('');
    try {
      const status = await api.whatsapp.qr();
      setWaStatus(status);
    } catch (err) {
      setError(err.message || 'Não foi possível gerar o QR Code');
    } finally {
      setLoadingQr(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm('Desconectar o WhatsApp da loja? Será preciso escanear o QR novamente.')) return;
    setLoggingOut(true);
    try {
      const status = await api.whatsapp.logout();
      setWaStatus(status);
    } catch (err) {
      setError(err.message || 'Não foi possível desconectar');
    } finally {
      setLoggingOut(false);
    }
  };

  const toggleBot = async () => {
    setBotSaving(true);
    try {
      const result = await api.whatsapp.saveBot(!botEnabled);
      setBotEnabled(result.enabled !== false);
    } catch (err) {
      setError(err.message || 'Não foi possível atualizar o robô');
    } finally {
      setBotSaving(false);
    }
  };

  const toggleConversationBot = async () => {
    if (!selectedId || !selected) return;
    try {
      const updated = await api.whatsapp.updateConversation(selectedId, {
        bot_paused: !selected.bot_paused,
      });
      upsertConversation(updated);
    } catch (err) {
      setError(err.message || 'Não foi possível atualizar o robô desta conversa');
    }
  };

  const saveNotify = async (event) => {
    event.preventDefault();
    setNotifySaving(true);
    setNotifyMessage('');
    try {
      const result = await api.whatsapp.saveNotifyPhone(notifyPhone);
      setNotifyPhone(result.phone || '');
      setNotifyMessage('Número notificador salvo.');
    } catch (err) {
      setNotifyMessage(err.message || 'Não foi possível salvar');
    } finally {
      setNotifySaving(false);
    }
  };

  const sendReply = async (event) => {
    event.preventDefault();
    if (!selectedId || !draft.trim()) return;
    setSending(true);
    try {
      const result = await api.whatsapp.reply(selectedId, draft.trim());
      setDraft('');
      if (result?.message) {
        setMessages((prev) => {
          if (prev.some((item) => item.id === result.message.id)) return prev;
          return [...prev, result.message];
        });
      }
      if (result?.conversation) upsertConversation(result.conversation);
    } catch (err) {
      setError(err.message || 'Não foi possível enviar');
    } finally {
      setSending(false);
    }
  };

  const connected = waStatus.status === 'connected';

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl tracking-wider text-foreground">Mensagens</h1>
        <p className="font-body text-muted-foreground mt-1">
          Conecte o WhatsApp da loja e responda os chats do site.
        </p>
      </div>

      {error && (
        <p className="font-body text-sm text-destructive bg-destructive/10 border border-destructive/20 px-4 py-3 rounded-sm">
          {error}
        </p>
      )}

      <section className="bg-card border border-border rounded-sm p-5 lg:p-6">
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1 space-y-4">
            <div className="flex items-center gap-2">
              {connected ? (
                <CheckCircle2 className="w-4 h-4 text-green-600" />
              ) : (
                <Circle className="w-4 h-4 text-muted-foreground" />
              )}
              <p className="font-body text-sm text-foreground">
                {statusLabel(waStatus.status)}
                {waStatus.phone ? ` · +${waStatus.phone}` : ''}
              </p>
            </div>
            <p className="font-body text-sm text-muted-foreground leading-relaxed max-w-xl">
              Escaneie o QR Code com o WhatsApp da loja (Aparelhos conectados). Mensagens do site aparecem nesse
              WhatsApp para você responder pelo celular. Sem o número do visitante, a conversa vai para o chat
              “Você” (ou para o número notificador, se estiver preenchido).
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={startQr}
                disabled={loadingQr || connected}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-body text-sm tracking-wide rounded-sm disabled:opacity-50"
              >
                {loadingQr ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
                {connected ? 'WhatsApp conectado' : 'Gerar QR Code'}
              </button>
              <button
                type="button"
                onClick={disconnect}
                disabled={loggingOut || waStatus.status === 'disconnected'}
                className="inline-flex items-center gap-2 px-4 py-2 border border-border font-body text-sm tracking-wide rounded-sm disabled:opacity-50"
              >
                {loggingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlink className="w-4 h-4" />}
                Desconectar
              </button>
            </div>
            <form onSubmit={saveNotify} className="flex flex-col sm:flex-row gap-2 max-w-lg pt-2">
              <input
                value={notifyPhone}
                onChange={(e) => setNotifyPhone(e.target.value)}
                placeholder="Número notificador com DDD"
                className="flex-1 border border-border bg-background px-3 py-2 font-body text-sm rounded-sm"
              />
              <button
                type="submit"
                disabled={notifySaving}
                className="px-4 py-2 border border-border font-body text-sm rounded-sm disabled:opacity-50"
              >
                {notifySaving ? 'Salvando…' : 'Salvar aviso'}
              </button>
            </form>
            {notifyMessage && (
              <p className="font-body text-xs text-muted-foreground">{notifyMessage}</p>
            )}
            <label className="flex items-center gap-2 pt-2 font-body text-sm text-foreground">
              <input
                type="checkbox"
                checked={botEnabled}
                onChange={toggleBot}
                disabled={botSaving}
              />
              Robô de atendimento (aquece o lead, indica produtos e tira dúvidas)
            </label>
          </div>
          <div className="w-full lg:w-56 shrink-0 flex items-center justify-center bg-secondary/40 rounded-sm p-4 min-h-[14rem]">
            {waStatus.qr ? (
              <img src={waStatus.qr} alt="QR Code do WhatsApp" className="w-48 h-48 bg-white p-2 rounded-sm" />
            ) : (
              <div className="text-center text-muted-foreground">
                <WhatsAppIcon className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="font-body text-xs">
                  {connected ? 'Sessão ativa' : 'QR Code aparece aqui'}
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-[28rem]">
        <div className="lg:col-span-4 bg-card border border-border rounded-sm overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-primary" />
            <p className="font-body text-sm tracking-wide">Conversas</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 && (
              <p className="font-body text-sm text-muted-foreground p-4">Nenhuma conversa ainda.</p>
            )}
            {conversations.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => loadThread(item.id)}
                className={`w-full text-left px-4 py-3 border-b border-border hover:bg-secondary/50 ${
                  selectedId === item.id ? 'bg-secondary' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-body text-sm text-foreground truncate">
                    {item.visitor_name || 'Visitante'}
                  </p>
                  {item.unread_admin > 0 && (
                    <span className="min-w-[1.25rem] h-5 px-1 rounded-full bg-primary text-primary-foreground font-body text-[11px] flex items-center justify-center">
                      {item.unread_admin}
                    </span>
                  )}
                </div>
                <p className="font-body text-xs text-muted-foreground truncate mt-0.5">
                  {item.last_message_preview || item.visitor_phone || 'Sem mensagens'}
                </p>
                <p className="font-body text-[10px] text-muted-foreground mt-1">
                  {formatTime(item.last_message_at || item.created_date)}
                </p>
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-8 bg-card border border-border rounded-sm overflow-hidden flex flex-col min-h-[24rem]">
          {selected ? (
            <>
              <div className="px-4 py-3 border-b border-border flex items-start justify-between gap-3">
                <div>
                  <p className="font-body text-sm text-foreground">{selected.visitor_name || 'Visitante'}</p>
                  <p className="font-body text-xs text-muted-foreground">
                    {selected.visitor_phone ? `WhatsApp ${selected.visitor_phone}` : 'Somente no site'}
                    {selected.bot_paused ? ' · robô pausado' : botEnabled ? ' · robô ativo' : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={toggleConversationBot}
                  className="shrink-0 px-3 py-1.5 border border-border font-body text-xs rounded-sm"
                >
                  {selected.bot_paused ? 'Reativar robô' : 'Pausar robô'}
                </button>
              </div>
              <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-2 bg-secondary/20">
                {messages.map((message) => {
                  const fromStore = message.direction === 'outbound';
                  return (
                    <div key={message.id} className={`flex ${fromStore ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[80%] px-3 py-2 rounded-sm ${
                          fromStore ? 'bg-primary text-primary-foreground' : 'bg-card border border-border'
                        }`}
                      >
                        <p className="font-body text-sm whitespace-pre-wrap break-words">{message.body}</p>
                        <p className={`font-body text-[10px] mt-1 ${fromStore ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                          {formatTime(message.created_date)} · {message.source}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <form onSubmit={sendReply} className="p-3 border-t border-border flex gap-2">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Responder…"
                  className="flex-1 border border-border bg-background px-3 py-2 font-body text-sm rounded-sm"
                />
                <button
                  type="submit"
                  disabled={sending || !draft.trim()}
                  className="w-10 h-10 rounded-sm bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50"
                  aria-label="Enviar"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground p-8">
              <p className="font-body text-sm">Selecione uma conversa para responder.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
