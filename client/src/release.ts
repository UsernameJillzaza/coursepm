// Issue #29 (C-06): which commit this client bundle was built from, so the
// running release can be read off the page. The Docker build passes the full
// commit SHA that the deploy workflow tags the image with as VITE_APP_COMMIT;
// local builds and the CI image have none and show "Development build".
const SHA = /^[0-9a-f]{40}$/

export type ReleaseInfo = { commit: string; short: string } | null

export function releaseInfo(raw: string | undefined): ReleaseInfo {
  const commit = (raw ?? '').trim().toLowerCase()
  if (!SHA.test(commit)) return null
  return { commit, short: commit.slice(0, 7) }
}

export const RELEASE: ReleaseInfo = releaseInfo(import.meta.env.VITE_APP_COMMIT)
