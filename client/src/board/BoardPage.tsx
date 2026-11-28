import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ErrorAlert, Loading } from '../components/States'
import { useApi } from '../components/useApi'
import { bangkokTime } from '../milestones/types'
import { BOARD_COLUMNS, BOARD_LABELS, isBoardState, type Board, type BoardItem, type BoardState } from './types'

// F-10 progress board (FR-15): five read-only columns in BOARD_COLUMNS order.
// The state comes from the server; the filter lives in ?state= so it survives
// a reload and can be shared. An unknown ?state is ignored (shows all).
export default function BoardPage() {
  const { teamId } = useParams()
  const [params, setParams] = useSearchParams()
  const raw = params.get('state')
  const filter: BoardState | null = isBoardState(raw) ? raw : null
  const { data, error, loading, reload } = useApi<Board>(`/teams/${teamId}/board${filter ? `?state=${filter}` : ''}`)

  if (loading) return <main className="container"><Loading /></main>
  if (error?.status === 404) {
    return (
      <main className="container">
        <h1 className="h4">Team not found</h1>
        <p className="text-body-secondary">It doesn't exist, or you aren't a member or supervisor of it.</p>
        <Link to="/teams">Back to My teams</Link>
      </main>
    )
  }
  if (error || !data) return <main className="container"><ErrorAlert message={error?.message ?? 'Error'} onRetry={reload} /></main>

  const { team, counts, items } = data
  const total = BOARD_COLUMNS.reduce((sum, s) => sum + counts[s], 0)
  const shown = filter ? [filter] : BOARD_COLUMNS
  return (
    <main className="container">
      <nav aria-label="breadcrumb">
        <ol className="breadcrumb">
          <li className="breadcrumb-item"><Link to="/teams">My teams</Link></li>
          <li className="breadcrumb-item"><Link to={`/teams/${team.id}`}>{team.name}</Link></li>
          <li className="breadcrumb-item active" aria-current="page">Progress board</li>
        </ol>
      </nav>
      <h1 className="h4 mb-0">{team.name}</h1>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <p className="text-body-secondary mb-0">Progress board</p>
        {filter && (
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setParams({})}>Show all</button>
        )}
      </div>
      {total === 0 && !filter ? (
        <p className="text-body-secondary">No milestones yet.</p>
      ) : (
        <div className="row row-cols-1 row-cols-lg-5 g-3">
          {shown.map((state) => (
            <Column
              key={state}
              state={state}
              count={counts[state]}
              items={items.filter((i) => i.state === state)}
              onSelect={() => setParams({ state })}
            />
          ))}
        </div>
      )}
    </main>
  )
}

function Column({ state, count, items, onSelect }: { state: BoardState; count: number; items: BoardItem[]; onSelect: () => void }) {
  const label = BOARD_LABELS[state]
  return (
    <section className="col" aria-label={label} data-state={state}>
      <h2 className="h6 d-flex align-items-center gap-2">
        <button type="button" className="btn btn-link p-0 fw-semibold text-start" onClick={onSelect}>{label}</button>
        <span className="badge text-bg-secondary" data-testid="count">{count}</span>
      </h2>
      {items.length === 0 ? (
        <p className="text-body-secondary small">No milestones are {label.toLowerCase()}.</p>
      ) : (
        <ul className="list-group">
          {items.map((item) => <Card key={item.milestoneId} item={item} />)}
        </ul>
      )}
    </section>
  )
}

function Card({ item }: { item: BoardItem }) {
  const deadline = `Deadline ${bangkokTime(item.deadline)}${item.extended ? ` (extended from ${bangkokTime(item.originalDeadline)})` : ''}`
  return (
    <li className="list-group-item text-break">
      <strong><Link to={`/milestones/${item.milestoneId}`}>{item.title}</Link></strong>
      <div className="text-body-secondary small">{deadline}</div>
      <div className="small">{item.revisionsUsed} / {item.maxRevisions} revisions</div>
      {item.latest ? (
        <div className="small d-flex flex-wrap gap-1 align-items-center">
          <span>Revision {item.latest.revision} by {item.latest.submittedBy.name}, {bangkokTime(item.latest.submittedAt)}</span>
          {item.latest.hasFeedback && <span className="badge text-bg-success">Feedback given</span>}
        </div>
      ) : (
        <div className="small text-body-secondary">No revision yet</div>
      )}
    </li>
  )
}
