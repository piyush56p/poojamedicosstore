/**
 * Inventory API – medicines, batches, salts, categories, companies.
 * Base: /api/admin/inventory/
 * Substitutes: /api/catalog/
 */

import { api } from './client';
import type { Medicine, Batch, Salt, Category, Company, PaginatedResponse, SafetyAdvice, ProductFaqs, StockBillUpload, StockBillUploadResponse } from '../types';

export type AdminProductCreatePayload = {
  name: string;
  sku: string;
  batch_number?: string;
  company_name: string;
  description?: string;
  ingredients_list?: string[];
  concerns_list?: string[];
  prevents_list?: string[];
  needs_list?: string[];
  product_details?: string;
  in_depth_information?: string;
  allergic_warning?: string;
  otc_information?: string;
  habit_forming_information?: string;
  diet_lifestyle_advice?: string;
  consume_type?: string;
  safety_advice?: SafetyAdvice;
  faqs?: ProductFaqs;
  country_of_origin?: string;
  strength?: string;
  size?: string;
  prescription_required?: boolean;
  uses?: string;
  directions_for_use?: string;
  category: number;
  company: number;
  salts?: number[];
  unit?: string;
  image_url?: string | null;
  is_active?: boolean;
};

export type AdminProductPatchPayload = Partial<AdminProductCreatePayload>;

function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') p.set(k, String(v));
  });
  const q = p.toString();
  return q ? `?${q}` : '';
}

// --- Medicines (products) ---

export interface MedicineListParams {
  search?: string;
  category?: number;
  company?: number;
  is_active?: boolean;
  in_stock?: boolean;
  page?: number;
  page_size?: number;
}

export function getMedicines(params: MedicineListParams = {}): Promise<PaginatedResponse<Medicine>> {
  const query = buildQuery(params as Record<string, string | number | boolean | undefined>);
  return api.get<PaginatedResponse<Medicine>>(`/inventory/products/${query}`);
}

export function getMedicine(id: number): Promise<Medicine> {
  return api.get<Medicine>(`/inventory/products/${id}/`);
}

export function createMedicine(payload: AdminProductCreatePayload): Promise<Medicine> {
  return api.post<Medicine>('/inventory/products/', payload);
}

export function patchMedicine(id: number, payload: AdminProductPatchPayload): Promise<Medicine> {
  return api.patch<Medicine>(`/inventory/products/${id}/`, payload);
}

export function deleteMedicine(id: number): Promise<void> {
  return api.delete<void>(`/inventory/products/${id}/`);
}

// --- Batches ---

export interface BatchListParams {
  medicine?: number;
  search?: string;
  page?: number;
  page_size?: number;
}

export function getBatches(params: BatchListParams = {}): Promise<PaginatedResponse<Batch> | Batch[]> {
  const query = buildQuery(params as Record<string, string | number | boolean | undefined>);
  return api.get<PaginatedResponse<Batch> | Batch[]>(`/inventory/batches/${query}`);
}

export function getBatch(id: number): Promise<Batch> {
  return api.get<Batch>(`/inventory/batches/${id}/`);
}

export function createBatch(payload: {
  medicine: number;
  batch_number: string;
  manufacturer?: string;
  manufacture_date?: string;
  expiry_date?: string;
  location_code?: string;
  stock_quantity: number;
  purchase_price?: string;
  selling_price?: string;
}): Promise<Batch> {
  return api.post<Batch>('/inventory/batches/', payload);
}

export function patchBatch(
  id: number,
  payload: Partial<{
    medicine: number;
    batch_number: string;
    manufacturer: string;
    manufacture_date: string;
    expiry_date: string;
    location_code: string;
    stock_quantity: number;
    purchase_price: string;
    selling_price: string;
  }>
): Promise<Batch> {
  return api.patch<Batch>(`/inventory/batches/${id}/`, payload);
}

export function deleteBatch(id: number): Promise<void> {
  return api.delete<void>(`/inventory/batches/${id}/`);
}

// --- Salts ---

export function getSalts(search?: string): Promise<Salt[]> {
  const query = search ? buildQuery({ search }) : '';
  return api.get<Salt[]>(`/inventory/salts/${query}`);
}

export function createSalt(payload: { name: string; description?: string }): Promise<Salt> {
  return api.post<Salt>('/inventory/salts/', payload);
}

export function patchSalt(id: number, payload: { name?: string; description?: string }): Promise<Salt> {
  return api.patch<Salt>(`/inventory/salts/${id}/`, payload);
}

export function deleteSalt(id: number): Promise<void> {
  return api.delete<void>(`/inventory/salts/${id}/`);
}

// --- Categories ---

export function getCategories(): Promise<Category[]> {
  return api.get<Category[]>('/inventory/categories/');
}

export function createCategory(payload: { name: string; description?: string }): Promise<Category> {
  return api.post<Category>('/inventory/categories/', payload);
}

export function patchCategory(
  id: number,
  payload: { name?: string; description?: string }
): Promise<Category> {
  return api.patch<Category>(`/inventory/categories/${id}/`, payload);
}

export function deleteCategory(id: number): Promise<void> {
  return api.delete<void>(`/inventory/categories/${id}/`);
}

// --- Companies ---

export function getCompanies(): Promise<Company[]> {
  return api.get<Company[]>('/inventory/companies/');
}

export function createCompany(payload: { name: string }): Promise<Company> {
  return api.post<Company>('/inventory/companies/', payload);
}

export function patchCompany(id: number, payload: { name: string }): Promise<Company> {
  return api.patch<Company>(`/inventory/companies/${id}/`, payload);
}

export function deleteCompany(id: number): Promise<void> {
  return api.delete<void>(`/inventory/companies/${id}/`);
}

// --- Substitutes (catalog API) ---

/** GET /api/catalog/products/{id}/substitutes/ – returns { count, results } */
export function getSubstitutes(productId: number): Promise<{ count: number; results: Medicine[] }> {
  return fetch(`/api/catalog/products/${productId}/substitutes/`, { credentials: 'omit' })
    .then((res) => {
      if (!res.ok) throw new Error(res.statusText || 'Failed to load substitutes');
      return res.text();
    })
    .then((text) => {
      const data = text ? JSON.parse(text) : { count: 0, results: [] };
      return {
        count: typeof data.count === 'number' ? data.count : (Array.isArray(data.results) ? data.results.length : 0),
        results: Array.isArray(data.results) ? data.results : []
      };
    });
}

// --- Stock Bill Upload ---

/**
 * Upload a stock bill PDF. Body: multipart/form-data with field `file` or `pdf`.
 * Optional: default_category_id (for new products).
 */
export function uploadStockBill(
  file: File,
  options?: { default_category_id?: number }
): Promise<StockBillUploadResponse> {
  const formData = new FormData();
  formData.append('file', file);
  if (options?.default_category_id != null) {
    formData.append('default_category_id', String(options.default_category_id));
  }
  return api.postFormData<StockBillUploadResponse>('/inventory/stock-bill/upload/', formData);
}

/** List all stock bill uploads. GET /api/admin/inventory/stock-bill/uploads/ */
export function getStockBillUploads(): Promise<StockBillUpload[]> {
  return api.get<StockBillUpload[]>('/inventory/stock-bill/uploads/');
}

/** Get one stock bill upload. GET /api/admin/inventory/stock-bill/uploads/<id>/ */
export function getStockBillUpload(id: number): Promise<StockBillUpload> {
  return api.get<StockBillUpload>(`/inventory/stock-bill/uploads/${id}/`);
}
