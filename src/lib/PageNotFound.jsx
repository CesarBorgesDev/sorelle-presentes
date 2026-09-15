import { Link, useLocation } from 'react-router-dom';
import SeoHead from '@/components/SeoHead';

export default function PageNotFound() {
  const location = useLocation();
  const pageName = location.pathname.substring(1);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <SeoHead
        title="Página não encontrada"
        description="A página que você procura não existe ou foi movida."
        path={location.pathname}
        noIndex
      />
      <div className="max-w-md w-full">
        <div className="text-center space-y-6">
          <div className="space-y-2">
            <h1 className="text-7xl font-light text-muted-foreground">404</h1>
            <div className="h-0.5 w-16 bg-border mx-auto" />
          </div>

          <div className="space-y-3">
            <h2 className="font-display text-2xl tracking-wider text-foreground">
              Página não encontrada
            </h2>
            <p className="font-body text-muted-foreground leading-relaxed">
              A página{' '}
              <span className="font-medium text-foreground">
                &quot;{pageName || '/'}&quot;
              </span>{' '}
              não existe nesta loja.
            </p>
          </div>

          <div className="pt-6">
            <Link
              to="/"
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-sm hover:bg-secondary transition-colors duration-200"
            >
              Voltar à loja
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
