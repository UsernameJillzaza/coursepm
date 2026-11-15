// R-02 shared states (SDS §3): loading spinner, error alert with Retry.
export function Loading() {
  return (
    <div className="d-flex justify-content-center py-4" role="status" aria-label="Loading">
      <div className="spinner-border" />
    </div>
  )
}

export function ErrorAlert({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="alert alert-danger d-flex justify-content-between align-items-center" role="alert">
      <span>{message}</span>
      {onRetry && (
        <button type="button" className="btn btn-outline-danger btn-sm" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  )
}
