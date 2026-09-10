'use client';

import { useState, useEffect } from 'react';
import AdminHeader from '@/components/layout/AdminHeader';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import { useAdminAuth } from '@/hooks/useAdminAuth';

interface Project {
  id: string;
  name: string;
  status: 'active' | 'inactive';
  createdAt: string;
}

export default function AdminProjects() {
  const { isReady } = useAdminAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [formName, setFormName] = useState('');

  useEffect(() => {
    if (!isReady) return;
    fetchProjects();
  }, [isReady]);

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      if (res.ok) {
        setProjects(data.projects || []);
      }
    } catch {
      console.error('Failed to fetch projects');
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedName = formName.trim();
    if (!trimmedName || trimmedName.length < 2) {
      setError('Project name must be at least 2 characters');
      return;
    }

    setSaving(true);

    try {
      if (editingProject) {
        const res = await fetch('/api/projects', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingProject.id, name: trimmedName }),
        });
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || 'Failed to update project');
          setSaving(false);
          return;
        }
        setSuccessMsg('Project updated successfully');
      } else {
        const res = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: trimmedName }),
        });
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || 'Failed to add project');
          setSaving(false);
          return;
        }
        setSuccessMsg('Project added successfully');
      }

      setFormName('');
      setShowForm(false);
      setEditingProject(null);
      await fetchProjects();
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch {
      setError('Something went wrong');
    }
    setSaving(false);
  };

  const handleEdit = (project: Project) => {
    setEditingProject(project);
    setFormName(project.name);
    setShowForm(true);
    setError('');
  };

  const handleToggleStatus = async (project: Project) => {
    const newStatus = project.status === 'active' ? 'inactive' : 'active';
    if (newStatus === 'inactive') {
      const confirmed = window.confirm(
        `Are you sure you want to deactivate "${project.name}"?\n\nEngineers will no longer be able to submit invoices for this project.`
      );
      if (!confirmed) return;
    }
    try {
      await fetch('/api/projects', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: project.id, status: newStatus }),
      });
      await fetchProjects();
    } catch {
      console.error('Failed to update project status');
    }
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingProject(null);
    setFormName('');
    setError('');
  };

  if (!isReady) return null;

  const activeProjects = projects.filter((p) => p.status === 'active');
  const inactiveProjects = projects.filter((p) => p.status === 'inactive');

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <AdminHeader />

      <main className="max-w-4xl mx-auto p-4 mt-4 fade-in">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-[var(--text-primary)]">Projects</h2>
            <p className="text-sm text-[var(--text-muted)]">
              {activeProjects.length} active project(s) — assign engineers and accounts team to projects
            </p>
          </div>
          {!showForm && (
            <button
              onClick={() => { setShowForm(true); setEditingProject(null); setError(''); setFormName(''); }}
              className="btn-primary flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Project
            </button>
          )}
        </div>

        {successMsg && (
          <div className="alert alert-success mb-4">{successMsg}</div>
        )}

        {showForm && (
          <div className="card mb-4">
            <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4">
              {editingProject ? 'Edit Project' : 'Add New Project'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Project Name *</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="input-field"
                  placeholder="e.g., Project Alpha"
                  required
                  autoFocus
                />
              </div>
              {error && <div className="alert alert-error">{error}</div>}
              <div className="flex gap-2">
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : editingProject ? 'Update' : 'Add Project'}
                </button>
                <button type="button" onClick={cancelForm} className="btn-secondary">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {loading ? (
          <LoadingSkeleton variant="list" count={3} />
        ) : projects.length === 0 ? (
          <div className="card text-center py-12">
            <div className="text-4xl mb-3">📁</div>
            <p className="text-[var(--text-muted)] mb-2">No projects created yet</p>
            <p className="text-sm text-[var(--text-muted)] mb-4">
              Create projects and assign engineers &amp; accounts team members to them.
            </p>
            <button onClick={() => { setShowForm(true); setFormName(''); }} className="btn-primary">
              Create First Project
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {activeProjects.map((project) => (
              <div key={project.id} className="card">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-[var(--primary)]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
                      </svg>
                      <span className="font-bold text-[var(--text-primary)]">{project.name}</span>
                      <span className="badge badge-active">Active</span>
                    </div>
                    <p className="text-xs text-[var(--text-muted)] mt-1">
                      Created: {project.createdAt.split(',')[0] || project.createdAt}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleEdit(project)} className="text-sm font-medium min-h-[44px] px-2" style={{ color: 'var(--primary)' }}>
                      Edit
                    </button>
                    <button onClick={() => handleToggleStatus(project)} className="text-sm font-medium min-h-[44px] px-2" style={{ color: 'var(--danger)' }}>
                      Deactivate
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {inactiveProjects.length > 0 && (
              <>
                <h3 className="text-sm font-medium text-[var(--text-muted)] mt-6 mb-2">Inactive Projects</h3>
                {inactiveProjects.map((project) => (
                  <div key={project.id} className="card" style={{ opacity: 0.6 }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[var(--text-primary)]">{project.name}</span>
                        <span className="badge badge-inactive">Inactive</span>
                      </div>
                      <button onClick={() => handleToggleStatus(project)} className="text-sm font-medium min-h-[44px] px-2" style={{ color: 'var(--success)' }}>
                        Reactivate
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
