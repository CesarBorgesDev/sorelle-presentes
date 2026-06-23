import React from 'react';
import { LayoutGrid, List } from 'lucide-react';

export default function ProductViewToggle({ value, onChange, className = '' }) {
  return (
    <div className={`inline-flex items-center border border-border rounded-sm p-0.5 bg-secondary/30 ${className}`}>
      <button
        type="button"
        onClick={() => onChange('grid')}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm font-body text-xs tracking-wider transition-colors ${
          value === 'grid'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        }`}
        aria-pressed={value === 'grid'}
        title="Visualização em grade"
      >
        <LayoutGrid className="w-3.5 h-3.5" />
        Grade
      </button>
      <button
        type="button"
        onClick={() => onChange('list')}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm font-body text-xs tracking-wider transition-colors ${
          value === 'list'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        }`}
        aria-pressed={value === 'list'}
        title="Visualização em lista"
      >
        <List className="w-3.5 h-3.5" />
        Lista
      </button>
    </div>
  );
}

export function useProductViewMode(storageKey = 'sorelle-product-view') {
  const [viewMode, setViewMode] = React.useState(() => {
    if (typeof window === 'undefined') return 'grid';
    return window.localStorage.getItem(storageKey) || 'grid';
  });

  const updateViewMode = React.useCallback((mode) => {
    setViewMode(mode);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKey, mode);
    }
  }, [storageKey]);

  return [viewMode, updateViewMode];
}
