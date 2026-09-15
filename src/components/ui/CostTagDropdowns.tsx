'use client';

import { useState, useEffect, useCallback } from 'react';

interface CostHeadGroup {
  category: string;
  subCategories: { id: string; name: string; isActive: boolean }[];
}

interface CostTagDropdownsProps {
  /** Current values (controlled) */
  costCategory: string;
  costSubCategory: string;
  costType: string;
  /** Called when any value changes */
  onChange: (values: { costCategory: string; costSubCategory: string; costType: string }) => void;
  /** Whether these fields are required */
  required?: boolean;
  /** Show inline in a compact row (for tables/cards) vs full form layout */
  compact?: boolean;
  /** Disable editing */
  disabled?: boolean;
  /** Optional class for the wrapper */
  className?: string;
}

/**
 * Reusable cascading dropdowns for cost categorization.
 * Fetches cost heads from the API on mount and caches them.
 *
 * Usage:
 *   <CostTagDropdowns
 *     costCategory={form.costCategory}
 *     costSubCategory={form.costSubCategory}
 *     costType={form.costType}
 *     onChange={({ costCategory, costSubCategory, costType }) => setForm(prev => ({ ...prev, costCategory, costSubCategory, costType }))}
 *   />
 */
export default function CostTagDropdowns({
  costCategory,
  costSubCategory,
  costType,
  onChange,
  required = false,
  compact = false,
  disabled = false,
  className = '',
}: CostTagDropdownsProps) {
  const [groups, setGroups] = useState<CostHeadGroup[]>([]);
  const [costTypes, setCostTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCostHeads = async () => {
      try {
        const res = await fetch('/api/cost-heads?grouped=true');
        if (res.ok) {
          const data = await res.json();
          setGroups(data.groups || []);
          setCostTypes(data.costTypes || []);
        }
      } catch {
        console.error('Failed to load cost heads');
      }
      setLoading(false);
    };
    fetchCostHeads();
  }, []);

  // Get sub-categories for the selected category
  const selectedGroup = groups.find((g) => g.category === costCategory);
  const subCategories = selectedGroup?.subCategories || [];

  const handleCategoryChange = useCallback((newCategory: string) => {
    // Reset sub-category when category changes
    onChange({ costCategory: newCategory, costSubCategory: '', costType });
  }, [onChange, costType]);

  const handleSubCategoryChange = useCallback((newSub: string) => {
    onChange({ costCategory, costSubCategory: newSub, costType });
  }, [onChange, costCategory, costType]);

  const handleCostTypeChange = useCallback((newType: string) => {
    onChange({ costCategory, costSubCategory, costType: newType });
  }, [onChange, costCategory, costSubCategory]);

  if (loading) {
    return (
      <div className={`${compact ? 'flex gap-2' : 'space-y-3'} ${className}`}>
        <div className="animate-pulse bg-gray-200 rounded h-10 flex-1" />
        {compact && <div className="animate-pulse bg-gray-200 rounded h-10 flex-1" />}
        {compact && <div className="animate-pulse bg-gray-200 rounded h-10 flex-1" />}
      </div>
    );
  }

  const selectClass = `w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px] ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`;
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1';

  if (compact) {
    return (
      <div className={`flex gap-2 items-end ${className}`}>
        <div className="flex-1 min-w-0">
          <select
            value={costCategory}
            onChange={(e) => handleCategoryChange(e.target.value)}
            className={`${selectClass} text-sm py-1.5 min-h-[36px]`}
            disabled={disabled}
            title="Cost Category"
          >
            <option value="">Category</option>
            {groups.map((g) => (
              <option key={g.category} value={g.category}>{g.category}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-0">
          <select
            value={costSubCategory}
            onChange={(e) => handleSubCategoryChange(e.target.value)}
            className={`${selectClass} text-sm py-1.5 min-h-[36px]`}
            disabled={disabled || !costCategory}
            title="Sub-Category"
          >
            <option value="">Sub-category</option>
            {subCategories.map((sc) => (
              <option key={sc.id} value={sc.name}>{sc.name}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-0">
          <select
            value={costType}
            onChange={(e) => handleCostTypeChange(e.target.value)}
            className={`${selectClass} text-sm py-1.5 min-h-[36px]`}
            disabled={disabled}
            title="Cost Type"
          >
            <option value="">Type</option>
            {costTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>
            Work Category {required && '*'}
          </label>
          <select
            value={costCategory}
            onChange={(e) => handleCategoryChange(e.target.value)}
            className={selectClass}
            disabled={disabled}
            required={required}
          >
            <option value="">Select category</option>
            {groups.map((g) => (
              <option key={g.category} value={g.category}>{g.category}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>
            Sub-Category {required && '*'}
          </label>
          <select
            value={costSubCategory}
            onChange={(e) => handleSubCategoryChange(e.target.value)}
            className={selectClass}
            disabled={disabled || !costCategory}
            required={required}
          >
            <option value="">{costCategory ? 'Select sub-category' : 'Select category first'}</option>
            {subCategories.map((sc) => (
              <option key={sc.id} value={sc.name}>{sc.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className={labelClass}>
          Cost Type {required && '*'} <span className="text-xs text-gray-400 font-normal">(Material / Labor / etc.)</span>
        </label>
        <select
          value={costType}
          onChange={(e) => handleCostTypeChange(e.target.value)}
          className={selectClass}
          disabled={disabled}
          required={required}
        >
          <option value="">Select cost type</option>
          {costTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

/**
 * Display-only cost tag badge. Shows category → sub-category / type.
 * Returns null if no cost tags are set.
 */
export function CostTagBadge({
  costCategory,
  costSubCategory,
  costType,
  className = '',
}: {
  costCategory: string;
  costSubCategory: string;
  costType: string;
  className?: string;
}) {
  if (!costCategory && !costSubCategory && !costType) return null;

  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {costCategory && (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
          {costCategory}
          {costSubCategory && ` › ${costSubCategory}`}
        </span>
      )}
      {costType && (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
          {costType}
        </span>
      )}
    </div>
  );
}
