export const ORDER_STATUS_LABELS = {
  pendente: 'Pendente',
  confirmado: 'Confirmado',
  em_preparo: 'Em preparo',
  enviado: 'Enviado',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};

export const ORDER_STATUS_COLORS = {
  pendente: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300',
  confirmado: 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300',
  em_preparo: 'bg-purple-100 text-purple-800 dark:bg-purple-500/15 dark:text-purple-300',
  enviado: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-300',
  entregue: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300',
  cancelado: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
};

export const PAYMENT_STATUS_LABELS = {
  aguardando_pagamento: 'Aguardando pagamento',
  pago: 'Pago',
  recusado: 'Recusado',
  cancelado: 'Cancelado',
};

export const PAYMENT_METHOD_LABELS = {
  pix: 'PIX',
  cartao_credito: 'Cartão de crédito',
  boleto: 'Boleto',
  cielo: 'Cielo',
  test: 'Modo teste',
};

export function formatOrderDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatMoney(value) {
  return `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
}
