import React from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag } from 'lucide-react';
import ProductCard from '@/components/ProductCard';
import { resolveMediaUrl } from '@/lib/resolveMediaUrl';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';

function formatPrice(value) {
  if (value == null) return null;
  return `R$ ${Number(value).toFixed(2).replace('.', ',')}`;
}

function KitProductThumb({ product }) {
  return (
    <Link
      to={`/produto/${product.id}`}
      className="block group"
    >
      <div className="aspect-square rounded-sm overflow-hidden bg-secondary mb-1.5">
        {product.image_url ? (
          <img
            src={resolveMediaUrl(product.image_url)}
            alt={product.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground font-body">
            Sem foto
          </div>
        )}
      </div>
      <p className="font-body text-[10px] leading-tight text-foreground line-clamp-2">
        {product.name}
      </p>
    </Link>
  );
}

export default function RelatedKitsCarousel({ kits = [] }) {
  if (!kits.length) return null;

  return (
    <section className="mt-16 lg:mt-24 pt-12 border-t border-border">
      <div className="flex flex-wrap gap-4 lg:gap-6">
        {kits.map((kit) => (
          <article
            key={kit.id}
            className="w-full lg:w-[200px] lg:shrink-0 bg-card border border-border rounded-sm overflow-hidden flex flex-col"
          >
            <div className="px-4 py-4 lg:px-3 lg:py-3 border-b border-border">
              <p className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-body mb-1.5">
                Kit relacionado
              </p>
              <h2 className="font-display text-base lg:text-sm tracking-wider text-foreground leading-snug">
                {kit.name}
              </h2>

              {kit.price != null && (
                <div className="mt-3 space-y-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="font-body text-sm font-medium text-foreground">
                      {formatPrice(kit.price)}
                    </span>
                    {kit.original_price != null && (
                      <span className="font-body text-[10px] text-muted-foreground line-through">
                        {formatPrice(kit.original_price)}
                      </span>
                    )}
                  </div>
                  {kit.discount_amount != null && kit.discount_amount > 0 && (
                    <p className="font-body text-[10px] text-primary leading-tight">
                      Economize {formatPrice(kit.discount_amount)}
                      {kit.discount_percent != null ? ` (${kit.discount_percent}%)` : ''}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="px-4 py-4 lg:px-3 lg:py-3 flex-1">
              <div className="lg:hidden">
                <Carousel
                  opts={{
                    align: 'start',
                    loop: kit.products.length > 4,
                  }}
                  className="w-full"
                >
                  <CarouselContent className="-ml-3">
                    {kit.products.map((product) => (
                      <CarouselItem
                        key={product.id}
                        className="pl-3 basis-1/2 md:basis-1/3"
                      >
                        <ProductCard product={product} />
                      </CarouselItem>
                    ))}
                  </CarouselContent>
                  {kit.products.length > 2 && (
                    <>
                      <CarouselPrevious className="hidden md:flex -left-4 border-border bg-background/95" />
                      <CarouselNext className="hidden md:flex -right-4 border-border bg-background/95" />
                    </>
                  )}
                </Carousel>
              </div>

              <div className="hidden lg:grid grid-cols-2 gap-2">
                {kit.products.map((product) => (
                  <KitProductThumb key={product.id} product={product} />
                ))}
              </div>
            </div>

            <div className="px-4 pb-4 lg:px-3 lg:pb-3 mt-auto">
              <Link
                to={`/kit/${kit.id}`}
                className="flex w-full items-center justify-center gap-1.5 bg-foreground text-background px-3 py-2.5 rounded-sm font-body text-[10px] lg:text-xs tracking-wider hover:bg-foreground/90 transition-colors"
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                Comprar kit
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
