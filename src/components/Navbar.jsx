import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ShoppingBag, Menu, X, Search, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const navLinks = [
  { label: 'Casa', path: '/categoria/casa' },
  { label: 'Decoração', path: '/categoria/decoracao' },
  { label: 'Fragrâncias', path: '/categoria/fragancias' },
  { label: 'Cama, Mesa & Banho', path: '/categoria/cama_mesa_banho' },
];

export default function Navbar({ cartCount = 0, onCartClick }) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const isHome = location.pathname === '/';

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 80);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [location]);

  const navBg = scrolled || !isHome
    ? 'bg-background/95 backdrop-blur-md border-b border-border'
    : 'bg-transparent';

  const textColor = scrolled || !isHome ? 'text-foreground' : 'text-white';

  return (
    <>
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${navBg}`}>
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 lg:h-20">
            {/* Logo */}
            <Link to="/" className={`font-display text-xl lg:text-2xl tracking-widest uppercase transition-colors ${textColor}`}>
              Sorelle
            </Link>

            {/* Desktop Nav */}
            <div className="hidden lg:flex items-center gap-10">
              {navLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  className={`text-sm tracking-wider uppercase transition-all duration-300 hover:opacity-60 ${textColor} ${
                    location.pathname === link.path ? 'opacity-100' : 'opacity-75'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-4">
              <button className={`hidden lg:block transition-colors ${textColor} hover:opacity-60`}>
                <Search className="w-5 h-5" />
              </button>
              <Link
                to="/conta"
                className={`transition-colors ${textColor} hover:opacity-60`}
                title="Minha conta"
                aria-label="Minha conta"
              >
                <User className="w-5 h-5" />
              </Link>
              <button
                onClick={onCartClick}
                className={`relative transition-colors ${textColor} hover:opacity-60`}
              >
                <ShoppingBag className="w-5 h-5" />
                {cartCount > 0 && (
                  <span className="absolute -top-2 -right-2 bg-primary text-primary-foreground text-xs w-5 h-5 rounded-full flex items-center justify-center font-body">
                    {cartCount}
                  </span>
                )}
              </button>
              <button
                className={`lg:hidden transition-colors ${textColor}`}
                onClick={() => setMenuOpen(!menuOpen)}
              >
                {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed inset-0 z-40 bg-background pt-20"
          >
            <div className="flex flex-col items-center gap-8 pt-12">
              {navLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  className="font-display text-2xl tracking-widest uppercase text-foreground hover:text-primary transition-colors"
                >
                  {link.label}
                </Link>
              ))}
              <Link
                to="/conta"
                className="font-display text-2xl tracking-widest uppercase text-foreground hover:text-primary transition-colors"
              >
                Minha conta
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}