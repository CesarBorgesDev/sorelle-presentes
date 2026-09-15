import React, { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { cartApi } from '@/lib/cartApi';
import { useAuth } from '@/lib/AuthContext';
import { trackSiteVisit } from '@/lib/siteAnalytics';
import Navbar from './Navbar';
import Footer from './Footer';
import CartDrawer from './CartDrawer';
import WhatsAppChatWidget from './WhatsAppChatWidget';

export default function Layout() {
  const [cartOpen, setCartOpen] = useState(false);
  const { isAuthenticated, authChecked } = useAuth();
  const location = useLocation();

  useEffect(() => {
    trackSiteVisit(location.pathname);
  }, [location.pathname]);

  const { data: cartItems = [] } = useQuery({
    queryKey: ['cart', isAuthenticated],
    queryFn: () => cartApi.list(),
    enabled: authChecked,
  });

  const cartCount = cartItems.reduce((sum, item) => sum + (item.quantity || 1), 0);
  const hideChat = location.pathname.startsWith('/checkout')
    || location.pathname.startsWith('/pagamento');

  return (
    <div className="min-h-screen bg-background">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-3 focus:left-3 focus:bg-background focus:text-foreground focus:px-4 focus:py-2 focus:text-sm focus:rounded-sm"
      >
        Ir para o conteúdo
      </a>
      <Navbar cartCount={cartCount} onCartClick={() => setCartOpen(true)} />
      <main id="conteudo">
        <Outlet />
      </main>
      <Footer />
      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        items={cartItems}
      />
      {!hideChat && <WhatsAppChatWidget />}
    </div>
  );
}
