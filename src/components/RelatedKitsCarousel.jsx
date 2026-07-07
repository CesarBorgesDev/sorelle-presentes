import React from 'react';
import { Link } from 'react-router-dom';
import ProductCard from '@/components/ProductCard';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';

export default function RelatedKitsCarousel({ kits = [] }) {
  if (!kits.length) return null;

  return (
    <section className="mt-16 lg:mt-24 pt-12 border-t border-border">
      {kits.map((kit) => (
        <div key={kit.id} className="mb-12 last:mb-0">
          <div className="mb-6">
            <p className="text-xs tracking-[0.3em] uppercase text-muted-foreground font-body mb-2">
              Kit relacionado
            </p>
            <h2 className="font-display text-2xl lg:text-3xl tracking-wider text-foreground">
              {kit.name}
            </h2>
          </div>

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

          <div className="mt-4 md:hidden">
            <Link
              to={`/busca?q=${encodeURIComponent(kit.name)}`}
              className="font-body text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Ver mais produtos deste kit
            </Link>
          </div>
        </div>
      ))}
    </section>
  );
}
