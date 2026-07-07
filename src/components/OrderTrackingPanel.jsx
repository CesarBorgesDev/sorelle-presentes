import React from 'react';
import { ExternalLink, Loader2, MapPin, PackageSearch } from 'lucide-react';
import { formatOrderDate } from '@/lib/orderLabels';

export default function OrderTrackingPanel({
  trackingCode,
  tracking,
  loading,
  error,
  onTrack,
  showTrackButton = true,
}) {
  return (
    <div className="space-y-4 p-4 rounded-sm border border-border bg-secondary/30">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-body text-xs text-muted-foreground tracking-wider uppercase mb-1">
            Rastreamento Correios
          </p>
          {trackingCode ? (
            <p className="font-mono text-sm text-foreground">{trackingCode}</p>
          ) : (
            <p className="font-body text-sm text-muted-foreground">Código ainda não informado</p>
          )}
        </div>
        {showTrackButton && trackingCode && (
          <button
            type="button"
            onClick={onTrack}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-sm bg-primary text-primary-foreground font-body text-xs hover:opacity-90 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PackageSearch className="w-3.5 h-3.5" />}
            Rastrear
          </button>
        )}
      </div>

      {error && (
        <p className="font-body text-xs text-destructive">{error}</p>
      )}

      {tracking?.tracking_url && (
        <a
          href={tracking.tracking_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 font-body text-xs text-primary hover:underline"
        >
          Abrir no site dos Correios
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}

      {tracking?.message && (
        <p className="font-body text-xs text-muted-foreground">{tracking.message}</p>
      )}

      {tracking?.events?.length > 0 && (
        <div className="space-y-3 pt-2 border-t border-border">
          {tracking.events.map((event, index) => (
            <div key={`${event.date}-${index}`} className="flex gap-3">
              <div className="mt-1">
                <MapPin className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="font-body text-sm text-foreground">{event.description}</p>
                {event.location && (
                  <p className="font-body text-xs text-muted-foreground">{event.location}</p>
                )}
                {event.date && (
                  <p className="font-body text-xs text-muted-foreground mt-0.5">
                    {formatOrderDate(event.date)}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
