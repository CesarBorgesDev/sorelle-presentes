import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, logApiError } from "@/api/apiClient";
import { cartApi } from "@/lib/cartApi";
import { onlyDigits, profileIncompleteMessage, composeProfileAddress } from "@/lib/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus, Mail, Lock, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import GoogleIcon from "@/components/GoogleIcon";
import AddressFields from "@/components/AddressFields";

export default function Register() {
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    document: "",
    zip_code: "",
    address_street: "",
    address_district: "",
    address_city: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const returnUrl = searchParams.get('returnUrl') || '/';
  const loginHref = `/login?returnUrl=${encodeURIComponent(returnUrl)}`;

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (form.password !== form.confirmPassword) {
      setError("As senhas não coincidem");
      return;
    }

    const payload = {
      email: form.email.trim(),
      password: form.password,
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

    setLoading(true);
    try {
      const result = await api.auth.register(payload);
      await cartApi.mergeGuestCartToServer();
      if (result?.needs_profile) {
        window.location.href = `/completar-cadastro?returnUrl=${encodeURIComponent(returnUrl)}`;
        return;
      }
      window.location.href = returnUrl;
    } catch (err) {
      logApiError("Falha ao criar conta", err, { email: form.email });
      setError(err.message || "Falha ao criar conta");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = () => {
    api.auth.loginWithProvider("google", returnUrl);
  };

  return (
    <AuthLayout
      icon={UserPlus}
      title="Crie sua conta"
      subtitle="Preencha todos os dados obrigatórios"
      footer={
        <>
          Já tem uma conta?{" "}
          <Link to={loginHref} className="text-primary font-medium hover:underline">
            Entrar
          </Link>
        </>
      }
    >
      <Button
        variant="outline"
        className="w-full h-12 text-sm font-medium mb-6"
        onClick={handleGoogle}
        type="button"
      >
        <GoogleIcon className="w-5 h-5 mr-2" />
        Continuar com Google
      </Button>

      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-3 text-muted-foreground">ou</span>
        </div>
      </div>

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
            onChange={(e) => set("full_name", e.target.value)}
            className="h-12"
            required
            autoFocus
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">E-mail *</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="voce@exemplo.com"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Telefone *</Label>
          <Input
            id="phone"
            type="tel"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
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
            onChange={(e) => set("document", e.target.value)}
            placeholder="000.000.000-00"
            className="h-12"
            required
          />
        </div>
        <AddressFields
          values={form}
          onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
        />
        <div className="space-y-2">
          <Label htmlFor="password">Senha *</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
              className="pl-10 h-12"
              required
              minLength={6}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirmar senha *</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={form.confirmPassword}
              onChange={(e) => set("confirmPassword", e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Criando conta...
            </>
          ) : (
            "Criar conta"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
