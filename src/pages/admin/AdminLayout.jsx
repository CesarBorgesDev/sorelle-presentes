import React, { useState } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { LayoutDashboard, Package, ShoppingBag, Menu, X, LogOut, Users, Settings, FileText, Boxes, Tag, FolderTree } from 'lucide-react';
import { api } from '@/api/apiClient';

const navItems = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/admin' },
  { label: 'Produtos', icon: Package, path: '/admin/produtos' },
  { label: 'Kits', icon: Boxes, path: '/admin/kits' },
  { label: 'Marcas', icon: Tag, path: '/admin/marcas' },
  { label: 'Categorias', icon: FolderTree, path: '/admin/categorias' },
  { label: 'Pedidos', icon: ShoppingBag, path: '/admin/pedidos' },
  { label: 'Afiliados', icon: Users, path: '/admin/afiliados' },
  { label: 'Conteúdo', icon: FileText, path: '/admin/conteudo' },
  { label: 'Configurações', icon: Settings, path: '/admin/configuracoes' },
];

export default function AdminLayout() {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-card border-r border-border flex flex-col transform transition-transform duration-300
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 lg:static lg:flex`}>
        
        {/* Logo */}
        <div className="px-6 py-6 border-b border-border flex items-center justify-between">
          <div>
            <p className="font-display text-xl tracking-widest text-foreground">Sorelle</p>
            <p className="font-body text-xs text-muted-foreground tracking-wider">Painel Administrativo</p>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-muted-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-4 py-6 space-y-1">
          {navItems.map(({ label, icon: Icon, path }) => {
            const active = location.pathname === path;
            return (
              <Link
                key={path}
                to={path}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-sm font-body text-sm tracking-wide transition-colors
                  ${active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-4 py-4 border-t border-border">
          <Link to="/" className="flex items-center gap-3 px-4 py-3 text-muted-foreground hover:text-foreground text-sm font-body tracking-wide transition-colors">
            <LayoutDashboard className="w-4 h-4" />
            Ver Loja
          </Link>
          <button
            onClick={() => api.auth.logout()}
            className="w-full flex items-center gap-3 px-4 py-3 text-muted-foreground hover:text-destructive text-sm font-body tracking-wide transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sair
          </button>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar (mobile) */}
        <div className="lg:hidden flex items-center gap-4 px-4 py-4 border-b border-border bg-card">
          <button onClick={() => setSidebarOpen(true)} className="text-muted-foreground">
            <Menu className="w-5 h-5" />
          </button>
          <p className="font-display tracking-widest text-foreground">Sorelle Admin</p>
        </div>

        <main className="flex-1 p-6 lg:p-8 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}