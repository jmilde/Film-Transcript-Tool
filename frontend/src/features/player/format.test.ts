import { describe, expect, it } from 'vitest'
import { formatTime } from './format'

describe('formatTime', () => {
  it('formats sub-hour durations as m:ss', () => {
    expect(formatTime(0)).toBe('0:00')
    expect(formatTime(5)).toBe('0:05')
    expect(formatTime(65)).toBe('1:05')
    expect(formatTime(600)).toBe('10:00')
  })

  it('formats hour-plus durations as h:mm:ss', () => {
    expect(formatTime(3661)).toBe('1:01:01')
  })

  it('guards against NaN / negative input', () => {
    expect(formatTime(NaN)).toBe('0:00')
    expect(formatTime(-4)).toBe('0:00')
  })
})
