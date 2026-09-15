import { useLocation } from 'react-router-dom';
import SeoHead from '@/components/SeoHead';
import { isNoIndexPath } from '@/lib/seo';

function privateTitle(pathname) {
  if (pathname.startsWith('/admin')) return 'Administração';
  if (pathname.startsWith('/checkout')) return 'Checkout';
  if (pathname.startsWith('/conta')) return 'Minha conta';
  if (pathname.startsWith('/pagamento')) return 'Pagamento';
  if (pathname.startsWith('/login')) return 'Entrar';
  if (pathname.startsWith('/register')) return 'Criar conta';
  return 'Sorelle Presentes';
}

export default function RouteSeo() {
  const { pathname } = useLocation();
  if (!isNoIndexPath(pathname)) return null;

  return (
    <SeoHead
      title={privateTitle(pathname)}
      description="Página privada da Sorelle Presentes."
      path={pathname}
      noIndex
    />
  );
}
