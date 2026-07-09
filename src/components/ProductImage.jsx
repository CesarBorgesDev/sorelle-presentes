import React from 'react';

/** Preenche o quadro da imagem do produto sem bordas (object-cover). */
export default function ProductImage({
  src,
  alt = '',
  className = '',
  imgClassName = '',
  ...props
}) {
  if (!src) return null;

  return (
    <div className={`overflow-hidden ${className}`}>
      <img
        src={src}
        alt={alt}
        className={`w-full h-full object-cover ${imgClassName}`}
        loading="lazy"
        decoding="async"
        {...props}
      />
    </div>
  );
}
