import { RELEASE, type ReleaseInfo } from '../release'

const REPO_URL = 'https://github.com/UsernameJillzaza/coursepm'

// Issue #29 (C-06): the visible release marker. The short SHA links to the
// exact commit on GitHub; the full SHA is in the title for screenshots/evidence.
export default function ReleaseFooter({ release = RELEASE }: { release?: ReleaseInfo }) {
  return (
    <footer className="container border-top mt-5 py-3 small text-body-secondary">
      {release ? (
        <>
          CoursePM release{' '}
          <a href={`${REPO_URL}/commit/${release.commit}`} title={release.commit} target="_blank" rel="noreferrer">
            <code>{release.short}</code>
          </a>
        </>
      ) : (
        'CoursePM development build'
      )}
    </footer>
  )
}
