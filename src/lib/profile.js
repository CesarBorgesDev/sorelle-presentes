/** Perfil mínimo para checkout / pedidos. */
export function isProfileComplete(user) {
  if (!user) return false;
  const doc = String(user.document || '').replace(/\D/g, '');
  const phone = String(user.phone || '').replace(/\D/g, '');
  return Boolean(
    String(user.full_name || '').trim()
    && phone.length >= 10
    && doc.length >= 11
  );
}

export function completarCadastroUrl(returnUrl = '/') {
  const params = new URLSearchParams();
  if (returnUrl && returnUrl !== '/') {
    params.set('returnUrl', returnUrl);
  }
  const qs = params.toString();
  return qs ? `/completar-cadastro?${qs}` : '/completar-cadastro';
}
