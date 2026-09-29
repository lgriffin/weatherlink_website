import { createRootRoute, Link, Outlet } from '@tanstack/react-router';
import '../styles.css';

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <>
      <header className="app-header">
        <h1>Home Weather Service</h1>
        <div className="header-meta">
          <span>Weather Station Dashboard</span>
        </div>
      </header>
      <nav className="app-nav">
        <Link to="/" activeProps={{ 'data-status': 'active' } as Record<string, string>}>
          Now
        </Link>
        <Link to="/records" activeProps={{ 'data-status': 'active' } as Record<string, string>}>
          Records
        </Link>
        <Link to="/history" activeProps={{ 'data-status': 'active' } as Record<string, string>}>
          History
        </Link>
        <Link to="/compare" activeProps={{ 'data-status': 'active' } as Record<string, string>}>
          Year vs Year
        </Link>
        <Link to="/trends" activeProps={{ 'data-status': 'active' } as Record<string, string>}>
          Trends
        </Link>
        <Link to="/downloads" activeProps={{ 'data-status': 'active' } as Record<string, string>}>
          Downloads
        </Link>
        <Link to="/system" activeProps={{ 'data-status': 'active' } as Record<string, string>}>
          System
        </Link>
      </nav>
      <main className="page-content">
        <Outlet />
      </main>
    </>
  );
}
