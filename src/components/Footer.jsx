import React from 'react';
import { Link } from 'react-router-dom';
import { Instagram, Facebook, Mail, MapPin, Phone } from 'lucide-react';
import { useCategories } from '@/hooks/useCategories';

export default function Footer() {
  const { data: categories = [] } = useCategories();
  return (
    <footer className="bg-foreground text-background">
      {/* Main Footer */}
      <div className="max-w-7xl mx-auto px-6 lg:px-16 py-16 lg:py-24">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-8">
          {/* Brand */}
          <div className="lg:col-span-1">
            <h3 className="font-display text-2xl tracking-widest uppercase mb-4">
              Sorelle
            </h3>
            <p className="font-body text-sm text-background/60 leading-relaxed mb-6">
              Curadoria de presentes e decoração para quem valoriza a arte de viver bem. Cada peça é selecionada com cuidado para transformar momentos em memórias.
            </p>
            <div className="flex gap-4">
              <a
                href="https://www.instagram.com/sorellepresentes?igsh=MXltcHMzZ2F4MmQw&utm_source=qr"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram da Sorelle Presentes"
                className="text-background/60 hover:text-background transition-colors"
              >
                <Instagram className="w-5 h-5" />
              </a>
              <a
                href="https://www.facebook.com/share/1ERxDH7Ucd/?mibextid=wwXIfr"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Facebook da Sorelle Presentes"
                className="text-background/60 hover:text-background transition-colors"
              >
                <Facebook className="w-5 h-5" />
              </a>
            </div>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-display text-sm tracking-widest uppercase mb-6">Navegação</h4>
            <ul className="space-y-3">
              {categories.map((category) => (
                <li key={category.slug}>
                  <Link to={`/categoria/${category.slug}`} className="font-body text-sm text-background/60 hover:text-background transition-colors">
                    {category.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Institucional */}
          <div>
            <h4 className="font-display text-sm tracking-widest uppercase mb-6">Institucional</h4>
            <ul className="space-y-3">
              <li>
                <Link to="/sobre-nos" className="font-body text-sm text-background/60 hover:text-background transition-colors">
                  Sobre Nós
                </Link>
              </li>
              <li>
                <Link to="/politica-de-privacidade" className="font-body text-sm text-background/60 hover:text-background transition-colors">
                  Política de Privacidade
                </Link>
              </li>
              <li>
                <Link to="/termos-de-uso" className="font-body text-sm text-background/60 hover:text-background transition-colors">
                  Termos de Uso
                </Link>
              </li>
              <li>
                <Link to="/trocas-e-devolucoes" className="font-body text-sm text-background/60 hover:text-background transition-colors">
                  Trocas e Devoluções
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-display text-sm tracking-widest uppercase mb-6">Contato</h4>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <Mail className="w-4 h-4 mt-0.5 text-background/40" />
                <span className="font-body text-sm text-background/60">contato@sorellepresentes.com.br</span>
              </li>
              <li className="flex items-start gap-3">
                <Phone className="w-4 h-4 mt-0.5 text-background/40" />
                <span className="font-body text-sm text-background/60">(34) 3351-1975</span>
              </li>
              <li className="flex items-start gap-3">
                <MapPin className="w-4 h-4 mt-0.5 text-background/40" />
                <span className="font-body text-sm text-background/60">Sacramento - MG</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom */}
      <div className="border-t border-background/10">
        <div className="max-w-7xl mx-auto px-6 lg:px-16 py-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="font-body text-xs text-background/40">
            © 2024 Sorelle Presentes. Todos os direitos reservados.
          </p>
          <p className="font-body text-xs text-background/40">
            Feito com amor para seu lar
          </p>
        </div>
      </div>
    </footer>
  );
}