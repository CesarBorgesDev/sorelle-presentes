import React, { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Download, ExternalLink, FileText, Loader2, Upload } from 'lucide-react';
import { api } from '@/api/apiClient';

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo'));
    reader.readAsDataURL(file);
  });
}

function openBlob({ blob, contentType }) {
  const url = URL.createObjectURL(new Blob([blob], { type: contentType }));
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function downloadBlob({ blob, contentType, filename }) {
  const url = URL.createObjectURL(new Blob([blob], { type: contentType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || 'nota-fiscal';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function InvoiceActions({ orderId, type, label, hasFile, mode, onViewError }) {
  const [loading, setLoading] = useState(false);

  async function fetchInvoice() {
    setLoading(true);
    try {
      const download = mode === 'admin'
        ? api.orderShipping.downloadInvoice(orderId, type)
        : api.checkout.downloadInvoice(orderId, type);
      return await download;
    } catch (err) {
      onViewError?.(err.message || 'Erro ao abrir nota fiscal');
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function handleView() {
    const result = await fetchInvoice();
    if (result) {
      openBlob(result);
    }
  }

  async function handleDownload() {
    const result = await fetchInvoice();
    if (result) {
      downloadBlob({
        ...result,
        filename: result.filename || `nota-fiscal.${type}`,
      });
    }
  }

  if (!hasFile) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={handleView}
        disabled={loading}
        className="inline-flex items-center gap-2 px-3 py-2 border border-border rounded-sm font-body text-xs hover:bg-secondary disabled:opacity-50"
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
        Ver {label}
      </button>
      <button
        type="button"
        onClick={handleDownload}
        disabled={loading}
        className="inline-flex items-center gap-2 px-3 py-2 border border-border rounded-sm font-body text-xs hover:bg-secondary disabled:opacity-50"
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
        Baixar {label}
      </button>
    </div>
  );
}

function AdminUploadRow({ orderId, type, label, accept, hasFile, onUploaded }) {
  const inputRef = useRef(null);
  const [error, setError] = useState('');

  const uploadMutation = useMutation({
    mutationFn: async (file) => {
      const dataUrl = await readFileAsDataUrl(file);
      return api.orderShipping.uploadInvoice(orderId, {
        type,
        file: dataUrl,
        mime_type: file.type || undefined,
      });
    },
    onSuccess: (result) => {
      setError('');
      if (inputRef.current) {
        inputRef.current.value = '';
      }
      onUploaded?.(result.order);
    },
    onError: (err) => {
      setError(err.message || `Erro ao anexar ${label}`);
    },
  });

  function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    uploadMutation.mutate(file);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-body text-sm text-foreground min-w-[3rem]">{label}</span>
        {hasFile ? (
          <span className="text-xs font-body text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
            Anexado
          </span>
        ) : (
          <span className="text-xs font-body text-muted-foreground">Não anexado</span>
        )}
        <label className="inline-flex items-center gap-2 px-3 py-2 border border-border rounded-sm font-body text-xs hover:bg-secondary cursor-pointer">
          {uploadMutation.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Upload className="w-3.5 h-3.5" />
          )}
          {hasFile ? 'Substituir' : 'Anexar'}
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            className="hidden"
            disabled={uploadMutation.isPending}
            onChange={handleFileChange}
          />
        </label>
      </div>
      {error && <p className="font-body text-xs text-destructive">{error}</p>}
    </div>
  );
}

export default function OrderInvoiceSection({
  orderId,
  hasInvoicePdf = false,
  hasInvoiceXml = false,
  mode = 'customer',
  onUploaded,
}) {
  const [viewError, setViewError] = useState('');
  const hasAnyInvoice = hasInvoicePdf || hasInvoiceXml;

  if (mode === 'customer' && !hasAnyInvoice) {
    return null;
  }

  return (
    <div className="space-y-4 p-4 rounded-sm border border-border">
      <div className="flex items-start gap-3">
        <FileText className="w-5 h-5 text-primary mt-0.5 shrink-0" />
        <div>
          <h3 className="font-display text-base tracking-wide text-foreground">Nota fiscal</h3>
          <p className="font-body text-xs text-muted-foreground mt-1">
            {mode === 'admin'
              ? 'Anexe o PDF e o XML da NF-e para o cliente visualizar na área de pedidos.'
              : 'Documentos da nota fiscal do seu pedido.'}
          </p>
        </div>
      </div>

      {mode === 'admin' && (
        <div className="space-y-4 pl-0 sm:pl-8">
          <AdminUploadRow
            orderId={orderId}
            type="pdf"
            label="PDF"
            accept="application/pdf,.pdf"
            hasFile={hasInvoicePdf}
            onUploaded={onUploaded}
          />
          <AdminUploadRow
            orderId={orderId}
            type="xml"
            label="XML"
            accept=".xml,application/xml,text/xml"
            hasFile={hasInvoiceXml}
            onUploaded={onUploaded}
          />
        </div>
      )}

      {(hasInvoicePdf || hasInvoiceXml) && (
        <div className="space-y-3 pl-0 sm:pl-8">
          {hasInvoicePdf && (
            <InvoiceActions
              orderId={orderId}
              type="pdf"
              label="PDF"
              hasFile={hasInvoicePdf}
              mode={mode}
              onViewError={setViewError}
            />
          )}
          {hasInvoiceXml && (
            <InvoiceActions
              orderId={orderId}
              type="xml"
              label="XML"
              hasFile={hasInvoiceXml}
              mode={mode}
              onViewError={setViewError}
            />
          )}
        </div>
      )}

      {viewError && <p className="font-body text-xs text-destructive pl-0 sm:pl-8">{viewError}</p>}
    </div>
  );
}
