import { describe, expect, it } from 'vitest'
import { vpaProvider } from './vpaProviders'

describe('vpaProvider', () => {
  it('maps Google Pay handles', () => {
    expect(vpaProvider('ved@okhdfcbank')).toBe('Google Pay')
    expect(vpaProvider('shop@okbizaxis')).toBe('Google Pay')
  })

  it('maps PhonePe and Paytm handles', () => {
    expect(vpaProvider('ved@ybl')).toBe('PhonePe')
    expect(vpaProvider('9876543210@paytm')).toBe('Paytm')
  })

  it('is case-insensitive on the suffix', () => {
    expect(vpaProvider('Ved@OkICICI')).toBe('Google Pay')
  })

  it('returns null for unknown suffixes', () => {
    expect(vpaProvider('ved@yescurie')).toBeNull()
  })

  it('returns null for malformed VPAs', () => {
    expect(vpaProvider('no-at-sign')).toBeNull()
  })
})
