import React, { useCallback, useEffect, useState } from 'react';
import {
  RefreshCw,
  Plus,
  Save,
  Trash2,
  X,
  Package,
  FolderTree,
  Building2,
  Search,
  Layers,
  FlaskConical,
  ArrowRightLeft,
  Upload,
  FileText
} from 'lucide-react';
import {
  getMedicines,
  getMedicine,
  createMedicine,
  patchMedicine,
  deleteMedicine,
  getBatches,
  getBatch,
  createBatch,
  patchBatch,
  deleteBatch,
  getSalts,
  createSalt,
  patchSalt,
  deleteSalt,
  getSubstitutes,
  getCategories,
  createCategory,
  patchCategory,
  deleteCategory,
  getCompanies,
  createCompany,
  patchCompany,
  deleteCompany,
  uploadStockBill,
  getStockBillUploads,
  getStockBillUpload,
  type MedicineListParams,
  type BatchListParams
} from '../api/inventory';
import type { Medicine, Batch, Salt, Category, Company, SafetyAdvice, ProductFaqs, StockBillUpload } from '../types';
import type { AdminProductCreatePayload } from '../api/inventory';

const FAQ_KEYS: (keyof ProductFaqs)[] = [
  'what_is_this_medicine_for',
  'how_to_take_this_medicine',
  'what_are_the_common_side_effects',
  'can_i_take_it_with_other_medicines',
  'what_if_i_miss_a_dose'
];

function normalizeFaqs(faqs: string | ProductFaqs | undefined): ProductFaqs {
  if (faqs == null) return {};
  if (typeof faqs === 'string') return {};
  return { ...faqs };
}

type MedicineFormState = Partial<Medicine> & {
  company_name?: string;
  company?: number;
  salts?: number[];
  ingredients_list?: string[];
  concerns_list?: string[];
  prevents_list?: string[];
  needs_list?: string[];
  safety_advice?: SafetyAdvice;
  faqs?: ProductFaqs;
};

const PAGE_SIZE = 10;
const TABS = {
  medicines: 'medicines',
  batches: 'batches',
  salts: 'salts',
  categories: 'categories',
  companies: 'companies',
  stock_bill: 'stock_bill'
} as const;
type TabKey = keyof typeof TABS;

function normalizeBatchList(data: unknown): Batch[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object' && 'results' in data && Array.isArray((data as { results: Batch[] }).results))
    return (data as { results: Batch[] }).results;
  return [];
}

function normalizeMedicineList(data: unknown): { count: number; results: Medicine[] } {
  if (data && typeof data === 'object' && 'results' in data) {
    const d = data as { count?: number; results: Medicine[] };
    return { count: d.count ?? d.results?.length ?? 0, results: Array.isArray(d.results) ? d.results : [] };
  }
  return { count: 0, results: [] };
}

function getStockStatus(stock: number | null | undefined): { label: string; className: string } {
  if (stock == null) return { label: '-', className: '' };
  if (stock <= 0) return { label: 'Out of Stock', className: 'inventory-status inventory-status-out' };
  if (stock <= 10) return { label: 'Low Stock', className: 'inventory-status inventory-status-low' };
  return { label: 'In Stock', className: 'inventory-status inventory-status-in' };
}

export const InventoryPage: React.FC = () => {
  const [tab, setTab] = useState<TabKey>('medicines');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Medicines
  const [medicineParams, setMedicineParams] = useState<MedicineListParams>({ search: '', page: 1, page_size: PAGE_SIZE });
  const [medicineList, setMedicineList] = useState<{ count: number; results: Medicine[] }>({ count: 0, results: [] });
  const [selectedMedicine, setSelectedMedicine] = useState<Medicine | null>(null);
  const [medicineForm, setMedicineForm] = useState<MedicineFormState | null>(null);
  const [showAddMedicine, setShowAddMedicine] = useState(false);
  const [substitutes, setSubstitutes] = useState<Medicine[]>([]);
  const [loadingSubstitutes, setLoadingSubstitutes] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [salts, setSalts] = useState<Salt[]>([]);

  // Batches
  const [batchParams, setBatchParams] = useState<BatchListParams>({ search: '', page: 1, page_size: PAGE_SIZE });
  const [batchList, setBatchList] = useState<Batch[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);
  const [batchForm, setBatchForm] = useState<Partial<Batch> | null>(null);
  const [showAddBatch, setShowAddBatch] = useState(false);
  const [medicines, setMedicines] = useState<Medicine[]>([]);

  // Salts
  const [saltList, setSaltList] = useState<Salt[]>([]);
  const [selectedSalt, setSelectedSalt] = useState<Salt | null>(null);
  const [saltForm, setSaltForm] = useState<{ name: string; description: string }>({ name: '', description: '' });
  const [newSaltForm, setNewSaltForm] = useState<{ name: string; description: string }>({ name: '', description: '' });

  // Categories
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [categoryForm, setCategoryForm] = useState<{ name: string; description: string }>({ name: '', description: '' });
  const [newCategoryForm, setNewCategoryForm] = useState<{ name: string; description: string }>({ name: '', description: '' });

  // Companies
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [companyForm, setCompanyForm] = useState<{ name: string }>({ name: '' });
  const [newCompanyForm, setNewCompanyForm] = useState<{ name: string }>({ name: '' });

  // Stock Bill Upload
  const [stockBillUploads, setStockBillUploads] = useState<StockBillUpload[]>([]);
  const [selectedStockBillUpload, setSelectedStockBillUpload] = useState<StockBillUpload | null>(null);
  const [stockBillUploading, setStockBillUploading] = useState(false);
  const [stockBillDefaultCategoryId, setStockBillDefaultCategoryId] = useState<number | ''>('');

  const loadMedicines = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getMedicines(medicineParams);
      setMedicineList(normalizeMedicineList(data));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [medicineParams]);

  const loadBatches = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getBatches(batchParams);
      setBatchList(normalizeBatchList(data));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [batchParams]);

  const loadSalts = useCallback(async () => {
    try {
      const data = await getSalts();
      setSaltList(Array.isArray(data) ? data : []);
    } catch {
      setSaltList([]);
    }
  }, []);

  const loadCategories = useCallback(async () => {
    try {
      const data = await getCategories();
      setCategories(Array.isArray(data) ? data : []);
    } catch {
      setCategories([]);
    }
  }, []);

  const loadCompanies = useCallback(async () => {
    try {
      const data = await getCompanies();
      setCompanies(Array.isArray(data) ? data : []);
    } catch {
      setCompanies([]);
    }
  }, []);

  const loadMedicinesForBatches = useCallback(async () => {
    try {
      const data = await getMedicines({ page_size: 500 });
      const out = normalizeMedicineList(data);
      setMedicines(out.results);
    } catch {
      setMedicines([]);
    }
  }, []);

  const loadStockBillUploads = useCallback(async () => {
    try {
      setError(null);
      const data = await getStockBillUploads();
      setStockBillUploads(Array.isArray(data) ? data : []);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (tab === 'medicines') void loadMedicines();
    if (tab === 'batches') {
      void loadBatches();
      void loadMedicinesForBatches();
    }
    if (tab === 'salts') void loadSalts();
    if (tab === 'stock_bill') void loadStockBillUploads();
  }, [tab, loadMedicines, loadBatches, loadSalts, loadMedicinesForBatches, loadStockBillUploads]);

  useEffect(() => {
    void loadCategories();
    void loadCompanies();
    void loadSalts();
  }, [loadCategories, loadCompanies, loadSalts]);

  const handleSelectMedicine = async (id: number) => {
    try {
      setError(null);
      const data = await getMedicine(id);
      setSelectedMedicine(data ?? null);
      const saltsIds = Array.isArray(data?.salts) ? (data.salts as number[]).filter((s): s is number => typeof s === 'number') : [];
      setMedicineForm(data ? {
        ...data,
        company_name: data.company_name ?? (data as Medicine & { resolved_company_name?: string }).resolved_company_name,
        company: data.company ?? undefined,
        salts: saltsIds.length ? saltsIds : [],
        ingredients_list: data.ingredients_list ?? [],
        concerns_list: data.concerns_list ?? [],
        prevents_list: data.prevents_list ?? [],
        needs_list: data.needs_list ?? [],
        safety_advice: data.safety_advice ?? {},
        faqs: normalizeFaqs(data.faqs)
      } : null);
      setShowAddMedicine(false);
      setSubstitutes([]);
      if (data?.id) {
        setLoadingSubstitutes(true);
        getSubstitutes(data.id)
          .then(({ results }) => setSubstitutes(results))
          .catch(() => setSubstitutes([]))
          .finally(() => setLoadingSubstitutes(false));
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const buildMedicinePayload = (f: MedicineFormState): AdminProductCreatePayload => {
    const list = (v: string[] | undefined) => (Array.isArray(v) && v.length ? v : undefined);
    return {
      name: f.name!,
      sku: f.sku!,
      batch_number: f.batch_number ?? '',
      company_name: (f.company_name ?? '').trim() || (companies.find((c) => c.id === f.company)?.name ?? ''),
      category: f.category!,
      company: f.company ?? companies[0]?.id ?? 0,
      description: f.description || undefined,
      ingredients_list: list(f.ingredients_list),
      concerns_list: list(f.concerns_list),
      prevents_list: list(f.prevents_list),
      needs_list: list(f.needs_list),
      product_details: f.product_details || undefined,
      in_depth_information: f.in_depth_information || undefined,
      allergic_warning: f.allergic_warning || undefined,
      otc_information: f.otc_information || undefined,
      habit_forming_information: f.habit_forming_information || undefined,
      diet_lifestyle_advice: f.diet_lifestyle_advice || undefined,
      consume_type: f.consume_type || undefined,
      safety_advice: f.safety_advice && Object.keys(f.safety_advice).length ? f.safety_advice : undefined,
      faqs: (f.faqs && Object.values(f.faqs).some((v) => (v ?? '').trim())) ? f.faqs : undefined,
      country_of_origin: f.country_of_origin || undefined,
      strength: f.strength || undefined,
      size: f.size || undefined,
      prescription_required: f.prescription_required ?? false,
      uses: f.uses || undefined,
      directions_for_use: f.directions_for_use || undefined,
      salts: (f.salts?.length ? f.salts : undefined) as number[] | undefined,
      unit: f.unit || 'strip',
      image_url: f.image_url ?? null,
      is_active: f.is_active ?? true
    };
  };

  const handleSaveMedicine = async () => {
    if (!selectedMedicine || !medicineForm) return;
    try {
      setSaving(true);
      setError(null);
      const payload = buildMedicinePayload(medicineForm);
      const updated = await patchMedicine(selectedMedicine.id, payload);
      const saltsIds = Array.isArray(updated.salts) ? (updated.salts as number[]).filter((s): s is number => typeof s === 'number') : [];
      setSelectedMedicine(updated);
      setMedicineForm({
        ...updated,
        company_name: updated.company_name ?? (updated as Medicine & { resolved_company_name?: string }).resolved_company_name,
        company: updated.company ?? undefined,
        salts: saltsIds.length ? saltsIds : [],
        ingredients_list: updated.ingredients_list ?? [],
        concerns_list: updated.concerns_list ?? [],
        prevents_list: updated.prevents_list ?? [],
        needs_list: updated.needs_list ?? [],
        safety_advice: updated.safety_advice ?? {},
        faqs: normalizeFaqs(updated.faqs)
      });
      void loadMedicines();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMedicine = async () => {
    if (!selectedMedicine) return;
    if (!window.confirm(`Delete medicine "${selectedMedicine.name}"?`)) return;
    try {
      setSaving(true);
      setError(null);
      await deleteMedicine(selectedMedicine.id);
      setSelectedMedicine(null);
      setMedicineForm(null);
      setSubstitutes([]);
      void loadMedicines();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateMedicine = async (e: React.FormEvent) => {
    e.preventDefault();
    const f = medicineForm;
    if (!f?.name?.trim() || !f.sku?.trim() || f.category == null) {
      setError('Required: name, sku, category.');
      return;
    }
    const companyId = f.company ?? companies[0]?.id;
    if (!companyId) {
      setError('Select a company.');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const payload = buildMedicinePayload({
        ...f,
        company: companyId,
        company_name: ((f.company_name ?? '').trim() || companies.find((c) => c.id === companyId)?.name) ?? ''
      });
      await createMedicine(payload);
      setShowAddMedicine(false);
      setMedicineForm(null);
      void loadMedicines();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const openAddMedicine = () => {
    setShowAddMedicine(true);
    setSelectedMedicine(null);
    setMedicineForm({
      name: '',
      sku: '',
      batch_number: '',
      company_name: '',
      company: companies[0]?.id ?? 0,
      category: categories[0]?.id ?? 0,
      strength: '',
      size: '',
      prescription_required: false,
      uses: '',
      directions_for_use: '',
      description: '',
      ingredients_list: [],
      concerns_list: [],
      prevents_list: [],
      needs_list: [],
      product_details: '',
      in_depth_information: '',
      allergic_warning: '',
      otc_information: '',
      habit_forming_information: '',
      diet_lifestyle_advice: '',
      consume_type: 'oral',
      safety_advice: {},
      faqs: {},
      country_of_origin: '',
      salts: [],
      unit: 'strip',
      is_active: true
    });
    setSubstitutes([]);
  };

  const listToStr = (arr: string[] | undefined) => (Array.isArray(arr) ? arr.join(', ') : '');
  const strToList = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
  const setList = (field: 'ingredients_list' | 'concerns_list' | 'prevents_list' | 'needs_list', value: string) => {
    setMedicineForm((f) => (f ? { ...f, [field]: strToList(value) } : null));
  };
  const setSafety = (key: keyof SafetyAdvice, value: string) => {
    setMedicineForm((f) => (f ? { ...f, safety_advice: { ...(f.safety_advice ?? {}), [key]: value } } : null));
  };
  const setFaq = (key: keyof ProductFaqs, value: string) => {
    setMedicineForm((f) => (f ? { ...f, faqs: { ...(f.faqs ?? {}), [key]: value } } : null));
  };

  const totalMedicinePages = Math.max(1, Math.ceil(medicineList.count / PAGE_SIZE));
  const currentMedicinePage = Math.min(medicineParams.page ?? 1, totalMedicinePages);

  // Batches
  const handleSelectBatch = async (id: number) => {
    try {
      setError(null);
      const data = await getBatch(id);
      setSelectedBatch(data);
      setBatchForm({ ...data });
      setShowAddBatch(false);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleSaveBatch = async () => {
    if (!selectedBatch || !batchForm) return;
    try {
      setSaving(true);
      setError(null);
      const updated = await patchBatch(selectedBatch.id, {
        medicine: batchForm.medicine,
        batch_number: batchForm.batch_number,
        manufacturer: batchForm.manufacturer,
        manufacture_date: batchForm.manufacture_date,
        expiry_date: batchForm.expiry_date,
        location_code: batchForm.location_code,
        stock_quantity: batchForm.stock_quantity ?? 0,
        purchase_price: batchForm.purchase_price,
        selling_price: batchForm.selling_price
      });
      setSelectedBatch(updated);
      setBatchForm({ ...updated });
      void loadBatches();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBatch = async () => {
    if (!selectedBatch) return;
    if (!window.confirm(`Delete batch "${selectedBatch.batch_number}"?`)) return;
    try {
      setSaving(true);
      setError(null);
      await deleteBatch(selectedBatch.id);
      setSelectedBatch(null);
      setBatchForm(null);
      void loadBatches();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    const f = batchForm;
    if (!f?.medicine || !f.batch_number?.trim() || f.stock_quantity == null) {
      setError('Required: medicine, batch_number, stock_quantity.');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      await createBatch({
        medicine: f.medicine,
        batch_number: f.batch_number.trim(),
        manufacturer: f.manufacturer?.trim(),
        manufacture_date: f.manufacture_date || undefined,
        expiry_date: f.expiry_date || undefined,
        location_code: f.location_code?.trim(),
        stock_quantity: f.stock_quantity,
        purchase_price: f.purchase_price?.trim(),
        selling_price: f.selling_price?.trim()
      });
      setShowAddBatch(false);
      setBatchForm(null);
      void loadBatches();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const openAddBatch = () => {
    setShowAddBatch(true);
    setSelectedBatch(null);
    setBatchForm({
      medicine: medicines[0]?.id ?? 0,
      batch_number: '',
      manufacturer: '',
      manufacture_date: '',
      expiry_date: '',
      location_code: '',
      stock_quantity: 0,
      purchase_price: '',
      selling_price: ''
    });
  };

  // Salts
  const handleSaveSalt = async () => {
    if (!selectedSalt) return;
    try {
      setSaving(true);
      setError(null);
      const updated = await patchSalt(selectedSalt.id, { name: saltForm.name.trim(), description: saltForm.description.trim() || undefined });
      setSelectedSalt(updated);
      setSaltForm({ name: updated.name, description: updated.description ?? '' });
      void loadSalts();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateSalt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSaltForm.name.trim()) return;
    try {
      setSaving(true);
      setError(null);
      await createSalt({ name: newSaltForm.name.trim(), description: newSaltForm.description.trim() || undefined });
      setNewSaltForm({ name: '', description: '' });
      void loadSalts();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSalt = async () => {
    if (!selectedSalt) return;
    if (!window.confirm(`Delete salt "${selectedSalt.name}"?`)) return;
    try {
      setSaving(true);
      setError(null);
      await deleteSalt(selectedSalt.id);
      setSelectedSalt(null);
      setSaltForm({ name: '', description: '' });
      void loadSalts();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // Categories
  const handleSaveCategory = async () => {
    if (!selectedCategory) return;
    try {
      setSaving(true);
      setError(null);
      const updated = await patchCategory(selectedCategory.id, { name: categoryForm.name, description: categoryForm.description });
      setSelectedCategory(updated);
      setCategoryForm({ name: updated.name, description: updated.description ?? '' });
      void loadCategories();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryForm.name.trim()) return;
    try {
      setSaving(true);
      setError(null);
      await createCategory({ name: newCategoryForm.name.trim(), description: newCategoryForm.description.trim() || undefined });
      setNewCategoryForm({ name: '', description: '' });
      void loadCategories();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCategory = async () => {
    if (!selectedCategory) return;
    if (!window.confirm(`Delete category "${selectedCategory.name}"?`)) return;
    try {
      setSaving(true);
      setError(null);
      await deleteCategory(selectedCategory.id);
      setSelectedCategory(null);
      setCategoryForm({ name: '', description: '' });
      void loadCategories();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // Companies
  const handleSaveCompany = async () => {
    if (!selectedCompany) return;
    try {
      setSaving(true);
      setError(null);
      const updated = await patchCompany(selectedCompany.id, { name: companyForm.name });
      setSelectedCompany(updated);
      setCompanyForm({ name: updated.name });
      void loadCompanies();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompanyForm.name.trim()) return;
    try {
      setSaving(true);
      setError(null);
      await createCompany({ name: newCompanyForm.name.trim() });
      setNewCompanyForm({ name: '' });
      void loadCompanies();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCompany = async () => {
    if (!selectedCompany) return;
    if (!window.confirm(`Delete company "${selectedCompany.name}"?`)) return;
    try {
      setSaving(true);
      setError(null);
      await deleteCompany(selectedCompany.id);
      setSelectedCompany(null);
      setCompanyForm({ name: '' });
      void loadCompanies();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleStockBillUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fileInput = form.querySelector<HTMLInputElement>('input[type="file"]');
    const file = fileInput?.files?.[0];
    if (!file) {
      setError('Select a PDF file.');
      return;
    }
    try {
      setStockBillUploading(true);
      setError(null);
      const defaultCategoryId = stockBillDefaultCategoryId === '' ? undefined : Number(stockBillDefaultCategoryId);
      const result = await uploadStockBill(file, defaultCategoryId ? { default_category_id: defaultCategoryId } : undefined);
      fileInput.value = '';
      void loadStockBillUploads();
      if (tab === 'medicines') void loadMedicines();
      if (tab === 'batches') void loadBatches();
      setSelectedStockBillUpload({
        id: result.upload_id,
        status: result.status,
        result_summary: result.result_summary
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStockBillUploading(false);
    }
  };

  const handleSelectStockBillUpload = async (id: number) => {
    try {
      setError(null);
      const data = await getStockBillUpload(id);
      setSelectedStockBillUpload(data);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2>Inventory</h2>
        <div className="tabs">
          <button type="button" className={'tab ' + (tab === 'medicines' ? 'active' : '')} onClick={() => setTab('medicines')}>
            <Package size={16} />
            Medicines
          </button>
          <button type="button" className={'tab ' + (tab === 'batches' ? 'active' : '')} onClick={() => setTab('batches')}>
            <Layers size={16} />
            Batches
          </button>
          <button type="button" className={'tab ' + (tab === 'salts' ? 'active' : '')} onClick={() => setTab('salts')}>
            <FlaskConical size={16} />
            Salts
          </button>
          <button type="button" className={'tab ' + (tab === 'categories' ? 'active' : '')} onClick={() => setTab('categories')}>
            <FolderTree size={16} />
            Categories
          </button>
          <button type="button" className={'tab ' + (tab === 'companies' ? 'active' : '')} onClick={() => setTab('companies')}>
            <Building2 size={16} />
            Companies
          </button>
          <button type="button" className={'tab ' + (tab === 'stock_bill' ? 'active' : '')} onClick={() => setTab('stock_bill')}>
            <Upload size={16} />
            Stock Bill
          </button>
        </div>
      </div>

      {error && <div className="error" role="alert">{error}</div>}

      {/* Medicines tab */}
      {tab === 'medicines' && (
        <>
          <div className="panel filters-panel">
            <div className="filters-row">
              <label className="search-wrap">
                <Search size={16} />
                <input
                  type="search"
                  placeholder="Search medicines..."
                  value={medicineParams.search ?? ''}
                  onChange={(e) => setMedicineParams((p) => ({ ...p, search: e.target.value || undefined, page: 1 }))}
                />
              </label>
              <label>
                Category
                <select
                  value={medicineParams.category ?? ''}
                  onChange={(e) => setMedicineParams((p) => ({ ...p, category: e.target.value ? Number(e.target.value) : undefined, page: 1 }))}
                >
                  <option value="">All</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label>
                Company
                <select
                  value={medicineParams.company ?? ''}
                  onChange={(e) => setMedicineParams((p) => ({ ...p, company: e.target.value ? Number(e.target.value) : undefined, page: 1 }))}
                >
                  <option value="">All</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label className="checkbox">
                <input type="checkbox" checked={medicineParams.is_active === true} onChange={(e) => setMedicineParams((p) => ({ ...p, is_active: e.target.checked ? true : undefined, page: 1 }))} />
                Active only
              </label>
              <label className="checkbox">
                <input type="checkbox" checked={medicineParams.in_stock === true} onChange={(e) => setMedicineParams((p) => ({ ...p, in_stock: e.target.checked ? true : undefined, page: 1 }))} />
                In stock
              </label>
              <button className="button btn-icon" onClick={loadMedicines} disabled={loading}><RefreshCw size={16} /> Refresh</button>
            </div>
          </div>

          <div className="split">
            <div className="panel">
              <div className="panel-header-row">
                <h3>Medicines ({medicineList.count})</h3>
                <button type="button" className="button primary btn-icon" onClick={openAddMedicine}><Plus size={16} /> Add medicine</button>
              </div>
              {loading ? <p>Loading...</p> : (
                <>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Product Name</th>
                        <th>SKU</th>
                        <th>Stock Quantity</th>
                        <th>Price</th>
                        <th>Status</th>
                        <th>Company</th>
                      </tr>
                    </thead>
                    <tbody>
                      {medicineList.results.map((m) => (
                        <tr
                          key={m.id}
                          className={selectedMedicine?.id === m.id ? 'row-selected' : ''}
                          onClick={() => handleSelectMedicine(m.id)}
                        >
                          <td>{m.name}</td>
                          <td>{m.sku}</td>
                          <td>{m.stock_quantity ?? '-'}</td>
                          <td>{m.price ?? '-'}</td>
                          <td>
                            {(() => {
                              const { label, className } = getStockStatus(m.stock_quantity);
                              return className ? <span className={className}>{label}</span> : label;
                            })()}
                          </td>
                          <td>{m.company_name ?? m.resolved_company_name ?? '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {medicineList.results.length === 0 && <p className="muted">No medicines found.</p>}
                  <div className="pagination">
                    <button type="button" className="button" disabled={currentMedicinePage <= 1 || loading} onClick={() => setMedicineParams((p) => ({ ...p, page: (p.page ?? 1) - 1 }))}>Previous</button>
                    <span className="pagination-info">Page {currentMedicinePage} of {totalMedicinePages} ({medicineList.count} total)</span>
                    <button type="button" className="button" disabled={currentMedicinePage >= totalMedicinePages || loading} onClick={() => setMedicineParams((p) => ({ ...p, page: (p.page ?? 1) + 1 }))}>Next</button>
                  </div>
                </>
              )}
            </div>

            <div className="panel inventory-detail-panel">
              {showAddMedicine ? (
                <div>
                  <h3>Add medicine</h3>
                  <form className="form" onSubmit={handleCreateMedicine}>
                    {medicineForm && (
                      <>
                        <label>Name *</label>
                        <input value={medicineForm.name ?? ''} onChange={(e) => setMedicineForm((f) => (f ? { ...f, name: e.target.value } : null))} required />
                        <label>SKU *</label>
                        <input value={medicineForm.sku ?? ''} onChange={(e) => setMedicineForm((f) => (f ? { ...f, sku: e.target.value } : null))} required />
                        <label>Batch number</label>
                        <input value={medicineForm.batch_number ?? ''} onChange={(e) => setMedicineForm((f) => (f ? { ...f, batch_number: e.target.value } : null))} placeholder="Optional" />
                        <label>Category *</label>
                        <select value={medicineForm.category ?? ''} onChange={(e) => setMedicineForm((f) => (f ? { ...f, category: Number(e.target.value) } : null))} required>
                          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <label>Company *</label>
                        <select value={medicineForm.company ?? ''} onChange={(e) => { const id = Number(e.target.value); setMedicineForm((f) => (f ? { ...f, company: id, company_name: companies.find((c) => c.id === id)?.name ?? f.company_name } : null)); }} required>
                          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <div className="form-row">
                          <label>Strength <input value={medicineForm.strength ?? ''} onChange={(e) => setMedicineForm((f) => (f ? { ...f, strength: e.target.value } : null))} placeholder="500 mg" /></label>
                          <label>Size <input value={medicineForm.size ?? ''} onChange={(e) => setMedicineForm((f) => (f ? { ...f, size: e.target.value } : null))} placeholder="10 tablets" /></label>
                        </div>
                        <label className="checkbox">
                          <input type="checkbox" checked={medicineForm.prescription_required ?? false} onChange={(e) => setMedicineForm((f) => (f ? { ...f, prescription_required: e.target.checked } : null))} />
                          Prescription required
                        </label>
                        <label>Unit</label>
                        <input value={medicineForm.unit ?? 'strip'} onChange={(e) => setMedicineForm((f) => (f ? { ...f, unit: e.target.value } : null))} placeholder="strip or piece" />
                        <label>Description</label>
                        <input value={medicineForm.description ?? ''} onChange={(e) => setMedicineForm((f) => (f ? { ...f, description: e.target.value } : null))} />
                        <label>Uses</label>
                        <input value={medicineForm.uses ?? ''} onChange={(e) => setMedicineForm((f) => (f ? { ...f, uses: e.target.value } : null))} />
                        <label>Directions for use</label>
                        <input value={medicineForm.directions_for_use ?? ''} onChange={(e) => setMedicineForm((f) => (f ? { ...f, directions_for_use: e.target.value } : null))} />
                        <label>Ingredients (comma-separated)</label>
                        <input value={listToStr(medicineForm.ingredients_list)} onChange={(e) => setList('ingredients_list', e.target.value)} placeholder="Paracetamol, Caffeine" />
                        <label>Concerns (comma-separated)</label>
                        <input value={listToStr(medicineForm.concerns_list)} onChange={(e) => setList('concerns_list', e.target.value)} placeholder="Fever, Body pain" />
                        <label>Prevents (comma-separated)</label>
                        <input value={listToStr(medicineForm.prevents_list)} onChange={(e) => setList('prevents_list', e.target.value)} />
                        <label>Needs (comma-separated)</label>
                        <input value={listToStr(medicineForm.needs_list)} onChange={(e) => setList('needs_list', e.target.value)} />
                        <label>Product details</label>
                        <textarea value={medicineForm.product_details ?? ''} onChange={(e) => setMedicineForm((f) => (f ? { ...f, product_details: e.target.value } : null))} rows={2} />
                        <label>In-depth information</label>
                        <textarea value={medicineForm.in_depth_information ?? ''} onChange={(e) => setMedicineForm((f) => (f ? { ...f, in_depth_information: e.target.value } : null))} rows={2} />
                        <label>Allergic warning</label>
                        <input value={medicineForm.allergic_warning ?? ''} onChange={(e) => setMedicineForm((f) => (f ? { ...f, allergic_warning: e.target.value } : null))} />
                        <label>OTC information</label>
                        <input value={medicineForm.otc_information ?? ''} onChange={(e) => setMedicineForm((f) => (f ? { ...f, otc_information: e.target.value } : null))} />
                        <label>Habit forming information</label>
                        <input value={medicineForm.habit_forming_information ?? ''} onChange={(e) => setMedicineForm((f) => (f ? { ...f, habit_forming_information: e.target.value } : null))} />
                        <label>Diet/lifestyle advice</label>
                        <input value={medicineForm.diet_lifestyle_advice ?? ''} onChange={(e) => setMedicineForm((f) => (f ? { ...f, diet_lifestyle_advice: e.target.value } : null))} />
                        <label>Consume type</label>
                        <input value={medicineForm.consume_type ?? 'oral'} onChange={(e) => setMedicineForm((f) => (f ? { ...f, consume_type: e.target.value } : null))} placeholder="oral" />
                        <div className="form-section">
                          <h4>FAQs</h4>
                          {FAQ_KEYS.map((key) => (
                            <label key={key}>
                              {key.replace(/_/g, ' ')}
                              <textarea value={medicineForm.faqs?.[key] ?? ''} onChange={(e) => setFaq(key, e.target.value)} rows={2} placeholder={`e.g. ${key === 'what_is_this_medicine_for' ? 'Used for fever and pain relief.' : ''}`} />
                            </label>
                          ))}
                        </div>
                        <label>Country of origin</label>
                        <input value={medicineForm.country_of_origin ?? ''} onChange={(e) => setMedicineForm((f) => (f ? { ...f, country_of_origin: e.target.value } : null))} placeholder="India" />
                        <div className="form-section">
                          <h4>Safety advice</h4>
                          {(['alcohol', 'pregnancy', 'breast_feeding', 'driving', 'liver', 'heart', 'kids', 'kidney', 'old_age'] as const).map((key) => (
                            <label key={key}>
                              {key.replace('_', ' ')}
                              <input value={medicineForm.safety_advice?.[key] ?? ''} onChange={(e) => setSafety(key, e.target.value)} placeholder="e.g. consult your doctor" />
                            </label>
                          ))}
                        </div>
                        <label>Salts (select multiple)</label>
                        <select multiple value={(medicineForm.salts ?? []).map(String)} onChange={(e) => setMedicineForm((f) => (f ? { ...f, salts: Array.from(e.target.selectedOptions, (o) => Number(o.value)) } : null))}>
                          {salts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        <label className="checkbox">
                          <input type="checkbox" checked={medicineForm.is_active ?? true} onChange={(e) => setMedicineForm((f) => (f ? { ...f, is_active: e.target.checked } : null))} />
                          Active
                        </label>
                        <div className="form-actions">
                          <button type="submit" className="button primary btn-icon" disabled={saving}><Save size={16} /> Create</button>
                          <button type="button" className="button btn-icon" onClick={() => { setShowAddMedicine(false); setMedicineForm(null); }}><X size={16} /> Cancel</button>
                        </div>
                      </>
                    )}
                  </form>
                </div>
              ) : selectedMedicine && medicineForm ? (
                <div>
                  <h3>Edit medicine</h3>
                  <div className="detail-meta">
                    <span className="detail-badge">SKU: {selectedMedicine.sku}</span>
                    {(selectedMedicine.salt_names ?? []).length > 0 && (
                      <span className="detail-badge">Salts: {selectedMedicine.salt_names!.join(', ')}</span>
                    )}
                  </div>
                  <form className="form" onSubmit={(e) => { e.preventDefault(); void handleSaveMedicine(); }}>
                    <label>Name</label>
                    <input value={medicineForm.name ?? ''} onChange={(e) => setMedicineForm((f) => (f ? { ...f, name: e.target.value } : null))} />
                    <label>SKU</label>
                    <input value={medicineForm.sku ?? ''} onChange={(e) => setMedicineForm((f) => (f ? { ...f, sku: e.target.value } : null))} />
                    <label>Batch number</label>
                    <input value={medicineForm.batch_number ?? ''} onChange={(e) => setMedicineForm((f) => (f ? { ...f, batch_number: e.target.value } : null))} />
                    <label>Category</label>
                    <select value={medicineForm.category ?? ''} onChange={(e) => setMedicineForm((f) => (f ? { ...f, category: Number(e.target.value) } : null))}>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <label>Company</label>
                    <select value={medicineForm.company ?? ''} onChange={(e) => { const id = Number(e.target.value); setMedicineForm((f) => (f ? { ...f, company: id, company_name: companies.find((c) => c.id === id)?.name ?? f.company_name } : null)); }}>
                      {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <div className="form-row">
                      <label>Strength <input value={medicineForm.strength ?? ''} onChange={(e) => setMedicineForm((f) => (f ? { ...f, strength: e.target.value } : null))} /></label>
                      <label>Size <input value={medicineForm.size ?? ''} onChange={(e) => setMedicineForm((f) => (f ? { ...f, size: e.target.value } : null))} /></label>
                    </div>
                    <label className="checkbox">
                      <input type="checkbox" checked={medicineForm.prescription_required ?? false} onChange={(e) => setMedicineForm((f) => (f ? { ...f, prescription_required: e.target.checked } : null))} />
                      Prescription required
                    </label>
                    <label>Unit</label>
                    <input value={medicineForm.unit ?? ''} onChange={(e) => setMedicineForm((f) => (f ? { ...f, unit: e.target.value } : null))} />
                    <label>Description</label>
                    <input value={medicineForm.description ?? ''} onChange={(e) => setMedicineForm((f) => (f ? { ...f, description: e.target.value } : null))} />
                    <label>Uses</label>
                    <input value={medicineForm.uses ?? ''} onChange={(e) => setMedicineForm((f) => (f ? { ...f, uses: e.target.value } : null))} />
                    <label>Directions for use</label>
                    <input value={medicineForm.directions_for_use ?? ''} onChange={(e) => setMedicineForm((f) => (f ? { ...f, directions_for_use: e.target.value } : null))} />
                    <label>Ingredients (comma-separated)</label>
                    <input value={listToStr(medicineForm.ingredients_list)} onChange={(e) => setList('ingredients_list', e.target.value)} />
                    <label>Concerns</label>
                    <input value={listToStr(medicineForm.concerns_list)} onChange={(e) => setList('concerns_list', e.target.value)} />
                    <label>Prevents</label>
                    <input value={listToStr(medicineForm.prevents_list)} onChange={(e) => setList('prevents_list', e.target.value)} />
                    <label>Needs</label>
                    <input value={listToStr(medicineForm.needs_list)} onChange={(e) => setList('needs_list', e.target.value)} />
                    <label>Product details</label>
                    <textarea value={medicineForm.product_details ?? ''} onChange={(e) => setMedicineForm((f) => (f ? { ...f, product_details: e.target.value } : null))} rows={2} />
                    <label>In-depth information</label>
                    <textarea value={medicineForm.in_depth_information ?? ''} onChange={(e) => setMedicineForm((f) => (f ? { ...f, in_depth_information: e.target.value } : null))} rows={2} />
                    <label>Allergic warning</label>
                    <input value={medicineForm.allergic_warning ?? ''} onChange={(e) => setMedicineForm((f) => (f ? { ...f, allergic_warning: e.target.value } : null))} />
                    <label>OTC information</label>
                    <input value={medicineForm.otc_information ?? ''} onChange={(e) => setMedicineForm((f) => (f ? { ...f, otc_information: e.target.value } : null))} />
                    <label>Habit forming</label>
                    <input value={medicineForm.habit_forming_information ?? ''} onChange={(e) => setMedicineForm((f) => (f ? { ...f, habit_forming_information: e.target.value } : null))} />
                    <label>Diet/lifestyle advice</label>
                    <input value={medicineForm.diet_lifestyle_advice ?? ''} onChange={(e) => setMedicineForm((f) => (f ? { ...f, diet_lifestyle_advice: e.target.value } : null))} />
                    <label>Consume type</label>
                    <input value={medicineForm.consume_type ?? 'oral'} onChange={(e) => setMedicineForm((f) => (f ? { ...f, consume_type: e.target.value } : null))} />
                    <div className="form-section">
                      <h4>FAQs</h4>
                      {FAQ_KEYS.map((key) => (
                        <label key={key}>
                          {key.replace(/_/g, ' ')}
                          <textarea value={medicineForm.faqs?.[key] ?? ''} onChange={(e) => setFaq(key, e.target.value)} rows={2} />
                        </label>
                      ))}
                    </div>
                    <label>Country of origin</label>
                    <input value={medicineForm.country_of_origin ?? ''} onChange={(e) => setMedicineForm((f) => (f ? { ...f, country_of_origin: e.target.value } : null))} />
                    <div className="form-section">
                      <h4>Safety advice</h4>
                      {(['alcohol', 'pregnancy', 'breast_feeding', 'driving', 'liver', 'heart', 'kids', 'kidney', 'old_age'] as const).map((key) => (
                        <label key={key}>
                          {key.replace('_', ' ')}
                          <input value={medicineForm.safety_advice?.[key] ?? ''} onChange={(e) => setSafety(key, e.target.value)} />
                        </label>
                      ))}
                    </div>
                    <label>Salts</label>
                    <select multiple value={(medicineForm.salts ?? []).map(String)} onChange={(e) => setMedicineForm((f) => (f ? { ...f, salts: Array.from(e.target.selectedOptions, (o) => Number(o.value)) } : null))}>
                      {salts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <label className="checkbox">
                      <input type="checkbox" checked={medicineForm.is_active ?? false} onChange={(e) => setMedicineForm((f) => (f ? { ...f, is_active: e.target.checked } : null))} />
                      Active
                    </label>
                    <div className="form-actions">
                      <button type="submit" className="button primary btn-icon" disabled={saving}><Save size={16} /> Save</button>
                      <button type="button" className="button danger btn-icon" onClick={() => void handleDeleteMedicine()} disabled={saving}><Trash2 size={16} /> Delete</button>
                      <button type="button" className="button btn-icon" onClick={() => { setSelectedMedicine(null); setMedicineForm(null); setSubstitutes([]); }} disabled={saving}><X size={16} /> Clear</button>
                    </div>
                  </form>

                  <div className="panel subsection substitutes-panel">
                    <h4><ArrowRightLeft size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} /> Substitutes</h4>
                    <p className="muted small">Same salt mapping, strength &amp; stock availability.</p>
                    {loadingSubstitutes ? <p className="muted">Loading substitutes…</p> : substitutes.length === 0 ? <p className="muted">No substitutes found.</p> : (
                      <ul className="substitutes-list">
                        {substitutes.map((s) => (
                          <li key={s.id}>
                            <strong>{s.name}</strong> {s.strength && `(${s.strength})`} – {s.company_name ?? s.resolved_company_name ?? ''} {s.in_stock !== false ? '• In stock' : ''}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ) : (
                <p className="muted">Select a medicine to edit or add one.</p>
              )}
            </div>
          </div>
        </>
      )}

      {/* Batches tab */}
      {tab === 'batches' && (
        <>
          <div className="panel filters-panel">
            <div className="filters-row">
              <label className="search-wrap">
                <Search size={16} />
                <input type="search" placeholder="Search batches..." value={batchParams.search ?? ''} onChange={(e) => setBatchParams((p) => ({ ...p, search: e.target.value || undefined, page: 1 }))} />
              </label>
              <label>
                Medicine
                <select value={batchParams.medicine ?? ''} onChange={(e) => setBatchParams((p) => ({ ...p, medicine: e.target.value ? Number(e.target.value) : undefined, page: 1 }))}>
                  <option value="">All</option>
                  {medicines.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.sku})</option>)}
                </select>
              </label>
              <button className="button btn-icon" onClick={loadBatches} disabled={loading}><RefreshCw size={16} /> Refresh</button>
            </div>
          </div>

          <div className="split">
            <div className="panel">
              <div className="panel-header-row">
                <h3>Batches</h3>
                <button type="button" className="button primary btn-icon" onClick={openAddBatch}><Plus size={16} /> Add batch</button>
              </div>
              {loading ? <p>Loading...</p> : (
                <>
                  <table className="table">
                    <thead>
                      <tr><th>Batch #</th><th>Medicine</th><th>Stock</th><th>Expiry</th><th>Selling price</th></tr>
                    </thead>
                    <tbody>
                      {batchList.map((b) => (
                        <tr key={b.id} className={selectedBatch?.id === b.id ? 'row-selected' : ''} onClick={() => handleSelectBatch(b.id)}>
                          <td>{b.batch_number}</td>
                          <td>{b.medicine_name ?? `ID ${b.medicine}`}</td>
                          <td>{b.stock_quantity}</td>
                          <td>{b.expiry_date ?? '-'}</td>
                          <td>{b.selling_price ?? '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {batchList.length === 0 && <p className="muted">No batches.</p>}
                </>
              )}
            </div>
            <div className="panel">
              {showAddBatch ? (
                <div>
                  <h3>Add batch</h3>
                  <form className="form" onSubmit={handleCreateBatch}>
                    {batchForm && (
                      <>
                        <label>Medicine *</label>
                        <select value={batchForm.medicine ?? ''} onChange={(e) => setBatchForm((f) => (f ? { ...f, medicine: Number(e.target.value) } : null))} required>
                          {medicines.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.sku})</option>)}
                        </select>
                        <label>Batch number *</label>
                        <input value={batchForm.batch_number ?? ''} onChange={(e) => setBatchForm((f) => (f ? { ...f, batch_number: e.target.value } : null))} required />
                        <label>Manufacturer</label>
                        <input value={batchForm.manufacturer ?? ''} onChange={(e) => setBatchForm((f) => (f ? { ...f, manufacturer: e.target.value } : null))} />
                        <div className="form-row">
                          <label>Manufacture date <input type="date" value={batchForm.manufacture_date ?? ''} onChange={(e) => setBatchForm((f) => (f ? { ...f, manufacture_date: e.target.value } : null))} /></label>
                          <label>Expiry date <input type="date" value={batchForm.expiry_date ?? ''} onChange={(e) => setBatchForm((f) => (f ? { ...f, expiry_date: e.target.value } : null))} /></label>
                        </div>
                        <label>Location code</label>
                        <input value={batchForm.location_code ?? ''} onChange={(e) => setBatchForm((f) => (f ? { ...f, location_code: e.target.value } : null))} />
                        <label>Stock quantity *</label>
                        <input type="number" min={0} value={batchForm.stock_quantity ?? ''} onChange={(e) => setBatchForm((f) => (f ? { ...f, stock_quantity: Number(e.target.value) || 0 } : null))} required />
                        <div className="form-row">
                          <label>Purchase price <input value={batchForm.purchase_price ?? ''} onChange={(e) => setBatchForm((f) => (f ? { ...f, purchase_price: e.target.value } : null))} /></label>
                          <label>Selling price <input value={batchForm.selling_price ?? ''} onChange={(e) => setBatchForm((f) => (f ? { ...f, selling_price: e.target.value } : null))} /></label>
                        </div>
                        <div className="form-actions">
                          <button type="submit" className="button primary btn-icon" disabled={saving}><Save size={16} /> Create</button>
                          <button type="button" className="button btn-icon" onClick={() => { setShowAddBatch(false); setBatchForm(null); }}><X size={16} /> Cancel</button>
                        </div>
                      </>
                    )}
                  </form>
                </div>
              ) : selectedBatch && batchForm ? (
                <div>
                  <h3>Edit batch</h3>
                  <form className="form" onSubmit={(e) => { e.preventDefault(); void handleSaveBatch(); }}>
                    <label>Medicine</label>
                    <select value={batchForm.medicine ?? ''} onChange={(e) => setBatchForm((f) => (f ? { ...f, medicine: Number(e.target.value) } : null))}>
                      {medicines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                    <label>Batch number</label>
                    <input value={batchForm.batch_number ?? ''} onChange={(e) => setBatchForm((f) => (f ? { ...f, batch_number: e.target.value } : null))} />
                    <label>Manufacturer</label>
                    <input value={batchForm.manufacturer ?? ''} onChange={(e) => setBatchForm((f) => (f ? { ...f, manufacturer: e.target.value } : null))} />
                    <div className="form-row">
                      <label>Manufacture date <input type="date" value={batchForm.manufacture_date ?? ''} onChange={(e) => setBatchForm((f) => (f ? { ...f, manufacture_date: e.target.value } : null))} /></label>
                      <label>Expiry date <input type="date" value={batchForm.expiry_date ?? ''} onChange={(e) => setBatchForm((f) => (f ? { ...f, expiry_date: e.target.value } : null))} /></label>
                    </div>
                    <label>Location code</label>
                    <input value={batchForm.location_code ?? ''} onChange={(e) => setBatchForm((f) => (f ? { ...f, location_code: e.target.value } : null))} />
                    <label>Stock quantity</label>
                    <input type="number" min={0} value={batchForm.stock_quantity ?? ''} onChange={(e) => setBatchForm((f) => (f ? { ...f, stock_quantity: Number(e.target.value) || 0 } : null))} />
                    <div className="form-row">
                      <label>Purchase price <input value={batchForm.purchase_price ?? ''} onChange={(e) => setBatchForm((f) => (f ? { ...f, purchase_price: e.target.value } : null))} /></label>
                      <label>Selling price <input value={batchForm.selling_price ?? ''} onChange={(e) => setBatchForm((f) => (f ? { ...f, selling_price: e.target.value } : null))} /></label>
                    </div>
                    <div className="form-actions">
                      <button type="submit" className="button primary btn-icon" disabled={saving}><Save size={16} /> Save</button>
                      <button type="button" className="button danger btn-icon" onClick={() => void handleDeleteBatch()} disabled={saving}><Trash2 size={16} /> Delete</button>
                      <button type="button" className="button btn-icon" onClick={() => { setSelectedBatch(null); setBatchForm(null); }} disabled={saving}><X size={16} /> Clear</button>
                    </div>
                  </form>
                </div>
              ) : (
                <p className="muted">Select a batch or add one.</p>
              )}
            </div>
          </div>
        </>
      )}

      {/* Salts tab */}
      {tab === 'salts' && (
        <div className="split">
          <div className="panel">
            <div className="panel-header-row">
              <h3>Salts</h3>
            </div>
            <table className="table">
              <thead><tr><th>Name</th><th>Description</th></tr></thead>
              <tbody>
                {saltList.map((s) => (
                  <tr key={s.id} className={selectedSalt?.id === s.id ? 'row-selected' : ''} onClick={() => { setSelectedSalt(s); setSaltForm({ name: s.name, description: s.description ?? '' }); }}>
                    <td>{s.name}</td>
                    <td>{s.description ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {saltList.length === 0 && <p className="muted">No salts.</p>}
            <div className="panel subsection">
              <h4>Add salt</h4>
              <form className="form" onSubmit={handleCreateSalt}>
                <label>Name</label>
                <input value={newSaltForm.name} onChange={(e) => setNewSaltForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Paracetamol" />
                <label>Description</label>
                <input value={newSaltForm.description} onChange={(e) => setNewSaltForm((f) => ({ ...f, description: e.target.value }))} placeholder="e.g. Antipyretic" />
                <button type="submit" className="button primary btn-icon" disabled={saving}><Save size={16} /> Create</button>
              </form>
            </div>
          </div>
          <div className="panel">
            <h3>Edit salt</h3>
            {selectedSalt ? (
              <form className="form" onSubmit={(e) => { e.preventDefault(); void handleSaveSalt(); }}>
                <label>Name</label>
                <input value={saltForm.name} onChange={(e) => setSaltForm((f) => ({ ...f, name: e.target.value }))} />
                <label>Description</label>
                <input value={saltForm.description} onChange={(e) => setSaltForm((f) => ({ ...f, description: e.target.value }))} />
                <div className="form-actions">
                  <button type="submit" className="button primary btn-icon" disabled={saving}><Save size={16} /> Save</button>
                  <button type="button" className="button danger btn-icon" onClick={() => void handleDeleteSalt()} disabled={saving}><Trash2 size={16} /> Delete</button>
                </div>
              </form>
            ) : (
              <p className="muted">Select a salt.</p>
            )}
          </div>
        </div>
      )}

      {/* Categories tab - keep same as before */}
      {tab === 'categories' && (
        <div className="split">
          <div className="panel">
            <div className="panel-header-row"><h3>Categories</h3></div>
            <table className="table">
              <thead><tr><th>Name</th><th>Description</th></tr></thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id} className={selectedCategory?.id === c.id ? 'row-selected' : ''} onClick={() => { setSelectedCategory(c); setCategoryForm({ name: c.name, description: c.description ?? '' }); }}>
                    <td>{c.name}</td>
                    <td>{c.description ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {categories.length === 0 && <p className="muted">No categories.</p>}
            <div className="panel subsection">
              <h4>Add category</h4>
              <form className="form" onSubmit={handleCreateCategory}>
                <label>Name</label>
                <input value={newCategoryForm.name} onChange={(e) => setNewCategoryForm((f) => ({ ...f, name: e.target.value }))} />
                <label>Description</label>
                <input value={newCategoryForm.description} onChange={(e) => setNewCategoryForm((f) => ({ ...f, description: e.target.value }))} />
                <button type="submit" className="button primary btn-icon" disabled={saving}><Save size={16} /> Create</button>
              </form>
            </div>
          </div>
          <div className="panel">
            <h3>Edit category</h3>
            {selectedCategory ? (
              <form className="form" onSubmit={(e) => { e.preventDefault(); void handleSaveCategory(); }}>
                <label>Name</label>
                <input value={categoryForm.name} onChange={(e) => setCategoryForm((f) => ({ ...f, name: e.target.value }))} />
                <label>Description</label>
                <input value={categoryForm.description} onChange={(e) => setCategoryForm((f) => ({ ...f, description: e.target.value }))} />
                <div className="form-actions">
                  <button type="submit" className="button primary btn-icon" disabled={saving}><Save size={16} /> Save</button>
                  <button type="button" className="button danger btn-icon" onClick={() => void handleDeleteCategory()} disabled={saving}><Trash2 size={16} /> Delete</button>
                </div>
              </form>
            ) : <p className="muted">Select a category.</p>}
          </div>
        </div>
      )}

      {/* Companies tab */}
      {tab === 'companies' && (
        <div className="split">
          <div className="panel">
            <div className="panel-header-row"><h3>Companies</h3></div>
            <table className="table">
              <thead><tr><th>Name</th></tr></thead>
              <tbody>
                {companies.map((c) => (
                  <tr key={c.id} className={selectedCompany?.id === c.id ? 'row-selected' : ''} onClick={() => { setSelectedCompany(c); setCompanyForm({ name: c.name }); }}>
                    <td>{c.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {companies.length === 0 && <p className="muted">No companies.</p>}
            <div className="panel subsection">
              <h4>Add company</h4>
              <form className="form" onSubmit={handleCreateCompany}>
                <label>Name</label>
                <input value={newCompanyForm.name} onChange={(e) => setNewCompanyForm({ name: e.target.value })} />
                <button type="submit" className="button primary btn-icon" disabled={saving}><Save size={16} /> Create</button>
              </form>
            </div>
          </div>
          <div className="panel">
            <h3>Edit company</h3>
            {selectedCompany ? (
              <form className="form" onSubmit={(e) => { e.preventDefault(); void handleSaveCompany(); }}>
                <label>Name</label>
                <input value={companyForm.name} onChange={(e) => setCompanyForm({ name: e.target.value })} />
                <div className="form-actions">
                  <button type="submit" className="button primary btn-icon" disabled={saving}><Save size={16} /> Save</button>
                  <button type="button" className="button danger btn-icon" onClick={() => void handleDeleteCompany()} disabled={saving}><Trash2 size={16} /> Delete</button>
                </div>
              </form>
            ) : <p className="muted">Select a company.</p>}
          </div>
        </div>
      )}

      {/* Stock Bill tab */}
      {tab === 'stock_bill' && (
        <>
          <div className="panel">
            <h3>Upload wholesaler bill (PDF)</h3>
            <p className="muted" style={{ marginBottom: '0.75rem' }}>
              Upload a stock bill PDF to parse line items and update inventory (batches updated or created, new products if needed).
            </p>
            <form className="form" onSubmit={handleStockBillUpload} style={{ maxWidth: '480px' }}>
              <label>
                PDF file
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  required
                />
              </label>
              <label>
                Default category (for new products)
                <select
                  value={stockBillDefaultCategoryId}
                  onChange={(e) => setStockBillDefaultCategoryId(e.target.value === '' ? '' : Number(e.target.value))}
                >
                  <option value="">— None —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
              <div className="form-actions">
                <button type="submit" className="button primary btn-icon" disabled={stockBillUploading}>
                  <Upload size={16} />
                  {stockBillUploading ? 'Uploading...' : 'Upload'}
                </button>
                <button type="button" className="button btn-icon" onClick={() => void loadStockBillUploads()} disabled={stockBillUploading}>
                  <RefreshCw size={16} />
                  Refresh list
                </button>
              </div>
            </form>
          </div>
          <div className="split">
            <div className="panel">
              <div className="panel-header-row">
                <h3>Upload history</h3>
              </div>
              {stockBillUploads.length === 0 ? (
                <p className="muted">No uploads yet.</p>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Status</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockBillUploads.map((u) => (
                      <tr
                        key={u.id}
                        className={selectedStockBillUpload?.id === u.id ? 'row-selected' : ''}
                        onClick={() => handleSelectStockBillUpload(u.id)}
                      >
                        <td>{u.id}</td>
                        <td>{u.status}</td>
                        <td>{u.created_at ? new Date(u.created_at).toLocaleString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="panel">
              <h3>Upload detail</h3>
              {selectedStockBillUpload ? (
                <div>
                  <p><strong>Status:</strong> {selectedStockBillUpload.status}</p>
                  {selectedStockBillUpload.result_summary && (
                    <div className="panel subsection">
                      <h4>Result summary</h4>
                      <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                        <li>Lines processed: {selectedStockBillUpload.result_summary.lines_processed}</li>
                        <li>Batches updated: {selectedStockBillUpload.result_summary.batches_updated}</li>
                        <li>Batches created: {selectedStockBillUpload.result_summary.batches_created}</li>
                        <li>Products created: {selectedStockBillUpload.result_summary.products_created}</li>
                      </ul>
                      {selectedStockBillUpload.result_summary.errors?.length > 0 && (
                        <div style={{ marginTop: '0.5rem' }}>
                          <strong>Errors:</strong>
                          <ul style={{ margin: '0.25rem 0 0 1.25rem', padding: 0 }}>
                            {selectedStockBillUpload.result_summary.errors.map((err, i) => (
                              <li key={i} style={{ color: '#b91c1c' }}>{err}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                  {selectedStockBillUpload.errors && selectedStockBillUpload.errors.length > 0 && (
                    <div className="panel subsection">
                      <h4>Errors</h4>
                      <ul style={{ margin: 0, paddingLeft: '1.25rem', color: '#b91c1c' }}>
                        {selectedStockBillUpload.errors.map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {selectedStockBillUpload.parsed_lines && selectedStockBillUpload.parsed_lines.length > 0 && (
                    <div className="panel subsection">
                      <h4>Parsed lines ({selectedStockBillUpload.parsed_lines.length})</h4>
                      <div style={{ overflowX: 'auto', maxHeight: '280px', overflowY: 'auto' }}>
                        <table className="table">
                          <thead>
                            <tr>
                              {Object.keys(selectedStockBillUpload.parsed_lines[0] || {}).map((k) => (
                                <th key={k}>{k}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {selectedStockBillUpload.parsed_lines.map((row, idx) => (
                              <tr key={idx}>
                                {Object.values(row).map((v, i) => (
                                  <td key={i}>{typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="muted">Select an upload to view details.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
