import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { cartApi } from '@/lib/cartApi';
import { useAuth } from '@/lib/AuthContext';
import Navbar from './Navbar';
import Footer from './Footer';
import CartDrawer from './CartDrawer';

export default function Layout() {
  const [cartOpen, setCartOpen] = useState(false);
  const { isAuthenticated, authChecked } = useAuth();

  const { data: cartItems = [] } = useQuery({
    queryKey: ['cart', isAuthenticated],
    queryFn: () => cartApi.list(),
    enabled: authChecked,
  });

  const cartCount = cartItems.reduce((sum, item) => sum + (item.quantity || 1), 0);

  return (
    <div className="min-h-screen bg-background">
      <Navbar cartCount={cartCount} onCartClick={() => setCartOpen(true)} />
      <main>
        <Outlet />
      </main>
      <Footer />
      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        items={cartItems}
      />
    </div>
  );
}
