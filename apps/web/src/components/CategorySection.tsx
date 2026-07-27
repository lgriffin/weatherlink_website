import type { ReactNode } from 'react';

interface CategorySectionProps {
  label: string;
  children: ReactNode;
}

export function CategorySection({ label, children }: CategorySectionProps) {
  return (
    <div className="category-section">
      <div className="category-section__header">{label}</div>
      <div className="category-section__grid">{children}</div>
    </div>
  );
}
