import { useEffect, useState, type FormEvent } from 'react'
import { api, ApiError, type FieldErrors } from '../api'
import { ErrorAlert, Loading } from '../components/States'
import { useApi } from '../components/useApi'
import type { Team } from '../teams/types'
import type { Role } from '../auth/AuthContext'

// F-09 Course administration page (FR-14, AC-09-11). Only reachable through
// RequireRole role="ADMIN"; the server still answers 403 to every admin call
// from another role. Hiding a button is never the only control (NFR-02): every
// 400/409 from the API is shown.

type AdminUser = { id: number; name: string; email: string; role: Role; isActive: boolean }
const ROLE_LABEL: Record<Role, string> = { STUDENT: 'Student', SUPERVISOR: 'Supervisor', ADMIN: 'Admin' }

function messageOf(caught: unknown) {
  return caught instanceof ApiError ? caught.message : 'Could not reach the server.'
}

function byCodeThenName(a: Team, b: Team) {
  if (a.courseCode !== b.courseCode) return a.courseCode < b.courseCode ? -1 : 1
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
}

export default function AdminPage() {
  // Active accounts feed the Add member / Add supervisor selects.
  const active = useApi<{ items: AdminUser[] }>('/admin/users?active=true')

  return (
    <main className="container">
      <h1 className="h4 mb-4">Course administration</h1>
      <TeamsSection activeUsers={active.data?.items ?? []} />
      <AccountsSection onChanged={active.reload} />
    </main>
  )
}

function TeamsSection({ activeUsers }: { activeUsers: AdminUser[] }) {
  const { data, error, loading, reload } = useApi<{ items: Team[] }>('/admin/teams')
  const [teams, setTeams] = useState<Team[] | null>(null)
  const [actionError, setActionError] = useState('')
  useEffect(() => setTeams(data?.items ?? null), [data])

  function replaceTeam(team: Team) {
    setActionError('')
    setTeams((list) => (list ?? []).map((t) => (t.id === team.id ? team : t)))
  }
  function addTeam(team: Team) {
    setActionError('')
    setTeams((list) => [...(list ?? []), team].sort(byCodeThenName))
  }

  return (
    <section className="mb-5" aria-labelledby="admin-teams-heading">
      <h2 id="admin-teams-heading" className="h5">Teams</h2>
      {actionError && <div className="alert alert-danger" role="alert">{actionError}</div>}
      <NewTeamForm onCreated={addTeam} onError={setActionError} />
      {loading && <Loading />}
      {error && <ErrorAlert message={error.message} onRetry={reload} />}
      {teams && teams.length === 0 && <p className="text-body-secondary">No teams yet.</p>}
      {teams && teams.length > 0 && (
        <div className="table-responsive">
          <table className="table align-middle">
            <thead>
              <tr>
                <th scope="col">Course code</th>
                <th scope="col">Name</th>
                <th scope="col">Members</th>
                <th scope="col">Supervisors</th>
                <th scope="col">Add people</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((team) => (
                <TeamRow key={team.id} team={team} activeUsers={activeUsers} onUpdated={replaceTeam} onError={setActionError} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function NewTeamForm({ onCreated, onError }: { onCreated: (team: Team) => void; onError: (message: string) => void }) {
  const [courseCode, setCourseCode] = useState('')
  const [name, setName] = useState('')
  const [fields, setFields] = useState<FieldErrors>({})
  const [saving, setSaving] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setFields({})
    onError('')
    try {
      const { team } = await api<{ team: Team }>('/admin/teams', { method: 'POST', body: { courseCode, name } })
      setCourseCode('')
      setName('')
      onCreated(team)
    } catch (caught) {
      // Field errors go under the inputs (values kept); anything else, such as
      // 409 TEAM_EXISTS, goes in the section's alert.
      if (caught instanceof ApiError && Object.keys(caught.fields).length) setFields(caught.fields)
      else onError(messageOf(caught))
    } finally {
      setSaving(false)
    }
  }

  const invalid = (key: string) => (fields[key] ? ' is-invalid' : '')
  return (
    <form className="row g-2 align-items-start mb-3" onSubmit={onSubmit} noValidate aria-label="New team">
      <div className="col-sm-4">
        <label htmlFor="new-team-code" className="form-label">Course code</label>
        <input id="new-team-code" className={`form-control${invalid('courseCode')}`} value={courseCode} onChange={(e) => setCourseCode(e.target.value)} />
        {fields.courseCode && <div className="invalid-feedback">{fields.courseCode}</div>}
      </div>
      <div className="col-sm-5">
        <label htmlFor="new-team-name" className="form-label">Team name</label>
        <input id="new-team-name" className={`form-control${invalid('name')}`} value={name} onChange={(e) => setName(e.target.value)} />
        {fields.name && <div className="invalid-feedback">{fields.name}</div>}
      </div>
      <div className="col-sm-3 d-flex align-items-end" style={{ minHeight: '4.25rem' }}>
        <button type="submit" className="btn btn-primary w-100" disabled={saving}>
          {saving ? 'Creating…' : 'Create team'}
        </button>
      </div>
    </form>
  )
}

function TeamRow({ team, activeUsers, onUpdated, onError }: {
  team: Team
  activeUsers: AdminUser[]
  onUpdated: (team: Team) => void
  onError: (message: string) => void
}) {
  const inTeam = new Set([...team.members, ...team.supervisors].map((p) => p.id))
  const eligible = (role: 'STUDENT' | 'SUPERVISOR') => activeUsers.filter((u) => u.role === role && !inTeam.has(u.id))

  return (
    <tr>
      <td>{team.courseCode}</td>
      <td>{team.name}</td>
      <td>{team.members.map((m) => m.name).join(', ') || 'none'}</td>
      <td>{team.supervisors.map((s) => s.name).join(', ') || 'none'}</td>
      <td style={{ minWidth: 260 }}>
        <AddPerson team={team} kind="members" candidates={eligible('STUDENT')} onUpdated={onUpdated} onError={onError} />
        <AddPerson team={team} kind="supervisors" candidates={eligible('SUPERVISOR')} onUpdated={onUpdated} onError={onError} />
      </td>
    </tr>
  )
}

function AddPerson({ team, kind, candidates, onUpdated, onError }: {
  team: Team
  kind: 'members' | 'supervisors'
  candidates: AdminUser[]
  onUpdated: (team: Team) => void
  onError: (message: string) => void
}) {
  const [userId, setUserId] = useState('')
  const [saving, setSaving] = useState(false)
  const noun = kind === 'members' ? 'member' : 'supervisor'

  async function add() {
    if (!userId || saving) return
    setSaving(true)
    onError('')
    try {
      const res = await api<{ team: Team }>(`/admin/teams/${team.id}/${kind}`, { method: 'POST', body: { userId: Number(userId) } })
      setUserId('')
      onUpdated(res.team)
    } catch (caught) {
      // A 400 carries its message in fields.userId; show that, or the general message.
      onError(caught instanceof ApiError ? caught.fields.userId ?? caught.message : messageOf(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="input-group input-group-sm mb-1">
      <select
        className="form-select"
        aria-label={`Add ${noun} to ${team.name}`}
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
      >
        <option value="">{kind === 'members' ? 'Choose a student…' : 'Choose a supervisor…'}</option>
        {candidates.map((u) => (
          <option key={u.id} value={u.id}>{u.name}</option>
        ))}
      </select>
      <button type="button" className="btn btn-outline-primary" disabled={!userId || saving} onClick={add}>
        {`Add ${noun}`}
      </button>
    </div>
  )
}

function AccountsSection({ onChanged }: { onChanged: () => void }) {
  const [roleFilter, setRoleFilter] = useState<'' | Role>('')
  const { data, error, loading, reload } = useApi<{ items: AdminUser[] }>(roleFilter ? `/admin/users?role=${roleFilter}` : '/admin/users')
  const [accounts, setAccounts] = useState<AdminUser[] | null>(null)
  const [confirming, setConfirming] = useState<AdminUser | null>(null)
  const [actionError, setActionError] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => setAccounts(data?.items ?? null), [data])

  async function deactivate(target: AdminUser) {
    setSaving(true)
    setActionError('')
    try {
      const { user } = await api<{ user: AdminUser }>(`/admin/users/${target.id}/deactivate`, { method: 'POST' })
      setAccounts((list) => (list ?? []).map((u) => (u.id === user.id ? user : u)))
      onChanged()
    } catch (caught) {
      setActionError(messageOf(caught))
    } finally {
      setSaving(false)
      setConfirming(null)
    }
  }

  return (
    <section aria-labelledby="admin-accounts-heading">
      <div className="d-flex flex-wrap justify-content-between align-items-end gap-2 mb-2">
        <h2 id="admin-accounts-heading" className="h5 mb-0">Accounts</h2>
        <div>
          <label htmlFor="accounts-role" className="form-label small mb-1">Role</label>
          <select id="accounts-role" className="form-select form-select-sm" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as '' | Role)}>
            <option value="">All roles</option>
            <option value="STUDENT">Student</option>
            <option value="SUPERVISOR">Supervisor</option>
            <option value="ADMIN">Admin</option>
          </select>
        </div>
      </div>
      {actionError && <div className="alert alert-danger" role="alert">{actionError}</div>}
      {loading && <Loading />}
      {error && <ErrorAlert message={error.message} onRetry={reload} />}
      {accounts && accounts.length === 0 && <p className="text-body-secondary">No accounts.</p>}
      {accounts && accounts.length > 0 && (
        <div className="table-responsive">
          <table className="table align-middle">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">E-mail</th>
                <th scope="col">Role</th>
                <th scope="col">Status</th>
                <th scope="col"><span className="visually-hidden">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td className="text-break">{u.email}</td>
                  <td>{ROLE_LABEL[u.role]}</td>
                  <td>{u.isActive ? <span className="badge text-bg-success">Active</span> : <span className="badge text-bg-secondary">Inactive</span>}</td>
                  <td className="text-end">
                    {u.isActive && u.role !== 'ADMIN' && (
                      <button type="button" className="btn btn-outline-danger btn-sm" aria-label={`Deactivate ${u.name}`} onClick={() => setConfirming(u)}>
                        Deactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {confirming && (
        <ConfirmDeactivate user={confirming} saving={saving} onConfirm={() => deactivate(confirming)} onCancel={() => setConfirming(null)} />
      )}
    </section>
  )
}

function ConfirmDeactivate({ user, saving, onConfirm, onCancel }: {
  user: AdminUser
  saving: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <>
      <div className="modal d-block" tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="confirm-deactivate-text">
        <div className="modal-dialog modal-dialog-centered">
          <div className="modal-content">
            <div className="modal-body">
              <p id="confirm-deactivate-text" className="mb-0">
                Deactivate {user.name}? They will be signed out and cannot sign in again. Their past work is kept.
              </p>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving} autoFocus>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={saving}>
                Deactivate
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop show" />
    </>
  )
}
