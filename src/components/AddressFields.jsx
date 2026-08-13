import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '@/api/apiClient';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatZipCodeInput, onlyDigits } from '@/lib/profile';

const DEFAULT_INPUT = 'h-12';

export default function AddressFields({
  values,
  onChange,
  inputClassName = DEFAULT_INPUT,
  disabled = false,
}) {
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState('');

  const set = (patch) => onChange(patch);

  const handleCepChange = async (raw) => {
    const formatted = formatZipCodeInput(raw);
    set({ zip_code: formatted });
    const digits = onlyDigits(formatted);
    if (digits.length !== 8) {
      setCepError('');
      return;
    }

    setCepLoading(true);
    setCepError('');
    try {
      const address = await api.shipping.lookupCep(digits);
      set({
        zip_code: formatted,
        address_street: address.street || values.address_street || '',
        address_district: address.district || values.address_district || '',
        address_city: address.city || values.address_city || '',
      });
    } catch (err) {
      setCepError(err.message || 'CEP não encontrado');
    } finally {
      setCepLoading(false);
    }
  };

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="zip_code">CEP *</Label>
        <div className="relative">
          <Input
            id="zip_code"
            value={values.zip_code || ''}
            onChange={(e) => handleCepChange(e.target.value)}
            placeholder="00000-000"
            className={inputClassName}
            required
            disabled={disabled}
            autoComplete="postal-code"
          />
          {cepLoading && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
          )}
        </div>
        {cepError && (
          <p className="text-xs text-destructive">{cepError}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="address_street">Logradouro *</Label>
        <Input
          id="address_street"
          value={values.address_street || ''}
          onChange={(e) => set({ address_street: e.target.value })}
          placeholder="Rua, avenida e número"
          className={inputClassName}
          required
          disabled={disabled || cepLoading}
          autoComplete="street-address"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="address_district">Bairro *</Label>
        <Input
          id="address_district"
          value={values.address_district || ''}
          onChange={(e) => set({ address_district: e.target.value })}
          placeholder="Bairro"
          className={inputClassName}
          required
          disabled={disabled || cepLoading}
          autoComplete="address-level3"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="address_city">Cidade *</Label>
        <Input
          id="address_city"
          value={values.address_city || ''}
          onChange={(e) => set({ address_city: e.target.value })}
          placeholder="Cidade"
          className={inputClassName}
          required
          disabled={disabled || cepLoading}
          autoComplete="address-level2"
        />
      </div>
    </>
  );
}
