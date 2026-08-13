import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/apiClient';
import { useAuth } from '@/lib/AuthContext';
import {
  formatZipCodeInput,
  isProfileComplete,
  onlyDigits,
  profileIncompleteMessage,
  resolvePersonName,
  composeProfileAddress,
} from '@/lib/profile';
import AuthLayout from '@/components/AuthLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, UserRound } from 'lucide-react';
import AddressFields from '@/components/AddressFields';

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
    zip_code: '',
    address_street: '',
    address_district: '',
    address_city: '',
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
    const source = profile || user;
    const email = source.email || user?.email;
    const incomingName = resolvePersonName(source.full_name, email);
    setForm((f) => ({
      full_name: f.full_name || incomingName,
      phone: f.phone || source.phone || '',
      document: f.document || source.document || '',
      zip_code: f.zip_code || formatZipCodeInput(source.zip_code || ''),
      address_street: f.address_street || source.address_street || '',
      address_district: f.address_district || source.address_district || '',
      address_city: f.address_city || source.address_city || '',
    }));
    if (isProfileComplete({ ...source, email, full_name: incomingName || source.full_name })) {
      navigate(returnUrl.startsWith('/') ? returnUrl : '/checkout', { replace: true });
    }
  }, [profile, user, navigate, returnUrl]);

  const mutation = useMutation({
    mutationFn: (data) => api.account.updateProfile(data),
    onSuccess: async (updated) => {
      queryClient.setQueryData(['account-profile'], updated);
      await checkUserAuth();
      if (!isProfileComplete(updated)) {
        setError(profileIncompleteMessage(updated) || 'Preencha todos os campos obrigatórios.');
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
      email: user?.email || profile?.email || '',
      full_name: form.full_name.trim(),
      phone: form.phone.trim(),
      document: onlyDigits(form.document),
      zip_code: onlyDigits(form.zip_code),
      address_street: form.address_street.trim(),
      address_district: form.address_district.trim(),
      address_city: form.address_city.trim(),
      address: composeProfileAddress(form),
    };
    const incomplete = profileIncompleteMessage(payload);
    if (incomplete) {
      setError(incomplete);
      return;
    }
    mutation.mutate({
      full_name: payload.full_name,
      phone: payload.phone,
      document: payload.document,
      zip_code: payload.zip_code,
      address_street: payload.address_street,
      address_district: payload.address_district,
      address_city: payload.address_city,
      address: payload.address,
    });
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
      subtitle="Preencha nome, telefone, CPF e endereço para continuar"
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
          <Label htmlFor="phone">Telefone *</Label>
          <Input
            id="phone"
            value={form.phone}
            onChange={(e) => set('phone', e.target.value)}
            placeholder="(11) 99999-9999"
            className="h-12"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="document">CPF *</Label>
          <Input
            id="document"
            value={form.document}
            onChange={(e) => set('document', e.target.value)}
            placeholder="000.000.000-00"
            className="h-12"
            required
          />
        </div>
        <AddressFields
          values={form}
          onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
        />
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
