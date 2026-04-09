export type OrderStatus = 'PENDING' | 'APPROVED' | 'DISPATCHED' | 'DELIVERED';

export interface Customer {
  id: number;
  first_name: string;
  last_name?: string;
  mobile_number: string;
  is_active: boolean;
}

export interface OrderItem {
  id?: number;
  product?: number;
  product_id?: number;
  product_name?: string;
  item_name?: string;
  quantity: number;
  mrp?: string;
  lot?: string;
  exp?: string;
  hsn?: string;
  gst?: string;
  cgst?: string;
  sgst?: string;
  net?: string;
  price_at_purchase?: string;
  total_price?: string;
}

export type PaymentMode = 'PREPAID' | 'COD' | 'ONLINE';

export interface Order {
  id: number;
  order_number: string;
  status: OrderStatus;
  admin_status?: string;
  customer_id: number;
  customer_name: string;
  total_amount: string;
  payment_mode?: PaymentMode | string;
  shipping_address: string;
  city: string;
  state: string;
  pincode: string;
  patient_name?: string;
  patient_address?: string;
  patient_doctor?: string;
  discount_amount?: string;
  taxable_amount?: string;
  gst_amount?: string;
  cgst_amount?: string;
  sgst_amount?: string;
  cess_amount?: string;
  igst_amount?: string;
  payable_amount?: string;
  items?: OrderItem[];
  created_at?: string;
  updated_at?: string;
}

export interface BillingOrderWriteItem {
  product_id?: number;
  item_name: string;
  quantity: number;
  mrp?: string;
  lot?: string;
  exp?: string;
  hsn?: string;
  gst?: string;
  cgst?: string;
  sgst?: string;
  net?: string;
}

export interface BillingOrderWritePayload {
  customer_id?: number;
  payment_mode?: string;
  shipping_address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  patient_name?: string;
  patient_address?: string;
  patient_doctor?: string;
  discount_amount?: string;
  taxable_amount?: string;
  gst_amount?: string;
  cgst_amount?: string;
  sgst_amount?: string;
  cess_amount?: string;
  igst_amount?: string;
  payable_amount?: string;
  items: BillingOrderWriteItem[];
}

/** Bill / Receipt document – shared structure from GET .../bill/ and .../receipt/ */
export interface OrderBillReceiptDoc {
  document_type: 'BILL' | 'RECEIPT';
  document_number: string;
  generated_at: string;
  order: {
    id: number;
    order_number: string;
    status: string;
    payment_mode?: string;
    created_at?: string;
    invoice_date?: string;
    doctor_name?: string;
  };
  customer: {
    id: number;
    username?: string;
    name: string;
    email?: string;
    mobile_number: string;
  };
  shipping_address: {
    address_line: string;
    city: string;
    state: string;
    pincode: string;
  };
  items: Array<{
    id: number;
    product_id?: number;
    product_name: string;
    batch_number?: string;
    manufacture_date?: string;
    expiry_date?: string;
    manufacturer?: string;
    quantity: number;
    unit_price: string;
    line_total: string;
  }>;
  amounts: {
    subtotal: string;
    discount: string;
    tax: string;
    shipping_charge: string;
    grand_total: string;
  };
  notes?: string;
}

export interface Prescription {
  id: number;
  customer: Customer | number;
  status: string;
  created_at?: string;
}

// --- Inventory (admin) & Catalog ---

/** Safety advice keys for products */
export interface SafetyAdvice {
  alcohol?: string;
  pregnancy?: string;
  breast_feeding?: string;
  driving?: string;
  liver?: string;
  heart?: string;
  kids?: string;
  kidney?: string;
  old_age?: string;
}

/** FAQs object for products – fixed keys, string values */
export interface ProductFaqs {
  what_is_this_medicine_for?: string;
  how_to_take_this_medicine?: string;
  what_are_the_common_side_effects?: string;
  can_i_take_it_with_other_medicines?: string;
  what_if_i_miss_a_dose?: string;
}

/** Medicine / catalog product – list and detail shape */
export interface Medicine {
  id: number;
  name: string;
  sku: string;
  batch_number?: string;
  company_name?: string;
  resolved_company_name?: string;
  company?: number;
  strength?: string;
  size?: string;
  prescription_required?: boolean;
  salts?: number[] | string[];
  salt_names?: string[];
  price?: string;
  stock_quantity?: number;
  in_stock?: boolean;
  category?: number;
  category_name?: string;
  uses?: string;
  directions_for_use?: string;
  description?: string;
  unit?: string;
  is_active?: boolean;
  image_url?: string | null;
  created_at?: string;
  updated_at?: string;
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
}

/** Batch inventory – stock per batch */
export interface Batch {
  id: number;
  medicine: number;
  medicine_name?: string;
  batch_number: string;
  manufacturer?: string;
  manufacture_date?: string;
  expiry_date?: string;
  location_code?: string;
  stock_quantity: number;
  purchase_price?: string;
  selling_price?: string;
  created_at?: string;
  updated_at?: string;
}

/** Salt (ingredient) */
export interface Salt {
  id: number;
  name: string;
  description?: string;
}

export interface Category {
  id: number;
  name: string;
  description?: string;
}

export interface Company {
  id: number;
  name: string;
}

export interface PaginatedResponse<T> {
  count: number;
  results: T[];
}

/** Legacy product shape (e.g. orders) */
export interface Product {
  id: number;
  name: string;
  sku: string;
  category?: number;
  category_name?: string;
  company?: number;
  company_name?: string;
  price?: string;
  stock_quantity?: number;
  unit?: string;
  in_stock?: boolean;
  is_active?: boolean;
}

/** Stock bill upload – result of parsing a wholesaler PDF */
export interface StockBillUploadResultSummary {
  lines_processed: number;
  batches_updated: number;
  batches_created: number;
  products_created: number;
  errors: string[];
}

export interface StockBillUpload {
  id: number;
  file?: string;
  status: string;
  result_summary?: StockBillUploadResultSummary;
  parsed_lines?: Array<Record<string, unknown>>;
  errors?: string[];
  created_at?: string;
}

/** POST stock-bill/upload/ response (201) */
export interface StockBillUploadResponse {
  upload_id: number;
  status: string;
  result_summary: StockBillUploadResultSummary;
  message: string;
}

