interface FreshnessBadgeProps {
  state: 'live' | 'delayed' | 'stale' | 'unavailable';
  ageSeconds: number | null;
}

function formatAge(seconds: number | null): string {
  if (seconds === null) return '';
  if (seconds < 60) return `${Math.round(seconds)}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  return `${Math.round(seconds / 3600)}h ago`;
}

export function FreshnessBadge({ state, ageSeconds }: FreshnessBadgeProps) {
  const age = formatAge(ageSeconds);
  return (
    <span className={`freshness-badge freshness-badge--${state}`}>
      <span className="freshness-badge__dot" />
      {state}
      {age && <span> ({age})</span>}
    </span>
  );
}
