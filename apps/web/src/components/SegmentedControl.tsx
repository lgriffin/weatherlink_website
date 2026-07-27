interface SegmentedControlProps {
  options: Array<{ key: string; label: string; description?: string }>;
  value: string;
  onChange: (key: string) => void;
}

export function SegmentedControl({ options, value, onChange }: SegmentedControlProps) {
  return (
    <div className="segmented-control">
      {options.map((opt) => (
        <button
          key={opt.key}
          className={`segment-button${value === opt.key ? ' segment-button--active' : ''}`}
          onClick={() => onChange(opt.key)}
        >
          <span>{opt.label}</span>
          {opt.description && (
            <span className="segment-button__desc">{opt.description}</span>
          )}
        </button>
      ))}
    </div>
  );
}
