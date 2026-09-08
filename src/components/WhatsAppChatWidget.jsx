import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { X, Send, Minus } from 'lucide-react';
import { api, getChatSessionToken, getSocketUrl } from '@/api/apiClient';
import { useAuth } from '@/lib/AuthContext';
import WhatsAppIcon from './WhatsAppIcon';

const WA_GREEN = '#25D366';
const WA_GREEN_DARK = '#1ebe5d';

function formatTime(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    });
  } catch {
    return '';
  }
}

export default function WhatsAppChatWidget() {
  const { user, isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [needsProfile, setNeedsProfile] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState('');
  const listRef = useRef(null);
  const socketRef = useRef(null);
  const openRef = useRef(false);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const scrollToBottom = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, open, scrollToBottom]);

  const connectSocket = useCallback((sessionToken) => {
    if (!sessionToken) return;
    if (socketRef.current) {
      socketRef.current.emit('chat:join', { sessionToken });
      return;
    }
    const socket = io(getSocketUrl(), {
      path: '/api/socket.io',
      transports: ['websocket', 'polling'],
      auth: { sessionToken },
    });
    socket.on('connect', () => {
      socket.emit('chat:join', { sessionToken: getChatSessionToken() });
    });
    socket.on('chat:message', ({ message }) => {
      if (!message?.id) return;
      setMessages((prev) => {
        if (prev.some((item) => item.id === message.id)) return prev;
        return [...prev, message];
      });
      if (!openRef.current && message.direction === 'outbound') {
        setUnread((count) => count + 1);
      }
    });
    socketRef.current = socket;
  }, []);

  const bootstrap = useCallback(async (profile = {}) => {
    const session = await api.chat.session(profile);
    const data = await api.chat.listMessages();
    setMessages(data.messages || []);
    connectSocket(session.session_token);
    const hasName = Boolean(session.visitor_name);
    setNeedsProfile(!hasName);
    if (session.visitor_name) setName(session.visitor_name);
    if (session.visitor_phone) setPhone(session.visitor_phone);
    setReady(true);
    return session;
  }, [connectSocket]);

  useEffect(() => {
    if (user?.full_name) setName((current) => current || user.full_name);
    if (user?.phone) setPhone((current) => current || user.phone);
  }, [user?.full_name, user?.phone]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!getChatSessionToken()) {
        setReady(true);
        setNeedsProfile(!(isAuthenticated && user?.full_name));
        return;
      }
      try {
        const profile = {};
        if (isAuthenticated && user) {
          if (user.full_name) profile.visitor_name = user.full_name;
          if (user.phone) profile.visitor_phone = user.phone;
        }
        if (!cancelled) await bootstrap(profile);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Chat indisponível no momento');
          setReady(true);
          setNeedsProfile(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bootstrap, isAuthenticated, user]);

  useEffect(() => {
    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, []);

  const handleOpen = async () => {
    setOpen(true);
    setUnread(0);
    if (getChatSessionToken() || !(isAuthenticated && user?.full_name)) return;
    try {
      await bootstrap({
        visitor_name: user.full_name,
        visitor_phone: user.phone || undefined,
      });
      setNeedsProfile(false);
    } catch (err) {
      setError(err.message || 'Não foi possível iniciar o chat');
      setNeedsProfile(true);
    }
  };

  const saveProfile = async (event) => {
    event?.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError('Informe seu nome para começar');
      return;
    }
    setError('');
    try {
      await bootstrap({
        visitor_name: trimmed,
        visitor_phone: phone.trim() || undefined,
      });
      setNeedsProfile(false);
    } catch (err) {
      setError(err.message || 'Não foi possível iniciar o chat');
    }
  };

  const sendMessage = async (event) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError('');
    try {
      if (!getChatSessionToken()) {
        await bootstrap({
          visitor_name: name.trim() || user?.full_name,
          visitor_phone: phone.trim() || user?.phone,
        });
      }
      const result = await api.chat.sendMessage(text);
      setDraft('');
      if (result?.message) {
        setMessages((prev) => {
          if (prev.some((item) => item.id === result.message.id)) return prev;
          return [...prev, result.message];
        });
      }
    } catch (err) {
      setError(err.message || 'Não foi possível enviar');
    } finally {
      setSending(false);
    }
  };

  const subtitle = useMemo(() => {
    if (phone.trim()) return 'Também no seu WhatsApp';
    return 'Chega no WhatsApp da loja';
  }, [phone]);

  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3 pointer-events-none">
      {open && (
        <div
          className="pointer-events-auto w-[min(100vw-1.5rem,24rem)] h-[min(70vh,32rem)] bg-card border border-border shadow-2xl rounded-sm overflow-hidden flex flex-col"
          role="dialog"
          aria-label="Chat Sorelle Presentes"
        >
          <div
            className="px-4 py-3 flex items-center justify-between text-white shrink-0"
            style={{ backgroundColor: WA_GREEN }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                <WhatsAppIcon className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="font-display text-sm tracking-wider truncate">Sorelle Presentes</p>
                <p className="font-body text-[11px] text-white/80 truncate">{subtitle}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-sm hover:bg-white/15"
                aria-label="Minimizar chat"
              >
                <Minus className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-sm hover:bg-white/15"
                aria-label="Fechar chat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {needsProfile ? (
            <form onSubmit={saveProfile} className="flex-1 p-5 flex flex-col gap-4 bg-secondary/20">
              <p className="font-body text-sm text-muted-foreground leading-relaxed">
                Olá! Como podemos te chamar? Se quiser, informe também o WhatsApp para continuarmos no celular.
              </p>
              <label className="block">
                <span className="font-body text-xs tracking-wider uppercase text-muted-foreground">Nome</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full border border-border bg-background px-3 py-2 font-body text-sm rounded-sm"
                  placeholder="Seu nome"
                  autoComplete="name"
                />
              </label>
              <label className="block">
                <span className="font-body text-xs tracking-wider uppercase text-muted-foreground">WhatsApp (opcional)</span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1 w-full border border-border bg-background px-3 py-2 font-body text-sm rounded-sm"
                  placeholder="(34) 99999-0000"
                  autoComplete="tel"
                  inputMode="tel"
                />
              </label>
              {error && <p className="font-body text-xs text-destructive">{error}</p>}
              <button
                type="submit"
                className="mt-auto w-full py-2.5 text-white font-body text-sm tracking-wider uppercase rounded-sm"
                style={{ backgroundColor: WA_GREEN }}
              >
                Iniciar conversa
              </button>
            </form>
          ) : (
            <>
              <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-2 bg-[#efeae2]">
                {messages.length === 0 && (
                  <p className="font-body text-xs text-center text-muted-foreground py-6">
                    Envie uma mensagem. A Sorelle responde por aqui.
                  </p>
                )}
                {messages.map((message) => {
                  const mine = message.direction === 'inbound';
                  return (
                    <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[85%] px-3 py-2 rounded-sm shadow-sm ${
                          mine ? 'bg-[#d9fdd3] text-foreground' : 'bg-white text-foreground'
                        }`}
                      >
                        <p className="font-body text-sm whitespace-pre-wrap break-words">{message.body}</p>
                        <p className="font-body text-[10px] text-muted-foreground text-right mt-1">
                          {formatTime(message.created_date)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <form onSubmit={sendMessage} className="p-2 border-t border-border bg-card flex gap-2 shrink-0">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="flex-1 border border-border bg-background px-3 py-2 font-body text-sm rounded-sm"
                  placeholder={ready ? 'Digite uma mensagem' : 'Conectando…'}
                  disabled={!ready || sending}
                  maxLength={4000}
                />
                <button
                  type="submit"
                  disabled={!draft.trim() || sending}
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white disabled:opacity-50"
                  style={{ backgroundColor: WA_GREEN }}
                  aria-label="Enviar"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
              {error && <p className="px-3 pb-2 font-body text-xs text-destructive">{error}</p>}
            </>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => (open ? setOpen(false) : handleOpen())}
        className="pointer-events-auto relative w-14 h-14 rounded-full shadow-lg text-white flex items-center justify-center transition-transform hover:scale-105"
        style={{ backgroundColor: open ? WA_GREEN_DARK : WA_GREEN }}
        aria-label={open ? 'Fechar chat WhatsApp' : 'Abrir chat WhatsApp'}
      >
        {open ? <X className="w-6 h-6" /> : <WhatsAppIcon className="w-7 h-7" />}
        {!open && unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[1.25rem] h-5 px-1 rounded-full bg-destructive text-destructive-foreground font-body text-[11px] flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
    </div>
  );
}
