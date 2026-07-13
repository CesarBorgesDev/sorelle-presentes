import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';

/**
 * Lightbox em tela cheia com zoom e navegação entre fotos.
 * Fecha com X, Esc ou clique fora da imagem.
 */
export default function ImageLightbox({ images = [], startIndex = 0, alt = '', onClose }) {
  const [index, setIndex] = useState(startIndex);
  const [zoomed, setZoomed] = useState(false);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });

  const hasMultiple = images.length > 1;

  const goPrev = () => {
    setZoomed(false);
    setIndex((current) => (current - 1 + images.length) % images.length);
  };

  const goNext = () => {
    setZoomed(false);
    setIndex((current) => (current + 1) % images.length);
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
      if (hasMultiple && event.key === 'ArrowLeft') goPrev();
      if (hasMultiple && event.key === 'ArrowRight') goNext();
    };

    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMultiple]);

  if (!images.length) return null;

  const handleImageClick = (event) => {
    event.stopPropagation();
    if (zoomed) {
      setZoomed(false);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    setOrigin({
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
    });
    setZoomed(true);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Visualização da foto do produto"
    >
      {/* Fechar */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar"
        className="absolute top-4 right-4 z-10 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2.5 transition-colors"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Indicador de zoom e contador */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-3">
        <span className="flex items-center gap-1.5 text-white/70 text-xs font-body bg-white/10 rounded-full px-3 py-1.5">
          {zoomed ? <ZoomOut className="w-3.5 h-3.5" /> : <ZoomIn className="w-3.5 h-3.5" />}
          {zoomed ? 'Clique para reduzir' : 'Clique na foto para ampliar'}
        </span>
        {hasMultiple && (
          <span className="text-white/70 text-xs font-body bg-white/10 rounded-full px-3 py-1.5">
            {index + 1} / {images.length}
          </span>
        )}
      </div>

      {/* Setas */}
      {hasMultiple && (
        <>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); goPrev(); }}
            aria-label="Foto anterior"
            className="absolute left-3 lg:left-6 z-10 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2.5 lg:p-3 transition-colors"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); goNext(); }}
            aria-label="Próxima foto"
            className="absolute right-3 lg:right-6 z-10 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2.5 lg:p-3 transition-colors"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </>
      )}

      {/* Imagem */}
      <div
        className={`max-w-[92vw] max-h-[85vh] overflow-hidden ${zoomed ? 'cursor-zoom-out' : 'cursor-zoom-in'}`}
        onClick={handleImageClick}
      >
        <img
          src={images[index]}
          alt={alt}
          draggable={false}
          className="max-w-[92vw] max-h-[85vh] object-contain select-none transition-transform duration-300"
          style={{
            transform: zoomed ? 'scale(2.2)' : 'scale(1)',
            transformOrigin: `${origin.x}% ${origin.y}%`,
          }}
        />
      </div>

      {/* Thumbnails */}
      {hasMultiple && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex gap-2 max-w-[90vw] overflow-x-auto px-2 pb-1">
          {images.map((img, i) => (
            <button
              key={i}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setZoomed(false);
                setIndex(i);
              }}
              aria-label={`Ver foto ${i + 1}`}
              className={`w-14 h-16 shrink-0 rounded-sm overflow-hidden border-2 transition-all ${
                index === i ? 'border-white opacity-100' : 'border-transparent opacity-50 hover:opacity-90'
              }`}
            >
              <img src={img} alt="" className="w-full h-full object-cover" draggable={false} />
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body
  );
}
