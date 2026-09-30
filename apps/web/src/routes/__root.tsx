import { createRootRoute, Link, Outlet } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { fetchSnapshotInfo } from '../api/client';
import { IS_STATIC } from '../config/site';
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
        <Link to="/annual" activeProps={{ 'data-status': 'active' } as Record<string, string>}>
          Annual
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
      {IS_STATIC && <SnapshotBanner />}
      <main className="page-content">
        <Outlet />
      </main>
    </>
  );
}

function SnapshotBanner() {
  const { data } = useQuery({ queryKey: ['snapshot'], queryFn: fetchSnapshotInfo, staleTime: 300_000 });
  if (!data) return null;
  const taken = new Date(data.generatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <div className="snapshot-banner" role="status">
      Snapshot taken {taken}. The site refreshes every hour.
    </div>
  );
}
