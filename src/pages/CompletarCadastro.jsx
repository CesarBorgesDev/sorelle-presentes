import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { isProfileComplete } from '@/lib/profile';
import AuthLayout from '@/components/AuthLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, UserRound } from 'lucide-react';

export default function CompletarCadastro() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isAuthenticated, isLoadingAuth, checkUserAuth } = useAuth();
  const returnUrl = searchParams.get('returnUrl') || '/checkout';

  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    document: '',
    address: '',
  });
  const [error, setError] = useState('');

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['account-profile'],
    queryFn: () => api.account.getProfile(),
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (!isLoadingAuth && !isAuthenticated) {
      navigate(`/login?returnUrl=${encodeURIComponent(completarPath(returnUrl))}`, { replace: true });
    }
  }, [isAuthenticated, isLoadingAuth, navigate, returnUrl]);

  useEffect(() => {
    if (!profile && !user) return;
    setForm({
      full_name: profile?.full_name || user?.full_name || '',
      phone: profile?.phone || user?.phone || '',
      document: profile?.document || user?.document || '',
      address: profile?.address || user?.address || '',
    });
    if (isProfileComplete(profile || user)) {
      navigate(returnUrl.startsWith('/') ? returnUrl : '/checkout', { replace: true });
    }
  }, [profile, user, navigate, returnUrl]);

  const mutation = useMutation({
    mutationFn: (data) => api.account.updateProfile(data),
    onSuccess: async (updated) => {
      queryClient.setQueryData(['account-profile'], updated);
      await checkUserAuth();
      if (!isProfileComplete(updated)) {
        setError('Preencha nome, telefone e CPF/CNPJ para continuar.');
        return;
      }
      window.location.href = returnUrl.startsWith('/') ? returnUrl : '/checkout';
    },
    onError: (err) => {
      setError(err.message || 'Não foi possível salvar seus dados');
    },
  });

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    const payload = {
      full_name: form.full_name.trim(),
      phone: form.phone.trim(),
      document: form.document.replace(/\D/g, ''),
      address: form.address.trim() || null,
    };
    if (!isProfileComplete(payload)) {
      setError('Preencha nome, telefone e CPF/CNPJ para continuar.');
      return;
    }
    mutation.mutate(payload);
  };

  if (isLoadingAuth || profileLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-foreground" />
      </div>
    );
  }

  return (
    <AuthLayout
      icon={UserRound}
      title="Complete seu cadastro"
      subtitle="Precisamos dos seus dados para finalizar pedidos"
      footer={
        <>
          <Link to="/conta" className="text-primary font-medium hover:underline">
            Ir para minha conta
          </Link>
        </>
      }
    >
      {user?.email && (
        <p className="font-body text-sm text-muted-foreground mb-4">
          Conta: <span className="text-foreground">{user.email}</span>
        </p>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="full_name">Nome completo *</Label>
          <Input
            id="full_name"
            value={form.full_name}
            onChange={(e) => set('full_name', e.target.value)}
            className="h-12"
            required
            autoFocus
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Telefone / WhatsApp *</Label>
          <Input
            id="phone"
            value={form.phone}
            onChange={(e) => set('phone', e.target.value)}
            placeholder="11999999999"
            className="h-12"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="document">CPF ou CNPJ *</Label>
          <Input
            id="document"
            value={form.document}
            onChange={(e) => set('document', e.target.value)}
            placeholder="00000000000"
            className="h-12"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="address">Endereço (opcional)</Label>
          <Input
            id="address"
            value={form.address}
            onChange={(e) => set('address', e.target.value)}
            placeholder="Rua, número, bairro, cidade"
            className="h-12"
          />
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={mutation.isPending}>
          {mutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Salvando...
            </>
          ) : (
            'Salvar e continuar'
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}

function completarPath(returnUrl) {
  const params = new URLSearchParams({ returnUrl });
  return `/completar-cadastro?${params}`;
}
