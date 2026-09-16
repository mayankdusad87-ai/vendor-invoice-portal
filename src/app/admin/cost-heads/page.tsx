'use client';

import { useState, useEffect } from 'react';
import { useAdminAuth } from '@/hooks/useAdminAuth';

interface CostHead {
  id: string;
  category: string;
  subCategory: string;
  isActive: boolean;
  createdAt: string;
  createdBy: string;
}

export default function CostHeadsPage() {
  const { isReady } = useAdminAuth();
  const [costHeads, setCostHeads] = useState<CostHead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // New cost head form
  const [newCategory, setNewCategory] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [newSubCategory, setNewSubCategory] = useState('');
  const [adding, setAdding] = useState(false);

  // Get unique categories for the dropdown
  const existingCategories = Array.from(new Set(costHeads.map((ch) => ch.category))).sort();

  useEffect(() => {
    if (!isReady) return;
    fetchCostHeads();
  }, [isReady]);

  const fetchCostHeads = async () => {
    try {
      const res = await fetch('/api/cost-heads?all=true');
      if (res.ok) {
        const data = await res.json();
        setCostHeads(data.costHeads || []);
      }
    } catch {
      setError('Failed to load cost heads');
    }
    setLoading(false);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setAdding(true);

    const category = newCategory === '__custom__' ? customCategory : newCategory;
    if (!category || !newSubCategory) {
      setError('Category and sub-category are required');
      setAdding(false);
      return;
    }

    try {
      const res = await fetch('/api/cost-heads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, subCategory: newSubCategory }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(`Added: ${category.toUpperCase()} → ${newSubCategory}`);
        setNewCategory('');
        setCustomCategory('');
        setNewSubCategory('');
        fetchCostHeads();
      } else {
        setError(data.error || 'Failed to add cost head');
      }
    } catch {
      setError('Network error');
    }
    setAdding(false);
  };

  const handleToggle = async (id: string, currentActive: boolean) => {
    try {
      const res = await fetch('/api/cost-heads', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, isActive: !currentActive }),
      });
      if (res.ok) {
        setCostHeads((prev) =>
          prev.map((ch) => (ch.id === id ? { ...ch, isActive: !currentActive } : ch))
        );
      }
    } catch {
      setError('Failed to update');
    }
  };

  // Group by category for display
  const grouped = new Map<string, CostHead[]>();
  for (const ch of costHeads) {
    if (!grouped.has(ch.category)) grouped.set(ch.category, []);
    grouped.get(ch.category)!.push(ch);
  }

  if (!isReady) return null;

  return (
    <div className="max-w-5xl mx-auto">
        <div className="admin-page-header" style={{ marginBottom: '1.5rem' }}>
          <div>
            <h2>Cost Heads</h2>
            <p>Manage work categories for construction cost tracking</p>
          </div>
          <span className="text-xs text-[var(--text-muted)]">
            {costHeads.filter((ch) => ch.isActive).length} active / {costHeads.length} total
          </span>
        </div>

        {/* Add new cost head */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-6">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Add New Cost Head</h3>
          <form onSubmit={handleAdd} className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[180px]">
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Category</label>
              <select
                value={newCategory}
                onChange={(e) => { setNewCategory(e.target.value); if (e.target.value !== '__custom__') setCustomCategory(''); }}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] text-sm min-h-[40px]"
                required
              >
                <option value="">Select or add new</option>
                {existingCategories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
                <option value="__custom__">+ New Category...</option>
              </select>
            </div>

            {newCategory === '__custom__' && (
              <div className="flex-1 min-w-[150px]">
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">New Category Name</label>
                <input
                  type="text"
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] text-sm min-h-[40px]"
                  placeholder="e.g., LANDSCAPING"
                  required
                />
              </div>
            )}

            <div className="flex-1 min-w-[180px]">
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Sub-Category</label>
              <input
                type="text"
                value={newSubCategory}
                onChange={(e) => setNewSubCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] text-sm min-h-[40px]"
                placeholder="e.g., Electrical"
                required
              />
            </div>

            <button
              type="submit"
              disabled={adding}
              className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 min-h-[40px]"
            >
              {adding ? 'Adding...' : 'Add'}
            </button>
          </form>

          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          {success && <p className="mt-2 text-sm text-green-600">{success}</p>}
        </div>

        {/* Cost heads list grouped by category */}
        {loading ? (
          <div className="text-center py-12 text-[var(--text-secondary)]">Loading...</div>
        ) : grouped.size === 0 ? (
          <div className="text-center py-12">
            <p className="text-[var(--text-secondary)]">No cost heads yet. Run Setup from the dashboard to seed defaults, or add them above.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {Array.from(grouped.entries())
              .sort(([a], [b]) => {
                if (a === 'OTHER') return 1;
                if (b === 'OTHER') return -1;
                return a.localeCompare(b);
              })
              .map(([category, items]) => (
                <div key={category} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
                  <div className="px-4 py-3 bg-[var(--surface-hover)] border-b border-[var(--border)] flex items-center justify-between">
                    <h3 className="text-sm font-bold text-[var(--text-primary)]">{category}</h3>
                    <span className="text-xs text-[var(--text-secondary)]">
                      {items.filter((i) => i.isActive).length} active
                    </span>
                  </div>
                  <div className="divide-y divide-[var(--border)]">
                    {items.map((ch) => (
                      <div key={ch.id} className={`px-4 py-2.5 flex items-center justify-between ${!ch.isActive ? 'opacity-50' : ''}`}>
                        <div>
                          <span className="text-sm text-[var(--text-primary)]">{ch.subCategory}</span>
                          <span className="text-xs text-[var(--text-secondary)] ml-2">
                            by {ch.createdBy}
                          </span>
                        </div>
                        <button
                          onClick={() => handleToggle(ch.id, ch.isActive)}
                          className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${
                            ch.isActive
                              ? 'bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-700'
                              : 'bg-gray-100 text-gray-600 hover:bg-green-100 hover:text-green-700'
                          }`}
                        >
                          {ch.isActive ? 'Active' : 'Inactive'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}
    </div>
  );
}
