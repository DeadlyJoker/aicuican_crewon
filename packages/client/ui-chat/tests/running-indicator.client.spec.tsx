// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { RunningIndicator } from '../src/client/chat/RunningIndicator.tsx'

afterEach(cleanup)
it('keeps the running icon decorative and uses the shared session artwork', () => {
  const { container } = render(<RunningIndicator />)
  expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true')
  expect(container.querySelector('svg')).not.toBeNull()
  expect(container.querySelector('img')).toBeNull()
})
