import { render, screen } from '@testing-library/react'
import ReleaseFooter from '../../src/components/ReleaseFooter'
import { releaseInfo } from '../../src/release'

// Issue #29 (C-06): the footer shows which commit the running bundle was built
// from. The deploy workflow passes the full image-tag SHA as VITE_APP_COMMIT.
const SHA = 'de9213ebf000c224c44bab66b9990f99119c81ab'

describe('Lab 5 release footer', () => {
  it('TEST-L5-08 (C-06): shows the short release SHA linked to the exact commit', () => {
    render(<ReleaseFooter release={releaseInfo(SHA)} />)
    const link = screen.getByRole('link', { name: 'de9213e' })
    expect(link).toHaveAttribute('href', `https://github.com/UsernameJillzaza/coursepm/commit/${SHA}`)
    expect(link).toHaveAttribute('title', SHA)
    expect(screen.getByRole('contentinfo')).toHaveTextContent('CoursePM release de9213e')
  })

  it('TEST-L5-09 (C-06): a missing or malformed commit shows a development build, never a fake release', () => {
    for (const raw of [undefined, '', 'dev', 'de9213e', `${SHA}0`, 'z'.repeat(40), '<script>']) {
      expect(releaseInfo(raw)).toBeNull()
    }
    expect(releaseInfo(` ${SHA.toUpperCase()} `)).toEqual({ commit: SHA, short: 'de9213e' })
    render(<ReleaseFooter release={null} />)
    expect(screen.getByRole('contentinfo')).toHaveTextContent('CoursePM development build')
    expect(screen.queryByRole('link')).toBeNull()
  })
})
