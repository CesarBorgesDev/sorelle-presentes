import React from 'react';

/**
 * Exibe a imagem do produto inteira dentro do quadro (aspect ratio fixo),
 * centralizada, sem recorte e preservando a proporção original.
 */
export default function ProductImage({
  src,
  alt = '',
  className = '',
  imgClassName = '',
  ...props
}) {
  if (!src) return null;

  return (
    <div className={`flex items-center justify-center overflow-hidden bg-secondary ${className}`}>
      <img
        src={src}
        alt={alt}
        className={`max-w-full max-h-full w-auto h-auto object-contain ${imgClassName}`}
        loading="lazy"
        decoding="async"
        {...props}
      />
    </div>
  );
}
