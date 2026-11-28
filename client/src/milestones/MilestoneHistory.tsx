import { bangkokShort, type HistoryItem } from './types'

function describe(item: HistoryItem) {
  if (item.kind === 'CLOSE') return 'Closed early'
  if (item.kind === 'EXTENSION') return `Extension: ${bangkokShort(item.oldValue!)} → ${bangkokShort(item.newValue!)}`
  if (item.field === 'deadline') return `Deadline: ${bangkokShort(item.oldValue!)} → ${bangkokShort(item.newValue!)}`
  return `Description: “${item.oldValue}” → “${item.newValue}”`
}

// F-08 history (AC-08-10): who, when, what (old → new) and the reason, in the
// server's order (newest first). Shown to everyone in scope.
export default function MilestoneHistory({ items, failed, onRetry }: { items: HistoryItem[] | null; failed: boolean; onRetry: () => void }) {
  return (
    <section className="mt-4" aria-labelledby="history-heading">
      <h2 className="h6" id="history-heading">History</h2>
      {/* Not role="alert" and not a second "Retry": the page's alert and Retry
          belong to the submissions list and the action the user just took. */}
      {failed && (
        <p className="text-danger small">
          The history could not be loaded.{' '}
          <button type="button" className="btn btn-link btn-sm p-0 align-baseline" onClick={onRetry}>Reload history</button>
        </p>
      )}
      {items && items.length === 0 && <p className="text-body-secondary small">No changes since the milestone was created.</p>}
      {items && items.length > 0 && (
        <ul className="list-unstyled small">
          {items.map((item, i) => (
            <li key={i} className="mb-1">
              <span className="text-body-secondary">{bangkokShort(item.at)} · {item.by.name}</span> — {describe(item)}
              {item.reason && <> · Reason: {item.reason}</>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
