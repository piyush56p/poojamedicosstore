import React, { useEffect, useMemo, useState } from 'react';
import {
  RefreshCw,
  Trash2,
  Plus,
  Save,
  X,
  ArrowRight,
  Printer,
  FileDown,
  Search,
  Calendar,
  Eye,
  MoreHorizontal
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  getOrders,
  getOrder,
  patchOrder,
  createOrder,
  deleteOrder,
  updateOrderStatus,
  getCustomers,
  getOrderBillPrintUrl,
  getOrderReceiptPrintUrl,
  getOrderBillDownloadUrl,
  getOrderReceiptDownloadUrl
} from '../api/admin';
import type { BillingOrderWritePayload, Customer, Order, OrderStatus } from '../types';

type NewOrderForm = {
  customer_id: number | '';
  shipping_address: string;
  city: string;
  state: string;
  pincode: string;
  payment_mode?: string;
  patient_name: string;
  doctor_name: string;
  items: Array<{ product_id: number; quantity: number }>;
};

const emptyNewOrder: NewOrderForm = {
  customer_id: '',
  shipping_address: '',
  city: '',
  state: '',
  pincode: '',
  payment_mode: 'PREPAID',
  patient_name: '',
  doctor_name: '',
  items: [{ product_id: 0, quantity: 1 }]
};

/** Order status rule (admin): PENDING -> APPROVED -> DISPATCHED -> DELIVERED */
const STATUS_FLOW: OrderStatus[] = ['PENDING', 'APPROVED', 'DISPATCHED', 'DELIVERED'];

const PAYMENT_MODES = ['PREPAID', 'COD', 'ONLINE'] as const;

type EditOrderItem = {
  product_id: number | '';
  item_name: string;
  quantity: number;
  mrp: string;
  lot: string;
  exp: string;
  hsn: string;
  gst: string;
  cgst: string;
  sgst: string;
  net: string;
};

/** Full-screen new order (invoice-style) visibility */
const useNewOrderFullscreen = () => {
  const [show, setShow] = useState(false);
  return [show, () => setShow(true), () => setShow(false)] as const;
};

function formatINR(value: unknown): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '—';
  return `₹${n.toFixed(2)}`;
}

export const OrdersPage: React.FC = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selected, setSelected] = useState<Order | null>(null);
  const [editItems, setEditItems] = useState<EditOrderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newOrder, setNewOrder] = useState<NewOrderForm>(emptyNewOrder);
  const [showNewOrderFullscreen, openNewOrderFullscreen, closeNewOrderFullscreen] = useNewOrderFullscreen();
  const [doctorNameForOrder, setDoctorNameForOrder] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'ALL'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // New order is now a dedicated page (/orders/new), not a modal.

  useEffect(() => {
    if (!selected) return;
    if (!selected.items?.length) {
      setEditItems([{
        product_id: '',
        item_name: '',
        quantity: 1,
        mrp: '',
        lot: '',
        exp: '',
        hsn: '',
        gst: '',
        cgst: '',
        sgst: '',
        net: ''
      }]);
      return;
    }
    setEditItems(
      selected.items.map((i) => ({
        product_id: i.product_id ?? i.product ?? '',
        item_name: i.item_name ?? i.product_name ?? '',
        quantity: i.quantity ?? 1,
        mrp: i.mrp ?? '',
        lot: i.lot ?? '',
        exp: i.exp ?? '',
        hsn: i.hsn ?? '',
        gst: i.gst ?? '',
        cgst: i.cgst ?? '',
        sgst: i.sgst ?? '',
        net: i.net ?? ''
      }))
    );
  }, [selected?.id]);

  const loadOrders = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getOrders();
      setOrders(Array.isArray(data) ? data : []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadCustomers = async () => {
    try {
      const data = await getCustomers();
      setCustomers(Array.isArray(data) ? data : []);
    } catch {
      // ignore in orders context
    }
  };

  useEffect(() => {
    void loadOrders();
    void loadCustomers();
  }, []);

  const handleSelect = async (id: number) => {
    try {
      setError(null);
      const data = await getOrder(id);
      setSelected(data != null && typeof data === 'object' ? data : null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleFieldChange = (field: keyof Order, value: unknown) => {
    if (!selected) return;
    setSelected({ ...selected, [field]: value } as Order);
  };

  const validEditItems = editItems.filter(
    (i) => i.quantity > 0 && i.item_name.trim().length > 0
  );

  const pageSize = 10;

  const filteredOrders = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const fromDate = dateFrom ? new Date(dateFrom) : null;
    const toDate = dateTo ? new Date(dateTo) : null;

    return orders.filter((o) => {
      if (statusFilter !== 'ALL' && o.status !== statusFilter) return false;

      if (term) {
        const orderNumber = (o.order_number ?? String(o.id ?? '')).toString().toLowerCase();
        const customerName = (o.customer_name ?? '').toLowerCase();
        if (!orderNumber.includes(term) && !customerName.includes(term)) {
          return false;
        }
      }

      if (fromDate || toDate) {
        if (!o.created_at) return false;
        const createdDate = new Date(o.created_at);
        if (fromDate && createdDate < fromDate) return false;
        if (toDate) {
          const endOfDay = new Date(toDate);
          endOfDay.setHours(23, 59, 59, 999);
          if (createdDate > endOfDay) return false;
        }
      }

      return true;
    });
  }, [orders, statusFilter, searchTerm, dateFrom, dateTo]);

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, searchTerm, dateFrom, dateTo, orders.length]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize));
  const pagedOrders = filteredOrders.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const formatStatusLabel = (status?: OrderStatus | string) => {
    if (!status) return 'Pending';
    switch (status) {
      case 'PENDING':
        return 'Pending';
      case 'APPROVED':
        return 'Approved';
      case 'DISPATCHED':
        return 'Dispatched';
      case 'DELIVERED':
        return 'Delivered';
      default:
        return String(status);
    }
  };

  const getStatusClassName = (status?: OrderStatus | string) => {
    const normalized = String(status ?? 'PENDING').toLowerCase();
    if (normalized === 'pending') return 'order-status order-status-pending';
    if (normalized === 'approved' || normalized === 'dispatched') {
      return 'order-status order-status-approved';
    }
    if (normalized === 'delivered') return 'order-status order-status-delivered';
    if (normalized === 'cancelled' || normalized === 'canceled') {
      return 'order-status order-status-cancelled';
    }
    return 'order-status';
  };

  const handleOrderSave = async () => {
    if (!selected) return;
    if (validEditItems.length === 0) {
      setError('Add at least one item with product ID and quantity.');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const payload: BillingOrderWritePayload = {
        customer_id: selected.customer_id,
        payment_mode: selected.payment_mode ?? 'PREPAID',
        shipping_address: selected.shipping_address ?? '',
        city: selected.city ?? '',
        state: selected.state ?? '',
        pincode: selected.pincode ?? '',
        patient_name: selected.patient_name ?? selected.customer_name ?? '',
        patient_address: selected.patient_address ?? selected.shipping_address ?? '',
        patient_doctor: selected.patient_doctor ?? doctorNameForOrder ?? '',
        discount_amount: selected.discount_amount ?? '',
        taxable_amount: selected.taxable_amount ?? '',
        gst_amount: selected.gst_amount ?? '',
        cgst_amount: selected.cgst_amount ?? '',
        sgst_amount: selected.sgst_amount ?? '',
        cess_amount: selected.cess_amount ?? '',
        igst_amount: selected.igst_amount ?? '',
        payable_amount: selected.payable_amount ?? selected.total_amount ?? '',
        items: validEditItems.map((i) => ({
          product_id: typeof i.product_id === 'number' && i.product_id > 0 ? i.product_id : undefined,
          item_name: i.item_name,
          quantity: i.quantity,
          mrp: i.mrp || undefined,
          lot: i.lot || undefined,
          exp: i.exp || undefined,
          hsn: i.hsn || undefined,
          gst: i.gst || undefined,
          cgst: i.cgst || undefined,
          sgst: i.sgst || undefined,
          net: i.net || undefined
        }))
      };
      const updated = await patchOrder(selected.id, payload);
      const next = updated ?? selected;
      setSelected(next);
      if (next?.items?.length) {
        setEditItems(
          next.items.map((i) => ({
            product_id: i.product_id ?? i.product ?? '',
            item_name: i.item_name ?? i.product_name ?? '',
            quantity: i.quantity ?? 1,
            mrp: i.mrp ?? '',
            lot: i.lot ?? '',
            exp: i.exp ?? '',
            hsn: i.hsn ?? '',
            gst: i.gst ?? '',
            cgst: i.cgst ?? '',
            sgst: i.sgst ?? '',
            net: i.net ?? ''
          }))
        );
      }
      void loadOrders();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleEditItemChange = (
    index: number,
    field: keyof EditOrderItem,
    value: string | number
  ) => {
    setEditItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const addEditItem = () => {
    setEditItems((prev) => [...prev, {
      product_id: '',
      item_name: '',
      quantity: 1,
      mrp: '',
      lot: '',
      exp: '',
      hsn: '',
      gst: '',
      cgst: '',
      sgst: '',
      net: ''
    }]);
  };

  const removeEditItem = (index: number) => {
    setEditItems((prev) => prev.filter((_, i) => i !== index));
  };

  const nextStatus: OrderStatus | null = useMemo(() => {
    if (!selected) return null;
    const idx = STATUS_FLOW.indexOf(selected.status);
    if (idx === -1 || idx === STATUS_FLOW.length - 1) return null;
    return STATUS_FLOW[idx + 1];
  }, [selected]);

  const handleAdvanceStatus = async () => {
    if (!selected || !nextStatus) return;
    try {
      setSaving(true);
      setError(null);
      const updated = await updateOrderStatus(selected.id, { status: nextStatus });
      setSelected(updated ?? selected);
      void loadOrders();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteOrder = async () => {
    if (!selected) return;
    if (!window.confirm(`Delete order #${selected.id}?`)) return;
    try {
      setSaving(true);
      setError(null);
      await deleteOrder(selected.id);
      setSelected(null);
      void loadOrders();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleNewOrderChange = (field: keyof NewOrderForm, value: unknown) => {
    setNewOrder((prev) => ({ ...prev, [field]: value } as NewOrderForm));
  };

  const handleNewOrderItemChange = (
    index: number,
    field: 'product_id' | 'quantity',
    value: number
  ) => {
    setNewOrder((prev) => {
      const items = [...prev.items];
      items[index] = { ...items[index], [field]: value };
      return { ...prev, items };
    });
  };

  const addNewOrderItem = () => {
    setNewOrder((prev) => ({
      ...prev,
      items: [...prev.items, { product_id: 0, quantity: 1 }]
    }));
  };

  const removeNewOrderItem = (index: number) => {
    setNewOrder((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const handleCreateOrder = async () => {
    const cid = newOrder.customer_id;
    if (cid === '' || typeof cid !== 'number') return;
    const validItems = newOrder.items.filter(
      (i) => typeof i.product_id === 'number' && i.product_id > 0 && i.quantity > 0
    );
    if (validItems.length === 0) return;
    try {
      setCreating(true);
      setError(null);
      await createOrder({
        customer_id: cid,
        payment_mode: newOrder.payment_mode ?? 'PREPAID',
        shipping_address: newOrder.shipping_address || undefined,
        city: newOrder.city || undefined,
        state: newOrder.state || undefined,
        pincode: newOrder.pincode || undefined,
        patient_name: newOrder.patient_name || undefined,
        patient_address: newOrder.shipping_address || undefined,
        patient_doctor: newOrder.doctor_name || undefined,
        items: validItems.map((i) => ({
          product_id: i.product_id,
          item_name: `ITEM ${i.product_id}`,
          quantity: i.quantity
        }))
      });
      setNewOrder(emptyNewOrder);
      void loadOrders();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const openNewOrder = () => navigate('/orders/new');

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Orders</h2>
          <div className="tabs" style={{ marginTop: '0.35rem' }}>
            {(['ALL', 'PENDING', 'APPROVED', 'DISPATCHED', 'DELIVERED'] as const).map(
              (tab) => (
                <button
                  key={tab}
                  type="button"
                  className={`tab ${statusFilter === tab ? 'active' : ''}`}
                  onClick={() =>
                    setStatusFilter(tab === 'ALL' ? 'ALL' : (tab as OrderStatus))
                  }
                >
                  {tab === 'ALL' ? 'All Orders' : formatStatusLabel(tab as OrderStatus)}
                </button>
              )
            )}
          </div>
        </div>
        <div className="page-header-actions">
          <button
            type="button"
            className="button btn-icon"
            onClick={() => {
              // Placeholder export: in future can hook to real export endpoint.
              window.print();
            }}
          >
            <FileDown size={16} />
            Export
          </button>
          <button
            type="button"
            className="button primary btn-icon"
            onClick={() => navigate('/orders/new')}
          >
            <Plus size={18} />
            Create New Order
          </button>
          <button className="button btn-icon" onClick={loadOrders} disabled={loading}>
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="filters-panel">
        <div className="filters-row">
          <div className="search-wrap">
            <Search size={16} />
            <input
              type="text"
              placeholder="Search by order or customer..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <label>
            Date from
            <div className="search-wrap">
              <Calendar size={16} />
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
          </label>
          <label>
            Date to
            <div className="search-wrap">
              <Calendar size={16} />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </label>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header-row">
          <h3>All Orders</h3>
        </div>
        {loading ? (
          <p>Loading...</p>
        ) : (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Customer Name</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedOrders.map((o) => (
                  <tr
                    key={o.id}
                    onClick={() => navigate(`/orders/new/${o.id}`)}
                  >
                    <td>{o.order_number ?? `#${o.id}`}</td>
                    <td>{o.customer_name ?? `ID ${o.customer_id}`}</td>
                    <td>{formatINR(o.total_amount)}</td>
                    <td>
                      <span className={getStatusClassName(o.status)}>
                        {formatStatusLabel(o.status)}
                      </span>
                    </td>
                    <td>
                      {o.created_at
                        ? new Date(o.created_at).toLocaleDateString('en-GB')
                        : '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="button btn-icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/orders/new/${o.id}`);
                        }}
                      >
                        <Eye size={14} />
                        View
                      </button>
                      <button
                        type="button"
                        className="button btn-icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/orders/new/${o.id}`);
                        }}
                        style={{ marginLeft: '0.35rem' }}
                      >
                        <Save size={14} />
                        Edit
                      </button>
                      <button
                        type="button"
                        className="button btn-icon"
                        onClick={(e) => e.stopPropagation()}
                        style={{ marginLeft: '0.35rem' }}
                        aria-label="More actions"
                      >
                        <MoreHorizontal size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
                {pagedOrders.length === 0 && !loading && (
                  <tr>
                    <td colSpan={6} className="muted">
                      No orders found for the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="pagination">
              <div className="pagination-info">
                Showing{' '}
                {filteredOrders.length === 0
                  ? 0
                  : (currentPage - 1) * pageSize + 1}{' '}
                -
                {Math.min(currentPage * pageSize, filteredOrders.length)} of{' '}
                {filteredOrders.length}{' '}
                orders
              </div>
              <div>
                <button
                  type="button"
                  className="button btn-icon"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  Prev
                </button>
                <button
                  type="button"
                  className="button btn-icon"
                  disabled={currentPage === totalPages}
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  style={{ marginLeft: '0.35rem' }}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="panel subsection">
        <h3>Order Details</h3>
          {selected ? (
            <>
              <form
                className="form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleOrderSave();
                }}
              >
                <div className="form-row">
                  <label>
                    Order #
                    <input value={selected.order_number ?? ''} readOnly />
                  </label>
                  <label>
                    Status
                    <input value={selected.status} readOnly />
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    Patient Name
                    <input
                      value={selected.patient_name ?? selected.customer_name ?? ''}
                      onChange={(e) => handleFieldChange('patient_name', e.target.value)}
                      placeholder="Patient name"
                    />
                  </label>
                  <label>
                    Doctor Name
                    <input
                      value={selected.patient_doctor ?? doctorNameForOrder}
                      onChange={(e) => {
                        setDoctorNameForOrder(e.target.value);
                        handleFieldChange('patient_doctor', e.target.value);
                      }}
                      placeholder="e.g. Dr Sharma"
                    />
                  </label>
                  <label>
                    Date
                    <input
                      value={selected.created_at ? new Date(selected.created_at).toLocaleDateString('en-CA') : '—'}
                      readOnly
                    />
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    Customer ID
                    <input
                      type="number"
                      value={selected.customer_id}
                      onChange={(e) =>
                        handleFieldChange('customer_id', Number(e.target.value) || 0)
                      }
                    />
                  </label>
                  <label>
                    Customer name
                    <input value={selected.customer_name ?? ''} readOnly />
                  </label>
                  <label>
                    Payment mode
                    <select
                      value={selected.payment_mode ?? 'PREPAID'}
                      onChange={(e) =>
                        handleFieldChange('payment_mode', e.target.value)
                      }
                    >
                      {PAYMENT_MODES.map((pm) => (
                        <option key={pm} value={pm}>
                          {pm}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Total
                    <input value={selected.total_amount ?? ''} readOnly />
                  </label>
                </div>
                <label>
                  Patient/Shipping address
                  <input
                    value={selected.patient_address ?? selected.shipping_address ?? ''}
                    onChange={(e) => {
                      handleFieldChange('patient_address', e.target.value);
                      handleFieldChange('shipping_address', e.target.value);
                    }}
                  />
                </label>
                <div className="form-row">
                  <label>
                    City
                    <input
                      value={selected.city}
                      onChange={(e) => handleFieldChange('city', e.target.value)}
                    />
                  </label>
                  <label>
                    State
                    <input
                      value={selected.state}
                      onChange={(e) => handleFieldChange('state', e.target.value)}
                    />
                  </label>
                  <label>
                    Pincode
                    <input
                      value={selected.pincode}
                      onChange={(e) => handleFieldChange('pincode', e.target.value)}
                    />
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    Discount
                    <input value={selected.discount_amount ?? ''} onChange={(e) => handleFieldChange('discount_amount', e.target.value)} />
                  </label>
                  <label>
                    Taxable
                    <input value={selected.taxable_amount ?? ''} onChange={(e) => handleFieldChange('taxable_amount', e.target.value)} />
                  </label>
                  <label>
                    GST
                    <input value={selected.gst_amount ?? ''} onChange={(e) => handleFieldChange('gst_amount', e.target.value)} />
                  </label>
                  <label>
                    CGST
                    <input value={selected.cgst_amount ?? ''} onChange={(e) => handleFieldChange('cgst_amount', e.target.value)} />
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    SGST
                    <input value={selected.sgst_amount ?? ''} onChange={(e) => handleFieldChange('sgst_amount', e.target.value)} />
                  </label>
                  <label>
                    CESS
                    <input value={selected.cess_amount ?? ''} onChange={(e) => handleFieldChange('cess_amount', e.target.value)} />
                  </label>
                  <label>
                    IGST
                    <input value={selected.igst_amount ?? ''} onChange={(e) => handleFieldChange('igst_amount', e.target.value)} />
                  </label>
                  <label>
                    Payable
                    <input value={selected.payable_amount ?? ''} onChange={(e) => handleFieldChange('payable_amount', e.target.value)} />
                  </label>
                </div>
                <div className="order-items">
                  <h4>Edit items (billing payload)</h4>
                  {editItems.map((item, idx) => (
                    <div key={idx} className="form-row">
                      <label>
                        Product ID
                        <input
                          type="number"
                          value={item.product_id || ''}
                          onChange={(e) =>
                            handleEditItemChange(
                              idx,
                              'product_id',
                              e.target.value === '' ? '' : Number(e.target.value) || ''
                            )
                          }
                        />
                      </label>
                      <label>
                        Item Name
                        <input
                          value={item.item_name}
                          onChange={(e) => handleEditItemChange(idx, 'item_name', e.target.value)}
                        />
                      </label>
                      <label>
                        Qty
                        <input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(e) =>
                            handleEditItemChange(
                              idx,
                              'quantity',
                              Number(e.target.value) || 1
                            )
                          }
                        />
                      </label>
                      <button
                        type="button"
                        className="button remove btn-icon"
                        onClick={() => removeEditItem(idx)}
                        disabled={editItems.length === 1}
                      >
                        <Trash2 size={14} />
                        Remove
                      </button>
                    </div>
                  ))}
                  {editItems.map((item, idx) => (
                    <div key={`meta-${idx}`} className="form-row">
                      <label><span>MRP</span><input value={item.mrp} onChange={(e) => handleEditItemChange(idx, 'mrp', e.target.value)} /></label>
                      <label><span>LOT</span><input value={item.lot} onChange={(e) => handleEditItemChange(idx, 'lot', e.target.value)} /></label>
                      <label><span>EXP</span><input value={item.exp} onChange={(e) => handleEditItemChange(idx, 'exp', e.target.value)} /></label>
                      <label><span>HSN</span><input value={item.hsn} onChange={(e) => handleEditItemChange(idx, 'hsn', e.target.value)} /></label>
                      <label><span>GST</span><input value={item.gst} onChange={(e) => handleEditItemChange(idx, 'gst', e.target.value)} /></label>
                      <label><span>CGST</span><input value={item.cgst} onChange={(e) => handleEditItemChange(idx, 'cgst', e.target.value)} /></label>
                      <label><span>SGST</span><input value={item.sgst} onChange={(e) => handleEditItemChange(idx, 'sgst', e.target.value)} /></label>
                      <label><span>NET</span><input value={item.net} onChange={(e) => handleEditItemChange(idx, 'net', e.target.value)} /></label>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="button btn-icon"
                    onClick={addEditItem}
                  >
                    <Plus size={16} />
                    Add item
                  </button>
                </div>
                <div className="form-actions">
                  <button className="button primary btn-icon" type="submit" disabled={saving}>
                    <Save size={16} />
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    type="button"
                    className="button danger btn-icon"
                    onClick={() => void handleDeleteOrder()}
                    disabled={saving}
                  >
                    <Trash2 size={16} />
                    Delete
                  </button>
                  <button
                    type="button"
                    className="button btn-icon"
                    onClick={() => setSelected(null)}
                    disabled={saving}
                  >
                    <X size={16} />
                    Clear
                  </button>
                </div>
              </form>
              <div className="panel">
                <h4>Status Progression</h4>
                <p>Current: {selected.status}</p>
                <div className="status-flow">
                  {STATUS_FLOW.map((s) => (
                    <span
                      key={s}
                      className={
                        'status-pill ' +
                        (s === selected.status
                          ? 'status-current'
                          : STATUS_FLOW.indexOf(s) < STATUS_FLOW.indexOf(selected.status)
                          ? 'status-done'
                          : '')
                      }
                    >
                      {s}
                    </span>
                  ))}
                </div>
                <button
                  className="button primary btn-icon"
                  disabled={!nextStatus || saving}
                  onClick={() => void handleAdvanceStatus()}
                >
                  <ArrowRight size={16} />
                  {nextStatus ? `Move to ${nextStatus}` : 'Completed'}
                </button>
              </div>
              <div className="panel">
                <h4>Bill &amp; Receipt</h4>
                <p className="form-row" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className="button btn-icon"
                    onClick={() => window.open(getOrderBillPrintUrl(selected.id, doctorNameForOrder || undefined), '_blank')}
                    title="Open printable bill in new tab (print dialog)"
                  >
                    <Printer size={16} />
                    Print Bill
                  </button>
                  <button
                    type="button"
                    className="button btn-icon"
                    onClick={() => window.open(getOrderReceiptPrintUrl(selected.id, doctorNameForOrder || undefined), '_blank')}
                    title="Open printable receipt in new tab (print dialog)"
                  >
                    <Printer size={16} />
                    Print Receipt
                  </button>
                  <button
                    type="button"
                    className="button btn-icon"
                    onClick={() => window.open(getOrderBillDownloadUrl(selected.id, doctorNameForOrder || undefined), '_blank')}
                    title="Download bill as PDF"
                  >
                    <FileDown size={16} />
                    Download Bill PDF
                  </button>
                  <button
                    type="button"
                    className="button btn-icon"
                    onClick={() => window.open(getOrderReceiptDownloadUrl(selected.id, doctorNameForOrder || undefined), '_blank')}
                    title="Download receipt as PDF"
                  >
                    <FileDown size={16} />
                    Download Receipt PDF
                  </button>
                </p>
              </div>
            </>
          ) : (
            <p>Select an order to view and edit.</p>
          )}
        </div>

      {/* New order moved to /orders/new */}
    </div>
  );
};

