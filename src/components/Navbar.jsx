import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ShoppingBag, Menu, X, Search, User, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCategories } from '@/hooks/useCategories';

function DesktopDropdown({ category }) {
  const [open, setOpen] = useState(false);
  const timeout = useRef(null);
  const location = useLocation();

  const handleEnter = () => {
    clearTimeout(timeout.current);
    setOpen(true);
  };
  const handleLeave = () => {
    timeout.current = setTimeout(() => setOpen(false), 150);
  };

  const hasChildren = category.children?.length > 0;

  if (!hasChildren) {
    return (
      <Link
        to={`/categoria/${category.slug}`}
        className={`text-sm tracking-wider uppercase transition-all duration-300 hover:opacity-60 ${
          location.pathname === `/categoria/${category.slug}` ? 'opacity-100' : 'opacity-75'
        }`}
      >
        {category.name}
      </Link>
    );
  }

  return (
    <div className="relative" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      <Link
        to={`/categoria/${category.slug}`}
        className={`inline-flex items-center gap-1 text-sm tracking-wider uppercase transition-all duration-300 hover:opacity-60 ${
          location.pathname.startsWith(`/categoria/${category.slug}`) ? 'opacity-100' : 'opacity-75'
        }`}
      >
        {category.name}
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </Link>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 mt-2 w-48 bg-background border border-border rounded-sm shadow-lg z-50"
          >
            <Link
              to={`/categoria/${category.slug}`}
              className="block px-4 py-2.5 text-sm font-body text-foreground hover:bg-secondary transition-colors border-b border-border"
            >
              Ver tudo
            </Link>
            {category.children.map((child) => (
              <Link
                key={child.id}
                to={`/categoria/${child.slug}`}
                className="block px-4 py-2.5 text-sm font-body text-foreground hover:bg-secondary transition-colors"
              >
                {child.name}
              </Link>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MobileSubMenu({ category }) {
  const [open, setOpen] = useState(false);
  const hasChildren = category.children?.length > 0;

  if (!hasChildren) {
    return (
      <Link
        to={`/categoria/${category.slug}`}
        className="font-display text-2xl tracking-widest uppercase text-foreground hover:text-primary transition-colors"
      >
        {category.name}
      </Link>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="font-display text-2xl tracking-widest uppercase text-foreground hover:text-primary transition-colors inline-flex items-center gap-2"
      >
        {category.name}
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex flex-col items-center gap-3 mt-3 overflow-hidden"
          >
            <Link
              to={`/categoria/${category.slug}`}
              className="font-body text-lg text-muted-foreground hover:text-primary transition-colors"
            >
              Ver tudo
            </Link>
            {category.children.map((child) => (
              <Link
                key={child.id}
                to={`/categoria/${child.slug}`}
                className="font-body text-lg text-muted-foreground hover:text-primary transition-colors"
              >
                {child.name}
              </Link>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Navbar({ cartCount = 0, onCartClick }) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const isHome = location.pathname === '/';

  const { data: categories = [] } = useCategories();

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
            <Link to="/" className={`font-display text-xl lg:text-2xl tracking-widest uppercase transition-colors ${textColor}`}>
              Sorelle
            </Link>

            <div className={`hidden lg:flex items-center gap-10 ${textColor}`}>
              {categories.map((category) => (
                <DesktopDropdown key={category.id} category={category} />
              ))}
            </div>

            <div className="flex items-center gap-4">
              <Link
                to="/busca"
                className={`hidden lg:block transition-colors ${textColor} hover:opacity-60`}
                title="Buscar produtos"
                aria-label="Buscar produtos"
              >
                <Search className="w-5 h-5" />
              </Link>
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

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed inset-0 z-40 bg-background pt-20"
          >
            <div className="flex flex-col items-center gap-8 pt-12">
              {categories.map((category) => (
                <MobileSubMenu key={category.id} category={category} />
              ))}
              <Link
                to="/busca"
                className="font-display text-2xl tracking-widest uppercase text-foreground hover:text-primary transition-colors"
              >
                Buscar
              </Link>
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
