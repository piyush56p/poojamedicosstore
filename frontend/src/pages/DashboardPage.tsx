import React, { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
  Cell
} from 'recharts';
import { RefreshCw, TrendingUp, ShoppingBag, Package, DollarSign } from 'lucide-react';
import { getOrders } from '../api/admin';
import type { Order } from '../types';

type Period = 'daily' | 'weekly' | 'monthly';

const PERIOD_LABELS: Record<Period, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly'
};

const CHART_COLORS = ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#65a30d', '#be185d'];

function parseOrdersResponse(data: unknown): Order[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object' && 'results' in data && Array.isArray((data as { results: Order[] }).results)) {
    return (data as { results: Order[] }).results;
  }
  return [];
}

function toDateKey(date: Date, period: Period): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  if (period === 'daily') return `${y}-${m}-${d}`;
  if (period === 'monthly') return `${y}-${m}`;
  const startOfWeek = new Date(date);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  startOfWeek.setDate(diff);
  const sw = startOfWeek.toISOString().slice(0, 10);
  return sw;
}

function formatPeriodLabel(key: string, period: Period): string {
  if (period === 'daily') return key;
  if (period === 'monthly') {
    const [y, m] = key.split('-');
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${monthNames[Number(m) - 1]} ${y}`;
  }
  return key;
}

export const DashboardPage: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('daily');

  const loadOrders = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getOrders();
      setOrders(parseOrdersResponse(data));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    void loadOrders();
  }, []);

  const { salesSeries, topProducts, recentOrders, totalSales, totalOrders, avgOrderValue } = useMemo(() => {
    const list = orders.filter((o) => o.created_at);
    const totalSalesNum = list.reduce((sum, o) => sum + parseFloat(String(o.total_amount || '0')) || 0, 0);
    const totalOrdersNum = list.length;
    const avgOrderValueNum = totalOrdersNum > 0 ? totalSalesNum / totalOrdersNum : 0;

    const byPeriod: Record<string, { sales: number; count: number }> = {};
    list.forEach((o) => {
      const date = new Date(o.created_at!);
      const key = toDateKey(date, period);
      if (!byPeriod[key]) byPeriod[key] = { sales: 0, count: 0 };
      byPeriod[key].sales += parseFloat(String(o.total_amount || '0')) || 0;
      byPeriod[key].count += 1;
    });

    const salesSeries = Object.entries(byPeriod)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, v]) => ({
        period: formatPeriodLabel(key, period),
        key,
        sales: Math.round(v.sales * 100) / 100,
        orders: v.count
      }));

    const productMap: Record<string, number> = {};
    list.forEach((o) => {
      (o.items || []).forEach((item) => {
        const name = item.product_name || `Product ${item.product}`;
        productMap[name] = (productMap[name] || 0) + (item.quantity || 0);
      });
    });

    const topProducts = Object.entries(productMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([name, quantity], i) => ({
        name: name.length > 25 ? name.slice(0, 25) + '…' : name,
        fullName: name,
        quantity,
        fill: CHART_COLORS[i % CHART_COLORS.length]
      }));

    const recentOrders = [...list]
      .sort((a, b) => {
        const da = a.created_at ? new Date(a.created_at).getTime() : 0;
        const db = b.created_at ? new Date(b.created_at).getTime() : 0;
        return db - da;
      })
      .slice(0, 6);

    return {
      salesSeries,
      topProducts,
      recentOrders,
      totalSales: totalSalesNum,
      totalOrders: totalOrdersNum,
      avgOrderValue: avgOrderValueNum
    };
  }, [orders, period]);

  return (
    <div className="page dashboard-page">
      <div className="page-header">
        <h2>Dashboard</h2>
        <div className="dashboard-header-actions">
          <div className="period-tabs">
            {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
              <button
                key={p}
                type="button"
                className={'tab ' + (period === p ? 'active' : '')}
                onClick={() => setPeriod(p)}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
          <button className="button btn-icon" onClick={loadOrders} disabled={loading}>
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {loading ? (
        <p className="muted">Loading dashboard…</p>
      ) : (
        <>
          <div className="stats-cards">
            <div className="stat-card">
              <div className="stat-icon sales">
                <DollarSign size={24} />
              </div>
              <div className="stat-content">
                <span className="stat-label">Total Sales</span>
                <span className="stat-value">₹{totalSales.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon orders">
                <ShoppingBag size={24} />
              </div>
              <div className="stat-content">
                <span className="stat-label">Total Orders</span>
                <span className="stat-value">{totalOrders.toLocaleString()}</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon avg">
                <TrendingUp size={24} />
              </div>
              <div className="stat-content">
                <span className="stat-label">Avg. Order Value</span>
                <span className="stat-value">₹{avgOrderValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

          <div className="dashboard-charts">
            <div className="panel chart-panel">
              <h3>Sales over time ({PERIOD_LABELS[period]})</h3>
              {salesSeries.length === 0 ? (
                <p className="muted">No sales data for the selected period.</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={salesSeries} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `₹${v}`} />
                    <Tooltip
                      formatter={(value: number) => [`₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 'Sales']}
                      labelFormatter={(label) => `Period: ${label}`}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="sales" name="Sales (₹)" stroke="#2563eb" strokeWidth={2} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="orders" name="Orders" stroke="#059669" strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="panel chart-panel">
              <h3>
                <ShoppingBag size={18} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                Recent orders
              </h3>
              {recentOrders.length === 0 ? (
                <p className="muted">No orders yet.</p>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Customer</th>
                      <th>Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentOrders.map((o) => (
                      <tr key={o.id}>
                        <td>
                          <div>{o.order_number ?? `#${o.id}`}</div>
                          <div className="muted" style={{ fontSize: '0.8rem' }}>
                            {o.created_at ? new Date(o.created_at).toLocaleDateString() : ''}
                          </div>
                        </td>
                        <td>{o.customer_name ?? `ID ${o.customer_id}`}</td>
                        <td>₹{String(o.total_amount ?? '0').toString()}</td>
                        <td>
                          <span className={`order-status order-status-${(o.status || '').toLowerCase()}`}>
                            {o.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="panel chart-panel">
            <h3>
              <Package size={18} style={{ verticalAlign: 'middle', marginRight: 6 }} />
              Most ordered products
            </h3>
            {topProducts.length === 0 ? (
              <p className="muted">No product data from orders yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={topProducts}
                  layout="vertical"
                  margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(value: number) => [value, 'Quantity ordered']}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? _}
                  />
                  <Bar dataKey="quantity" name="Quantity" radius={[0, 4, 4, 0]}>
                    {topProducts.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </>
      )}
    </div>
  );
};
