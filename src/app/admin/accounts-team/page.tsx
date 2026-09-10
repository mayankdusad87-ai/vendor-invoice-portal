'use client';

import { useState, useEffect } from 'react';
import AdminHeader from '@/components/layout/AdminHeader';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import { useAdminAuth } from '@/hooks/useAdminAuth';

interface AccountsMember {
  id: string;
  name: string;
  email: string;
  status: 'active' | 'inactive';
  createdAt: string;
}

interface Project {
  id: string;
  name: string;
  status: 'active' | 'inactive';
}

interface ProjectAccessEntry {
  projectId: string;
  projectName: string;
}

export default function AdminAccountsTeam() {
  const { isReady } = useAdminAuth();
  const [members, setMembers] = useState<AccountsMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingMember, setEditingMember] = useState<AccountsMember | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [form, setForm] = useState({ name: '', email: '', password: '' });

  // Project assignment state
  const [projects, setProjects] = useState<Project[]>([]);
  const [assigningMemberId, setAssigningMemberId] = useState<string | null>(null);
  const [memberProjects, setMemberProjects] = useState<Record<string, ProjectAccessEntry[]>>({});
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [savingProjects, setSavingProjects] = useState(false);

  useEffect(() => {
    if (!isReady) return;
    fetchMembers();
    fetchProjects();
  }, [isReady]);

  const fetchMembers = async () => {
    try {
      const res = await fetch('/api/accounts-members');
      const data = await res.json();
      if (res.ok) {
        setMembers(data.members || []);
      }
    } catch {
      console.error('Failed to fetch accounts members');
    }
    setLoading(false);
  };

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      if (res.ok) setProjects((data.projects || []).filter((p: Project) => p.status === 'active'));
    } catch {
      console.error('Failed to fetch projects');
    }
  };

  const fetchMemberProjects = async (memberId: string) => {
    try {
      const res = await fetch(`/api/project-access?userId=${memberId}`);
      const data = await res.json();
      const access: ProjectAccessEntry[] = (data.access || [])
        .filter((a: { userType: string }) => a.userType === 'accounts')
        .map((a: { projectId: string; projectName: string }) => ({ projectId: a.projectId, projectName: a.projectName }));
      setMemberProjects((prev) => ({ ...prev, [memberId]: access }));
      setSelectedProjects(access.map((a) => a.projectId));
    } catch {
      console.error('Failed to fetch member projects');
    }
  };

  const openProjectAssignment = (member: AccountsMember) => {
    setAssigningMemberId(member.id);
    fetchMemberProjects(member.id);
  };

  const handleSaveProjects = async (member: AccountsMember) => {
    setSavingProjects(true);
    try {
      const projectsList = selectedProjects.map((pid) => {
        const p = projects.find((proj) => proj.id === pid);
        return { projectId: pid, projectName: p?.name || '' };
      });
      const res = await fetch('/api/project-access', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: member.id,
          userName: member.name,
          userType: 'accounts',
          projects: projectsList,
        }),
      });
      if (res.ok) {
        setMemberProjects((prev) => ({ ...prev, [member.id]: projectsList }));
        setAssigningMemberId(null);
        setSuccessMsg('Project assignments updated');
        setTimeout(() => setSuccessMsg(''), 3000);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to update project assignments');
      }
    } catch {
      setError('Failed to update project assignments');
    }
    setSavingProjects(false);
  };

  const toggleProjectSelection = (projectId: string) => {
    setSelectedProjects((prev) =>
      prev.includes(projectId) ? prev.filter((id) => id !== projectId) : [...prev, projectId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedName = form.name.trim();
    if (!trimmedName || trimmedName.length < 2) {
      setError('Name must be at least 2 characters');
      return;
    }
    if (!form.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError('Please enter a valid email address');
      return;
    }
    if (!editingMember && (!form.password || form.password.length < 6)) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (editingMember && form.password && form.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setSaving(true);

    try {
      if (editingMember) {
        const updateBody: Record<string, string> = {
          id: editingMember.id,
          name: trimmedName,
          email: form.email.trim(),
        };
        if (form.password) {
          updateBody.password = form.password;
        }

        const res = await fetch('/api/accounts-members', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateBody),
        });
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || 'Failed to update member');
          setSaving(false);
          return;
        }
        setSuccessMsg('Accounts member updated successfully');
      } else {
        const res = await fetch('/api/accounts-members', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: trimmedName,
            email: form.email.trim(),
            password: form.password,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || 'Failed to add member');
          setSaving(false);
          return;
        }
        setSuccessMsg('Accounts member added successfully');
      }

      setForm({ name: '', email: '', password: '' });
      setShowForm(false);
      setEditingMember(null);
      await fetchMembers();
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch {
      setError('Something went wrong');
    }
    setSaving(false);
  };

  const handleEdit = (member: AccountsMember) => {
    setEditingMember(member);
    setForm({ name: member.name, email: member.email, password: '' });
    setShowForm(true);
    setError('');
  };

  const handleToggleStatus = async (member: AccountsMember) => {
    const newStatus = member.status === 'active' ? 'inactive' : 'active';
    if (newStatus === 'inactive') {
      const confirmed = window.confirm(
        `Are you sure you want to deactivate "${member.name}"?\n\nThis member will no longer be able to log in.`
      );
      if (!confirmed) return;
    }
    try {
      await fetch('/api/accounts-members', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: member.id, status: newStatus }),
      });
      await fetchMembers();
    } catch {
      console.error('Failed to update member status');
    }
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingMember(null);
    setForm({ name: '', email: '', password: '' });
    setError('');
  };

  if (!isReady) return null;

  const activeMembers = members.filter((m) => m.status === 'active');
  const inactiveMembers = members.filter((m) => m.status === 'inactive');

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <AdminHeader />

      <main className="max-w-4xl mx-auto p-4 mt-4 fade-in">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-[var(--text-primary)]">Accounts Team</h2>
            <p className="text-sm text-[var(--text-muted)]">{activeMembers.length} active member(s)</p>
          </div>
          {!showForm && (
            <button
              onClick={() => { setShowForm(true); setEditingMember(null); setError(''); }}
              className="btn-primary flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Member
            </button>
          )}
        </div>

        {successMsg && (
          <div className="alert alert-success mb-4">{successMsg}</div>
        )}

        {showForm && (
          <div className="card mb-4">
            <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4">
              {editingMember ? 'Edit Accounts Member' : 'Add New Accounts Member'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Name *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="input-field"
                    placeholder="Member name"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Email *</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="input-field"
                    placeholder="email@example.com"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                    Password {editingMember ? '(leave blank to keep)' : '*'}
                  </label>
                  <input
                    type="text"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="input-field"
                    placeholder={editingMember ? 'Leave blank to keep current' : 'Set password (min 6 chars)'}
                    required={!editingMember}
                  />
                </div>
              </div>
              {error && <div className="alert alert-error">{error}</div>}
              <div className="flex gap-2">
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : editingMember ? 'Update' : 'Add Member'}
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
        ) : members.length === 0 ? (
          <div className="card text-center py-12">
            <div className="text-4xl mb-3">💼</div>
            <p className="text-[var(--text-muted)] mb-4">No accounts team members registered yet</p>
            <button onClick={() => setShowForm(true)} className="btn-primary">Add First Member</button>
          </div>
        ) : (
          <div className="space-y-3">
            {activeMembers.map((member) => (
              <div key={member.id} className="card">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[var(--text-primary)]">{member.name}</span>
                      <span className="badge badge-active">Active</span>
                    </div>
                    <div className="flex flex-wrap gap-3 mt-1 text-xs text-[var(--text-muted)]">
                      <span className="inline-flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                        </svg>
                        {member.email}
                      </span>
                      <span>Added: {new Date(member.createdAt).toLocaleDateString('en-IN')}</span>
                    </div>
                    {/* Show assigned projects */}
                    {memberProjects[member.id] && memberProjects[member.id].length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {memberProjects[member.id].map((pa) => (
                          <span key={pa.projectId} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-[var(--primary-light)] text-[var(--primary)]">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
                            </svg>
                            {pa.projectName}
                          </span>
                        ))}
                      </div>
                    )}
                    {memberProjects[member.id] && memberProjects[member.id].length === 0 && (
                      <p className="text-xs text-[var(--text-muted)] mt-2 italic">No projects assigned (sees all invoices)</p>
                    )}
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => openProjectAssignment(member)} className="text-sm font-medium min-h-[44px] px-2" style={{ color: 'var(--info, #3b82f6)' }}>
                      Projects
                    </button>
                    <button onClick={() => handleEdit(member)} className="text-sm font-medium min-h-[44px] px-2" style={{ color: 'var(--primary)' }}>
                      Edit
                    </button>
                    <button onClick={() => handleToggleStatus(member)} className="text-sm font-medium min-h-[44px] px-2" style={{ color: 'var(--danger)' }}>
                      Deactivate
                    </button>
                  </div>
                </div>

                {/* Project assignment panel */}
                {assigningMemberId === member.id && (
                  <div className="mt-3 pt-3 border-t border-[var(--border)]">
                    <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-2">Assign Projects to {member.name}</h4>
                    {projects.length === 0 ? (
                      <p className="text-xs text-[var(--text-muted)]">No active projects. Create projects first.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {projects.map((project) => (
                          <label
                            key={project.id}
                            className={`inline-flex items-center gap-2 text-sm px-3 py-2 rounded-lg border cursor-pointer transition-colors min-h-[44px] ${
                              selectedProjects.includes(project.id)
                                ? 'bg-[var(--primary-light)] border-[var(--primary)] text-[var(--primary)]'
                                : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selectedProjects.includes(project.id)}
                              onChange={() => toggleProjectSelection(project.id)}
                              className="sr-only"
                            />
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              {selectedProjects.includes(project.id) ? (
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                              ) : (
                                <circle cx="12" cy="12" r="9" />
                              )}
                            </svg>
                            {project.name}
                          </label>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSaveProjects(member)}
                        className="btn-primary text-sm"
                        disabled={savingProjects}
                      >
                        {savingProjects ? 'Saving...' : 'Save Assignments'}
                      </button>
                      <button
                        onClick={() => setAssigningMemberId(null)}
                        className="btn-secondary text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                    <p className="text-xs text-[var(--text-muted)] mt-2">
                      If no projects are selected, this member will see invoices from all projects.
                    </p>
                  </div>
                )}
              </div>
            ))}

            {inactiveMembers.length > 0 && (
              <>
                <h3 className="text-sm font-medium text-[var(--text-muted)] mt-6 mb-2">Inactive Members</h3>
                {inactiveMembers.map((member) => (
                  <div key={member.id} className="card" style={{ opacity: 0.6 }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[var(--text-primary)]">{member.name}</span>
                        <span className="badge badge-inactive">Inactive</span>
                      </div>
                      <button onClick={() => handleToggleStatus(member)} className="text-sm font-medium min-h-[44px] px-2" style={{ color: 'var(--success)' }}>
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
