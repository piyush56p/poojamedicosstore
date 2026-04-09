import React, { useEffect, useState } from 'react';
import { RefreshCw, Check, XCircle } from 'lucide-react';
import {
  getPrescriptions,
  getPrescription,
  patchPrescription
} from '../api/admin';
import type { Prescription } from '../types';

const PRESCRIPTION_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'FULFILLED'];

export const PrescriptionsPage: React.FC = () => {
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [selected, setSelected] = useState<Prescription | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPrescriptions = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getPrescriptions();
      setPrescriptions(Array.isArray(data) ? data : []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPrescriptions();
  }, []);

  const handleSelect = async (id: number) => {
    try {
      setError(null);
      const data = await getPrescription(id);
      setSelected(data != null && typeof data === 'object' ? data : null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleStatusChange = async (status: string) => {
    if (!selected) return;
    try {
      setSaving(true);
      setError(null);
      const updated = await patchPrescription(selected.id, { status });
      setSelected(updated ?? selected);
      void loadPrescriptions();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2>Prescriptions</h2>
        <button className="button btn-icon" onClick={loadPrescriptions} disabled={loading}>
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="split">
        <div className="panel">
          <h3>Prescription List</h3>
          {loading ? (
            <p>Loading...</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {prescriptions.map((p) => (
                  <tr
                    key={p.id}
                    className={selected?.id === p.id ? 'row-selected' : ''}
                    onClick={() => handleSelect(p.id)}
                  >
                    <td>{p.id}</td>
                    <td>
                      {typeof p.customer === 'number'
                        ? p.customer
                        : p.customer && typeof p.customer === 'object'
                          ? `${p.customer.first_name} (${p.customer.mobile_number})`
                          : '-'}
                    </td>
                    <td>{p.status}</td>
                    <td>{p.created_at ? new Date(p.created_at).toLocaleString() : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="panel">
          <h3>Prescription Details</h3>
          {selected ? (
            <>
              <p>
                <strong>ID:</strong> {selected.id}
              </p>
              <p>
                <strong>Status:</strong> {selected.status}
              </p>
              <div className="form-row form-row-wrap">
                {PRESCRIPTION_STATUSES.map((s) => (
                  <button
                    key={s}
                    className={
                      'button btn-icon ' + (s === selected.status ? 'primary' : 'outline')
                    }
                    disabled={saving || s === selected.status}
                    onClick={() => void handleStatusChange(s)}
                  >
                    {s === 'APPROVED' || s === 'FULFILLED' ? (
                      <Check size={14} />
                    ) : s === 'REJECTED' ? (
                      <XCircle size={14} />
                    ) : null}
                    {s}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p>Select a prescription to view and update status.</p>
          )}
        </div>
      </div>
    </div>
  );
};

