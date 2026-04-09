import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './layout/Layout';
import { CustomersPage } from './pages/CustomersPage';
import { DashboardPage } from './pages/DashboardPage';
import { InventoryPage } from './pages/InventoryPage';
import { NewOrderPage } from './pages/NewOrderPage';
import { OrdersPage } from './pages/OrdersPage';
import { PrescriptionsPage } from './pages/PrescriptionsPage';

const App: React.FC = () => {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/orders/new" element={<NewOrderPage />} />
        <Route path="/orders/new/:orderId" element={<NewOrderPage />} />
        <Route path="/prescriptions" element={<PrescriptionsPage />} />
      </Routes>
    </Layout>
  );
};

export default App;

