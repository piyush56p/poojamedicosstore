import React, { useEffect, useState } from 'react';
import { RefreshCw, Save } from 'lucide-react';
import { getCustomers, getCustomer, patchCustomer } from '../api/admin';
import type { Customer } from '../types';

export const CustomersPage: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCustomers = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getCustomers();
      setCustomers(Array.isArray(data) ? data : []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCustomers();
  }, []);

  const handleSelect = async (id: number) => {
    try {
      setError(null);
      const data = await getCustomer(id);
      setSelected(data != null && typeof data === 'object' ? data : null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleChange = (field: keyof Customer, value: unknown) => {
    if (!selected) return;
    setSelected({ ...selected, [field]: value });
  };

  const handleSave = async () => {
    if (!selected) return;
    try {
      setSaving(true);
      setError(null);
      const updated = await patchCustomer(selected.id, {
        first_name: selected.first_name,
        mobile_number: selected.mobile_number,
        is_active: selected.is_active
      });
      setSelected(updated ?? selected);
      void loadCustomers();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2>Customers</h2>
        <button className="button btn-icon" onClick={loadCustomers} disabled={loading}>
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="split">
        <div className="panel">
          <h3>Customer List</h3>
          {loading ? (
            <p>Loading...</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Mobile</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr
                    key={c.id}
                    className={selected?.id === c.id ? 'row-selected' : ''}
                    onClick={() => handleSelect(c.id)}
                  >
                    <td>{c.id}</td>
                    <td>{c.first_name}</td>
                    <td>{c.mobile_number}</td>
                    <td>{c.is_active ? 'Active' : 'Inactive'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="panel">
          <h3>Customer Details</h3>
          {selected ? (
            <form
              className="form"
              onSubmit={(e) => {
                e.preventDefault();
                void handleSave();
              }}
            >
              <label>
                First name
                <input
                  value={selected.first_name}
                  onChange={(e) => handleChange('first_name', e.target.value)}
                />
              </label>
              <label>
                Mobile number
                <input
                  value={selected.mobile_number}
                  onChange={(e) => handleChange('mobile_number', e.target.value)}
                />
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={selected.is_active}
                  onChange={(e) => handleChange('is_active', e.target.checked)}
                />
                Active
              </label>
              <button className="button primary btn-icon" type="submit" disabled={saving}>
                <Save size={16} />
                {saving ? 'Saving...' : 'Save'}
              </button>
            </form>
          ) : (
            <p>Select a customer to view and edit.</p>
          )}
        </div>
      </div>
    </div>
  );
};

