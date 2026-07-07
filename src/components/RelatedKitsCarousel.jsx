import React from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag } from 'lucide-react';
import ProductCard from '@/components/ProductCard';
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

export default function RelatedKitsCarousel({ kits = [] }) {
  if (!kits.length) return null;

  return (
    <section className="mt-16 lg:mt-24 pt-12 border-t border-border">
      <div className="space-y-6">
        {kits.map((kit) => (
          <article
            key={kit.id}
            className="bg-card border border-border rounded-sm overflow-hidden"
          >
            <div className="px-5 py-5 lg:px-6 lg:py-6 border-b border-border">
              <p className="text-xs tracking-[0.3em] uppercase text-muted-foreground font-body mb-2">
                Kit relacionado
              </p>
              <h2 className="font-display text-xl lg:text-2xl tracking-wider text-foreground">
                {kit.name}
              </h2>

              {kit.price != null && (
                <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-body text-lg font-medium text-foreground">
                    {formatPrice(kit.price)}
                  </span>
                  {kit.original_price != null && (
                    <span className="font-body text-sm text-muted-foreground line-through">
                      {formatPrice(kit.original_price)}
                    </span>
                  )}
                  {kit.discount_amount != null && kit.discount_amount > 0 && (
                    <span className="font-body text-sm text-primary">
                      Economize {formatPrice(kit.discount_amount)}
                      {kit.discount_percent != null ? ` (${kit.discount_percent}%)` : ''}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="px-5 py-5 lg:px-6">
              <Carousel
                opts={{
                  align: 'start',
                  loop: kit.products.length > 4,
                }}
                className="w-full"
              >
                <CarouselContent className="-ml-3 lg:-ml-4">
                  {kit.products.map((product) => (
                    <CarouselItem
                      key={product.id}
                      className="pl-3 lg:pl-4 basis-1/2 md:basis-1/3 lg:basis-1/4"
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

            <div className="px-5 pb-5 lg:px-6 lg:pb-6 pt-0">
              <Link
                to={`/kit/${kit.id}`}
                className="flex w-full items-center justify-center gap-2 bg-foreground text-background px-5 py-3.5 rounded-sm font-body text-sm tracking-wider hover:bg-foreground/90 transition-colors"
              >
                <ShoppingBag className="w-4 h-4" />
                Comprar kit
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
