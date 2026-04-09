/**
 * Admin API – implements all admin endpoints with exact payloads.
 * Base path: /api/admin
 */

import { api } from './client';
import type {
  BillingOrderWritePayload,
  Customer,
  Order,
  OrderStatus,
  Prescription,
  OrderBillReceiptDoc
} from '../types';

// --- Customers ---

export function getCustomers(): Promise<Customer[]> {
  return api.get<Customer[]>('/customers/');
}

export function getCustomer(id: number): Promise<Customer> {
  return api.get<Customer>(`/customers/${id}/`);
}

/** Update customer: { first_name, mobile_number, is_active } */
export function patchCustomer(
  id: number,
  payload: { first_name: string; mobile_number: string; is_active: boolean }
): Promise<Customer> {
  return api.patch<Customer>(`/customers/${id}/`, payload);
}

// --- Prescriptions ---

export function getPrescriptions(): Promise<Prescription[]> {
  return api.get<Prescription[]>('/prescriptions/');
}

export function getPrescription(id: number): Promise<Prescription> {
  return api.get<Prescription>(`/prescriptions/${id}/`);
}

/** Update prescription status */
export function patchPrescription(
  id: number,
  payload: { status: string }
): Promise<Prescription> {
  return api.patch<Prescription>(`/prescriptions/${id}/`, payload);
}

// --- Orders ---
const BILLING_ORDER_BASE = '/api/orders/orders';

async function ordersApiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BILLING_ORDER_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json'
    },
    // Open/public API mode (no session dependency from frontend).
    credentials: 'omit',
    ...options
  });

  const text = await res.text();
  if (!res.ok) throw new Error(text || res.statusText);
  if (!text || text.trim() === '') return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('Invalid JSON response');
  }
}

export function getOrders(): Promise<Order[]> {
  return ordersApiRequest<Order[]>('/');
}

export function getOrder(id: number): Promise<Order> {
  return ordersApiRequest<Order>(`/${id}/`);
}

/**
 * Create billing order (new orders app API).
 */
export function createOrder(payload: BillingOrderWritePayload): Promise<Order> {
  return ordersApiRequest<Order>('/', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/**
 * Patch billing order (new orders app API).
 */
export function patchOrder(id: number, payload: BillingOrderWritePayload): Promise<Order> {
  return ordersApiRequest<Order>(`/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export function deleteOrder(id: number): Promise<void> {
  return ordersApiRequest<void>(`/${id}/`, { method: 'DELETE' });
}

export type ShareBillPayload = {
  send_email?: boolean;
  send_whatsapp?: boolean;
  email?: string;
  whatsapp?: string;
};

export type ShareBillResponse = {
  sent_email?: boolean;
  sent_whatsapp?: boolean;
  message?: string;
  error?: string;
  [key: string]: unknown;
};

/** POST /api/orders/orders/{id}/bill/share/ */
export function shareOrderBill(orderId: number, payload: ShareBillPayload): Promise<ShareBillResponse> {
  return ordersApiRequest<ShareBillResponse>(`/${orderId}/bill/share/`, {
    method: 'POST',
    body: JSON.stringify(payload ?? {})
  });
}

/** GET /api/orders/orders/{id}/bill/download/ */
export async function downloadOrderBillPdf(orderId: number): Promise<void> {
  const res = await fetch(`${BILLING_ORDER_BASE}/${orderId}/bill/download/`, {
    credentials: 'omit'
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `order-${orderId}-bill.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

/**
 * Change order state – strict progression only.
 * PENDING -> APPROVED -> DISPATCHED -> DELIVERED
 * Payload: { status: "APPROVED" } | { status: "DISPATCHED" } | { status: "DELIVERED" }
 */
export function updateOrderStatus(
  id: number,
  payload: { status: OrderStatus }
): Promise<Order> {
  return api.post<Order>(`/orders/${id}/status/`, payload);
}

const BASE_PATH = '/api/admin';

function billReceiptQuery(doctorName?: string): string {
  if (!doctorName || !String(doctorName).trim()) return '';
  return `?doctor_name=${encodeURIComponent(String(doctorName).trim())}`;
}

/** Bill (JSON). GET /api/admin/orders/{id}/bill/ — optional ?doctor_name= */
export function getOrderBill(orderId: number, params?: { doctor_name?: string }): Promise<OrderBillReceiptDoc> {
  const query = billReceiptQuery(params?.doctor_name);
  return api.get<OrderBillReceiptDoc>(`/orders/${orderId}/bill/${query}`);
}

/** Receipt (JSON). GET /api/admin/orders/{id}/receipt/ — optional ?doctor_name= */
export function getOrderReceipt(orderId: number, params?: { doctor_name?: string }): Promise<OrderBillReceiptDoc> {
  const query = billReceiptQuery(params?.doctor_name);
  return api.get<OrderBillReceiptDoc>(`/orders/${orderId}/receipt/${query}`);
}

function orderDocUrl(orderId: number, doc: 'bill' | 'receipt', action: 'print' | 'download', doctorName?: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const query = billReceiptQuery(doctorName);
  return `${origin}${BASE_PATH}/orders/${orderId}/${doc}/${action}/${query}`;
}

/** URL for printable bill HTML (opens print dialog). Use with window.open(). */
export function getOrderBillPrintUrl(orderId: number, doctorName?: string): string {
  return orderDocUrl(orderId, 'bill', 'print', doctorName);
}

/** URL for printable receipt HTML. Use with window.open(). */
export function getOrderReceiptPrintUrl(orderId: number, doctorName?: string): string {
  return orderDocUrl(orderId, 'receipt', 'print', doctorName);
}

/** URL for bill PDF download. Open in new tab or use <a download href={url}>. */
export function getOrderBillDownloadUrl(orderId: number, doctorName?: string): string {
  return orderDocUrl(orderId, 'bill', 'download', doctorName);
}

/** URL for receipt PDF download. */
export function getOrderReceiptDownloadUrl(orderId: number, doctorName?: string): string {
  return orderDocUrl(orderId, 'receipt', 'download', doctorName);
}
