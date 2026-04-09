import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, ShoppingBag, Users, FileText, Package } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="app-root">
      <aside className="sidebar">
        <div className="sidebar-header">
          <span className="logo">Pooja Medicos</span>
          <span className="subtitle">Admin Panel</span>
        </div>
        <nav className="nav">
          <NavLink to="/dashboard" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
            <LayoutDashboard size={18} />
            Dashboard
          </NavLink>
          <NavLink to="/orders" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
            <ShoppingBag size={18} />
            Orders
          </NavLink>
          <NavLink to="/customers" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
            <Users size={18} />
            Customers
          </NavLink>
          <NavLink to="/prescriptions" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
            <FileText size={18} />
            Prescriptions
          </NavLink>
          <NavLink to="/inventory" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
            <Package size={18} />
            Inventory
          </NavLink>
        </nav>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <LayoutDashboard size={20} className="topbar-icon" />
          <h1>Admin Dashboard</h1>
        </header>
        <section className="content">{children}</section>
      </main>
    </div>
  );
};

