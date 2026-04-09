import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Download, Plus, Save, Send, Trash2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { createOrder, downloadOrderBillPdf, getOrder, patchOrder, shareOrderBill } from '../api/admin';
import { getMedicines } from '../api/inventory';
import type { BillingOrderWritePayload, Medicine, Order } from '../types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type InvoiceLine = {
  item_desc: string;
  qty: number;
  mrp: string;
  lot: string;
  exp: string;
  hsn: string;
  gst: string;
  cgst: string;
  sgst: string;
  net: string;
  product_id: number | '';
};

type InvoiceTotals = {
  total: string;
  disc: string;
  taxable: string;
  gst: string;
  cgst: string;
  sgst: string;
  cess: string;
  igst: string;
  payable: string;
};

const emptyLine = (): InvoiceLine => ({
  item_desc: '',
  qty: 1,
  mrp: '',
  lot: '',
  exp: '',
  hsn: '',
  gst: '',
  cgst: '',
  sgst: '',
  net: '',
  product_id: ''
});

const emptyTotals: InvoiceTotals = {
  total: '',
  disc: '',
  taxable: '',
  gst: '',
  cgst: '',
  sgst: '',
  cess: '',
  igst: '',
  payable: ''
};

function formatDateForPdf(date: string): string {
  if (!date) return '';
  // Input from <input type="date"> is already YYYY-MM-DD
  return date;
}

function safeText(v: unknown): string {
  return String(v ?? '').trim();
}

function upperText(v: unknown): string {
  return safeText(v).toUpperCase();
}

function toNumber(v: string | number | undefined): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = Number(String(v ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

export const NewOrderPage: React.FC = () => {
  const navigate = useNavigate();
  const { orderId } = useParams();
  const editingOrderId = orderId ? Number(orderId) : null;
  const isEditMode = Number.isFinite(editingOrderId) && editingOrderId != null;
  const [creating, setCreating] = useState(false);
  const [sendingBill, setSendingBill] = useState(false);
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareResult, setShareResult] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareEmailEnabled, setShareEmailEnabled] = useState(true);
  const [shareWhatsappEnabled, setShareWhatsappEnabled] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [shareWhatsapp, setShareWhatsapp] = useState('');

  // Header fields
  const [billNo, setBillNo] = useState('SB-251206C01');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [patientName, setPatientName] = useState('');
  const [patientAddress, setPatientAddress] = useState('');
  const [doctorName, setDoctorName] = useState('');

  // Backend fields
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('');
  const [pincode, setPincode] = useState('');
  const [paymentMode, setPaymentMode] = useState('PREPAID');

  const [lines, setLines] = useState<InvoiceLine[]>([emptyLine()]);
  const [totals, setTotals] = useState<InvoiceTotals>(emptyTotals);
  const [medicineSuggestions, setMedicineSuggestions] = useState<Record<number, Medicine[]>>({});
  const [selectedMedicineByRow, setSelectedMedicineByRow] = useState<Record<number, Medicine | null>>({});

  useEffect(() => {
    if (!isEditMode || !editingOrderId) return;
    const loadOrder = async () => {
      try {
        setLoadingOrder(true);
        setError(null);
        const o: Order = await getOrder(editingOrderId);
        setBillNo(o.order_number ?? 'SB-251206C01');
        setInvoiceDate(o.created_at ? new Date(o.created_at).toISOString().slice(0, 10) : '');
        setPatientName(o.patient_name ?? o.customer_name ?? '');
        setPatientAddress(o.patient_address ?? o.shipping_address ?? '');
        setDoctorName(o.patient_doctor ?? '');
        setCity(o.city ?? '');
        setStateName(o.state ?? '');
        setPincode(o.pincode ?? '');
        setPaymentMode(String(o.payment_mode ?? 'PREPAID'));
        setTotals({
          total: o.total_amount ?? '',
          disc: o.discount_amount ?? '',
          taxable: o.taxable_amount ?? '',
          gst: o.gst_amount ?? '',
          cgst: o.cgst_amount ?? '',
          sgst: o.sgst_amount ?? '',
          cess: o.cess_amount ?? '',
          igst: o.igst_amount ?? '',
          payable: o.payable_amount ?? ''
        });
        const orderLines = (o.items ?? []).map((it) => ({
          item_desc: it.item_name ?? it.product_name ?? '',
          qty: it.quantity ?? 1,
          mrp: it.mrp ?? '',
          lot: it.lot ?? '',
          exp: it.exp ?? '',
          hsn: it.hsn ?? '',
          gst: it.gst ?? '',
          cgst: it.cgst ?? '',
          sgst: it.sgst ?? '',
          net: it.net ?? '',
          product_id: it.product_id ?? it.product ?? ''
        }));
        setLines(orderLines.length ? orderLines : [emptyLine()]);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoadingOrder(false);
      }
    };
    void loadOrder();
  }, [editingOrderId, isEditMode]);

  const canSubmit = useMemo(() => {
    const hasOneValid = lines.some((l) => l.item_desc.trim().length > 0 && Number(l.qty) > 0);
    return hasOneValid && !creating;
  }, [lines, creating]);

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);

  const removeLine = (idx: number) => {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  };

  const updateLine = <K extends keyof InvoiceLine>(idx: number, key: K, value: InvoiceLine[K]) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [key]: value } : l)));
  };

  const applyMedicineToRow = (idx: number, medicine: Medicine) => {
    setLines((prev) => prev.map((line, i) => {
      if (i !== idx) return line;
      const qty = Number(line.qty) || 1;
      const mrp = line.mrp || String(medicine.price ?? '');
      const existingNet = toNumber(line.net);
      const computedNet = existingNet > 0 ? line.net : (toNumber(mrp) * qty).toFixed(2);
      return {
        ...line,
        item_desc: medicine.name ?? line.item_desc,
        product_id: medicine.id ?? line.product_id,
        mrp,
        lot: line.lot || (medicine.batch_number ?? ''),
        net: computedNet
      };
    }));
    setSelectedMedicineByRow((prev) => ({ ...prev, [idx]: medicine }));
  };

  const handleItemDescChange = async (idx: number, value: string) => {
    updateLine(idx, 'item_desc', value);
    setSelectedMedicineByRow((prev) => ({ ...prev, [idx]: null }));
    const q = value.trim();
    if (q.length < 2) {
      setMedicineSuggestions((prev) => ({ ...prev, [idx]: [] }));
      return;
    }
    try {
      const data = await getMedicines({ search: q, page_size: 8 });
      const out = Array.isArray(data?.results) ? data.results : [];
      setMedicineSuggestions((prev) => ({ ...prev, [idx]: out }));
      const exact = out.find((m) => (m.name ?? '').trim().toLowerCase() === q.toLowerCase());
      if (exact) applyMedicineToRow(idx, exact);
    } catch {
      setMedicineSuggestions((prev) => ({ ...prev, [idx]: [] }));
    }
  };

  const handleItemDescBlur = (idx: number) => {
    const current = lines[idx];
    if (!current) return;
    const target = current.item_desc.trim().toLowerCase();
    if (!target) return;
    const match = (medicineSuggestions[idx] ?? []).find((m) => (m.name ?? '').trim().toLowerCase() === target);
    if (!match) return;
    applyMedicineToRow(idx, match);
  };

  useEffect(() => {
    const total = lines.reduce((sum, l) => sum + toNumber(l.net), 0);
    const discPct = Math.max(0, toNumber(totals.disc));
    const taxable = Math.max(0, total - (total * discPct) / 100);
    const zero = '0.00';
    setTotals((prev) => {
      const next: InvoiceTotals = {
        ...prev,
        total: total.toFixed(2),
        taxable: taxable.toFixed(2),
        gst: zero,
        cgst: zero,
        sgst: zero,
        cess: zero,
        igst: zero,
        payable: taxable.toFixed(2)
      };
      return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
    });
  }, [lines, totals.disc]);

  const handleCreate = async () => {
    try {
      setError(null);

      const items = lines
        .map((l) => ({
          product_id: Number(l.product_id) > 0 ? Number(l.product_id) : undefined,
          item_name: l.item_desc.trim(),
          quantity: Number(l.qty) || 0,
          mrp: l.mrp || undefined,
          lot: l.lot || undefined,
          exp: l.exp || undefined,
          hsn: l.hsn || undefined,
          gst: l.gst || undefined,
          cgst: l.cgst || undefined,
          sgst: l.sgst || undefined,
          net: l.net || undefined
        }))
        .filter((x) => x.quantity > 0 && x.item_name.length > 0);

      if (items.length === 0) {
        setError('Add at least one item (Item DESC and Qty).');
        return;
      }

      setCreating(true);
      const payload: BillingOrderWritePayload = {
        payment_mode: paymentMode,
        shipping_address: patientAddress || undefined,
        city: city || undefined,
        state: stateName || undefined,
        pincode: pincode || undefined,
        patient_name: patientName || undefined,
        patient_address: patientAddress || undefined,
        patient_doctor: doctorName || undefined,
        discount_amount: totals.disc || undefined,
        taxable_amount: totals.taxable || undefined,
        gst_amount: totals.gst || undefined,
        cgst_amount: totals.cgst || undefined,
        sgst_amount: totals.sgst || undefined,
        cess_amount: totals.cess || undefined,
        igst_amount: totals.igst || undefined,
        payable_amount: totals.payable || undefined,
        items
      };
      if (isEditMode && editingOrderId) {
        await patchOrder(editingOrderId, payload);
      } else {
        await createOrder(payload);
      }

      navigate('/orders');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const handleDownloadPdf = () => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 40;

    // Use Times family throughout for invoice look
    doc.setFont('times', 'normal');

    // Left header (shop)
    const leftX = margin;
    let y = 70;
    doc.setFontSize(12);
    doc.text('POOJA MEDICOS', leftX, y);
    doc.setFont('times', 'normal');
    doc.setFontSize(10);
    y += 14;
    doc.text('E-41, PANDAV NAGAR DELHI', leftX, y);
    y += 14;
    doc.text('PHONE NO. - 9953329226', leftX, y);
    y += 14;
    doc.text('DL36(1423)', leftX, y);
    y += 14;
    doc.text('07ACFPS2748Q1ZU', leftX, y);

    // Right header (patient)
    const rightLabelX = pageWidth - margin - 170;
    const rightValueX = pageWidth - margin;
    const rightBlockTop = 70;
    doc.setFont('times', 'bold');
    doc.setFontSize(10);
    doc.text('BILL NO.', rightLabelX, rightBlockTop, { align: 'right' });
    doc.text('DATE', rightLabelX, rightBlockTop + 14, { align: 'right' });
    doc.text('PATIENT', rightLabelX, rightBlockTop + 28, { align: 'right' });
    doc.text('DR.', rightLabelX, rightBlockTop + 42, { align: 'right' });
    doc.text('ADDRESS', rightLabelX, rightBlockTop + 56, { align: 'right' });

    doc.setFont('times', 'normal');
    doc.text(upperText(billNo), rightValueX, rightBlockTop, { align: 'right' });
    doc.text(upperText(formatDateForPdf(invoiceDate)), rightValueX, rightBlockTop + 14, { align: 'right' });
    doc.text(upperText(patientName), rightValueX, rightBlockTop + 28, { align: 'right' });
    doc.text(upperText(doctorName), rightValueX, rightBlockTop + 42, { align: 'right' });

    // Address (wrap)
    const addr = safeText(patientAddress);
    if (addr) {
      const addrLines = doc.splitTextToSize(upperText(addr), 155);
      doc.text(addrLines, rightValueX, rightBlockTop + 56, { align: 'right' });
    }

    // GST invoice heading just before item table
    doc.setFont('times', 'bold');
    doc.setFontSize(14);
    doc.text('GST INVOICE', pageWidth / 2, 138, { align: 'center' });

    // Table
    const body = lines
      .filter((l) => safeText(l.item_desc) || Number(l.qty) || safeText(l.lot) || safeText(l.exp) || safeText(l.net))
      .map((l) => ([
        upperText(l.item_desc),
        String(l.qty ?? ''),
        upperText(l.mrp),
        upperText(l.lot),
        upperText(l.exp),
        upperText(l.hsn),
        upperText(l.gst),
        upperText(l.cgst),
        upperText(l.sgst),
        upperText(l.net)
      ]));

    autoTable(doc, {
      startY: 150,
      head: [['Item DESC', 'QTY', 'MRP', 'LOT(BATCH NO)', 'EXP', 'HSN', 'GST', 'CGST', 'SGST', 'NET']],
      body,
      styles: { fontSize: 8, cellPadding: 4, valign: 'top' },
      headStyles: { fillColor: [243, 244, 246], textColor: [17, 24, 39] },
      margin: { left: margin, right: margin }
    });

    const lastY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 150;
    const totalsStartY = lastY + 16;

    // Full-width summary table (traditional invoice style)
    autoTable(doc, {
      startY: totalsStartY,
      margin: { left: margin, right: margin },
      head: [['TOTAL', 'DISC', 'TAXABLE', 'GST', 'CGST', 'SCGT', 'CESS', 'IGST', 'PAYABLE']],
      body: [[
        upperText(totals.total),
        upperText(totals.disc),
        upperText(totals.taxable),
        upperText(totals.gst),
        upperText(totals.cgst),
        upperText(totals.sgst), // field source is sgst; label shown as SCGT per request
        upperText(totals.cess),
        upperText(totals.igst),
        upperText(totals.payable)
      ]],
      styles: { fontSize: 9, cellPadding: 4, halign: 'right' },
      headStyles: { fillColor: [243, 244, 246], textColor: [17, 24, 39], halign: 'center' }
    });

    const totalsFinalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? (totalsStartY + 50);
    const termsY = totalsFinalY + 16;

    // Terms & Conditions
    doc.setFont('times', 'bold');
    doc.setFontSize(10);
    doc.text('TERMS & CONDITIONS', margin, termsY);
    doc.setFont('times', 'normal');
    doc.setFontSize(9);
    const terms = [
      '1) GOODS ONCE SOLD WILL NOT BE TAKEN BACK OR EXCHANGED.',
      '2) ALL DISPUTES SUBJECT TO DELHI JURISDICTION ONLY.',
      '3) THIS IS COMPUTER GENERATED INVOICE.'
    ];
    doc.text(terms, margin, termsY + 14);

    // Signature line
    const sigLineY = termsY + 56;
    doc.setFont('times', 'normal');
    doc.setFontSize(10);
    doc.line(pageWidth - margin - 180, sigLineY, pageWidth - margin, sigLineY);
    doc.text('AUTHORIZED SIGNATORY', pageWidth - margin, sigLineY + 14, { align: 'right' });

    const fileSafeBill = safeText(billNo).replace(/[^a-z0-9_-]+/gi, '_') || 'GST_INVOICE';
    doc.save(`${fileSafeBill}.pdf`);
  };

  const handleDownloadServerBill = async () => {
    if (!isEditMode || !editingOrderId) {
      setError('Save order first, then download server bill.');
      return;
    }
    try {
      setError(null);
      await downloadOrderBillPdf(editingOrderId);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleShareBill = async () => {
    if (!isEditMode || !editingOrderId) {
      setError('Save order first, then share bill.');
      return;
    }
    if (!shareEmailEnabled && !shareWhatsappEnabled) {
      setError('Select at least one channel: Email or WhatsApp.');
      return;
    }
    try {
      setSendingBill(true);
      setError(null);
      setShareResult(null);
      const payload = {
        send_email: shareEmailEnabled,
        send_whatsapp: shareWhatsappEnabled,
        email: shareEmailEnabled ? (shareEmail.trim() || undefined) : undefined,
        whatsapp: shareWhatsappEnabled ? (shareWhatsapp.trim() || undefined) : undefined
      };
      const result = await shareOrderBill(editingOrderId, payload);
      setShareResult(JSON.stringify(result, null, 2));
      setShowShareModal(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSendingBill(false);
    }
  };

  return (
    <div className="page">
      <div className="panel new-order-page">
        <div className="panel-header-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button type="button" className="button btn-icon" onClick={() => navigate('/orders')}>
              <ArrowLeft size={16} />
              Back
            </button>
            <h2 style={{ margin: 0 }}>{isEditMode ? `Edit Order #${editingOrderId}` : 'Create New Order'}</h2>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button type="button" className="button btn-icon" onClick={handleDownloadPdf}>
              <Download size={16} />
              Download Local PDF
            </button>
            {isEditMode && (
              <>
                <button type="button" className="button btn-icon" onClick={() => void handleDownloadServerBill()}>
                  <Download size={16} />
                  Download Bill PDF
                </button>
                <button type="button" className="button btn-icon" onClick={() => setShowShareModal(true)} disabled={sendingBill}>
                  <Send size={16} />
                  {sendingBill ? 'Sending...' : 'Send Bill'}
                </button>
              </>
            )}
            <button type="button" className="button primary btn-icon" onClick={handleCreate} disabled={!canSubmit}>
              <Save size={16} />
              {creating ? (isEditMode ? 'Saving...' : 'Creating...') : (isEditMode ? 'Save Changes' : 'Create')}
            </button>
          </div>
        </div>

        {error && <div className="error" role="alert">{error}</div>}
        {shareResult && (
          <div className="panel subsection">
            <h4>Share Response</h4>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '0.82rem' }}>{shareResult}</pre>
          </div>
        )}
        {loadingOrder && <div className="muted">Loading order details...</div>}

        <div className="gst-invoice">
          <div className="gst-header">
            <div className="gst-from">
              <div className="gst-title">Pooja Medicos</div>
              <div className="gst-muted">E-41, Pandav Nagar Delhi</div>
              <div className="gst-muted">Phone no. - 9953329226</div>
              <div className="gst-muted">Registarion no. - DL36(1423)</div>
              <div className="gst-muted">GTSN no. - 07ACFPS2748Q1ZU</div>
            </div>
            <div className="gst-meta">
              <div className="gst-heading">GST INVOICE</div>
              <div className="gst-meta-grid">
                <label className="gst-field">
                  Bill no.
                  <input value={billNo} onChange={(e) => setBillNo(e.target.value)} />
                </label>
                <label className="gst-field">
                  Date
                  <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
                </label>
                <label className="gst-field">
                  Patient name
                  <input value={patientName} onChange={(e) => setPatientName(e.target.value)} placeholder="Patient name" />
                </label>
                <label className="gst-field">
                  Address
                  <input value={patientAddress} onChange={(e) => setPatientAddress(e.target.value)} placeholder="Patient address" />
                </label>
                <label className="gst-field">
                  Dr.
                  <input value={doctorName} onChange={(e) => setDoctorName(e.target.value)} placeholder="Doctor name" />
                </label>
              </div>
            </div>
          </div>

          <div className="gst-backend-fields">
            <div className="gst-backend-grid">
              <label className="gst-field">
                City
                <input value={city} onChange={(e) => setCity(e.target.value)} />
              </label>
              <label className="gst-field">
                State
                <input value={stateName} onChange={(e) => setStateName(e.target.value)} />
              </label>
              <label className="gst-field">
                Pincode
                <input value={pincode} onChange={(e) => setPincode(e.target.value)} />
              </label>
              <label className="gst-field">
                Payment mode
                <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
                  <option value="PREPAID">PREPAID</option>
                  <option value="COD">COD</option>
                  <option value="ONLINE">ONLINE</option>
                </select>
              </label>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="gst-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 220 }}>Item DESC</th>
                  <th style={{ width: 70 }}>QTY</th>
                  <th style={{ width: 90 }}>MRP</th>
                  <th style={{ width: 140 }}>LOT(BATCH NO)</th>
                  <th style={{ width: 110 }}>EXP</th>
                  <th style={{ width: 100 }}>HSN</th>
                  <th style={{ width: 80 }}>GST</th>
                  <th style={{ width: 90 }}>CGST</th>
                  <th style={{ width: 90 }}>SGST</th>
                  <th style={{ width: 90 }}>NET</th>
                  <th style={{ width: 110 }}>Product ID</th>
                  <th style={{ width: 60 }}></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, idx) => (
                  <tr key={idx}>
                    <td>
                      <input
                        list={`medicine-suggestions-${idx}`}
                        value={l.item_desc}
                        onChange={(e) => { void handleItemDescChange(idx, e.target.value); }}
                        onBlur={() => handleItemDescBlur(idx)}
                        placeholder="Item description"
                      />
                      <datalist id={`medicine-suggestions-${idx}`}>
                        {(medicineSuggestions[idx] ?? []).map((m) => (
                          <option key={m.id} value={m.name} />
                        ))}
                      </datalist>
                      {selectedMedicineByRow[idx] && (
                        <div className="muted" style={{ marginTop: '0.35rem', fontSize: '0.8rem', lineHeight: 1.35 }}>
                          <div><strong>Name:</strong> {selectedMedicineByRow[idx]?.name ?? '-'}</div>
                          <div><strong>SKU:</strong> {selectedMedicineByRow[idx]?.sku ?? '-'}</div>
                          <div><strong>Batch number:</strong> {selectedMedicineByRow[idx]?.batch_number ?? '-'}</div>
                          <div><strong>Category:</strong> {selectedMedicineByRow[idx]?.category_name ?? '-'}</div>
                          <div><strong>Company:</strong> {selectedMedicineByRow[idx]?.company_name ?? selectedMedicineByRow[idx]?.resolved_company_name ?? '-'}</div>
                          <div><strong>Strength:</strong> {selectedMedicineByRow[idx]?.strength ?? '-'}</div>
                          <div><strong>Size:</strong> {selectedMedicineByRow[idx]?.size ?? '-'}</div>
                          <div><strong>Prescription required:</strong> {selectedMedicineByRow[idx]?.prescription_required ? 'Yes' : 'No'}</div>
                        </div>
                      )}
                    </td>
                    <td><input type="number" min={1} value={l.qty} onChange={(e) => updateLine(idx, 'qty', Number(e.target.value) || 1)} /></td>
                    <td><input value={l.mrp} onChange={(e) => updateLine(idx, 'mrp', e.target.value)} /></td>
                    <td><input value={l.lot} onChange={(e) => updateLine(idx, 'lot', e.target.value)} /></td>
                    <td><input value={l.exp} onChange={(e) => updateLine(idx, 'exp', e.target.value)} placeholder="MM/YY" /></td>
                    <td><input value={l.hsn} onChange={(e) => updateLine(idx, 'hsn', e.target.value)} /></td>
                    <td><input value={l.gst} onChange={(e) => updateLine(idx, 'gst', e.target.value)} /></td>
                    <td><input value={l.cgst} onChange={(e) => updateLine(idx, 'cgst', e.target.value)} /></td>
                    <td><input value={l.sgst} onChange={(e) => updateLine(idx, 'sgst', e.target.value)} /></td>
                    <td><input value={l.net} onChange={(e) => updateLine(idx, 'net', e.target.value)} /></td>
                    <td><input value={l.product_id} onChange={(e) => updateLine(idx, 'product_id', e.target.value === '' ? '' : Number(e.target.value) || '')} placeholder="For API" /></td>
                    <td style={{ textAlign: 'right' }}>
                      <button type="button" className="button remove btn-icon" onClick={() => removeLine(idx)} disabled={lines.length === 1} aria-label="Remove line">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button type="button" className="button primary btn-icon" onClick={addLine} style={{ marginTop: '0.75rem' }}>
            <Plus size={16} />
            New Line
          </button>

          <div className="gst-footer">
            <div className="gst-terms">
              <div className="gst-section-title">Terms &amp; Condition</div>
              <ol>
                <li>Goods once sold will not be taken back or exchanged,</li>
                <li>all disputes subject to delhi jurisdiction only</li>
                <li>this is computer generated invoice</li>
              </ol>
            </div>

            <div className="gst-totals">
              <div className="gst-section-title">Totals</div>
              <div className="gst-totals-grid">
                {([
                  ['TOTAL', 'total'],
                  ['DISC', 'disc'],
                  ['TAXABLE', 'taxable'],
                  ['GST', 'gst'],
                  ['CGST', 'cgst'],
                  ['SGST', 'sgst'],
                  ['CESS', 'cess'],
                  ['IGST', 'igst'],
                  ['PAYABLE', 'payable']
                ] as const).map(([label, key]) => (
                  <label key={key} className="gst-total-row">
                    <span>{label}</span>
                    <input
                      value={totals[key]}
                      onChange={(e) => setTotals((t) => ({ ...t, [key]: e.target.value }))}
                      readOnly={key !== 'disc'}
                    />
                  </label>
                ))}
              </div>

              <div className="gst-signature">
                <div className="gst-signature-line" />
                <div className="gst-muted" style={{ textAlign: 'right' }}>Authroised siganture</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {showShareModal && (
        <div className="new-order-fullscreen" role="dialog" aria-modal="true" aria-label="Share Bill">
          <div className="new-order-invoice" style={{ maxWidth: '520px' }}>
            <div className="invoice-title-row">
              <h3 className="invoice-title" style={{ fontSize: '1.2rem' }}>Send Bill</h3>
              <button type="button" className="button invoice-close" onClick={() => setShowShareModal(false)} aria-label="Close">
                X
              </button>
            </div>
            <div className="form">
              <label className="checkbox">
                <input type="checkbox" checked={shareEmailEnabled} onChange={(e) => setShareEmailEnabled(e.target.checked)} />
                Send via Email
              </label>
              {shareEmailEnabled && (
                <label>
                  Email
                  <input value={shareEmail} onChange={(e) => setShareEmail(e.target.value)} placeholder="customer@example.com" />
                </label>
              )}
              <label className="checkbox">
                <input type="checkbox" checked={shareWhatsappEnabled} onChange={(e) => setShareWhatsappEnabled(e.target.checked)} />
                Send via WhatsApp
              </label>
              {shareWhatsappEnabled && (
                <label>
                  WhatsApp
                  <input value={shareWhatsapp} onChange={(e) => setShareWhatsapp(e.target.value)} placeholder="+919999999999" />
                </label>
              )}
              <div className="form-actions">
                <button type="button" className="button primary btn-icon" onClick={() => void handleShareBill()} disabled={sendingBill}>
                  <Send size={16} />
                  {sendingBill ? 'Sending...' : 'Send'}
                </button>
                <button type="button" className="button btn-icon" onClick={() => setShowShareModal(false)} disabled={sendingBill}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

