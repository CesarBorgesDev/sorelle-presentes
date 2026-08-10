import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '@/api/apiClient';
import { cartApi } from '@/lib/cartApi';
import { useAuth } from '@/lib/AuthContext';
import { completarCadastroUrl } from '@/lib/profile';
import { AlertCircle, Loader2 } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { checkUserAuth } = useAuth();
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function finish() {
      const token = searchParams.get('token');
      const returnUrl = searchParams.get('returnUrl') || '/';
      const needsProfile = searchParams.get('needsProfile') === '1';
      const oauthError = searchParams.get('error');

      if (oauthError) {
        setError(decodeURIComponent(oauthError));
        return;
      }
      if (!token) {
        setError('Token de autenticação ausente');
        return;
      }

      try {
        api.auth.setToken(token);
        await checkUserAuth();
        await cartApi.mergeGuestCartToServer();
        if (cancelled) return;

        if (needsProfile) {
          navigate(completarCadastroUrl(returnUrl), { replace: true });
          return;
        }
        window.location.href = returnUrl.startsWith('/') ? returnUrl : '/';
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Falha ao concluir login');
        }
      }
    }

    finish();
    return () => {
      cancelled = true;
    };
  }, [searchParams, checkUserAuth, navigate]);

  if (error) {
    return (
      <AuthLayout icon={AlertCircle} title="Falha no login" subtitle={error}>
        <button
          type="button"
          className="w-full h-12 rounded-sm bg-foreground text-background font-body text-sm"
          onClick={() => navigate('/login', { replace: true })}
        >
          Voltar ao login
        </button>
      </AuthLayout>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-3 bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-foreground" />
      <p className="font-body text-sm text-muted-foreground">Concluindo login com Google...</p>
    </div>
  );
}
