import { describe, expect, it } from 'vitest'
import { canonicalBrand } from './brands'

describe('canonicalBrand', () => {
  it('однаково пише бренди з різних магазинів', () => {
    expect(canonicalBrand('SAMSUNG')).toBe('Samsung')
    expect(canonicalBrand('samsung')).toBe('Samsung')
    expect(canonicalBrand('HISENSE')).toBe('Hisense')
    expect(canonicalBrand('Asus')).toBe('ASUS')
    expect(canonicalBrand('LG')).toBe('LG')
    expect(canonicalBrand('Realme')).toBe('realme')
    expect(canonicalBrand('KARCHER')).toBe('Kärcher')
    expect(canonicalBrand('2E')).toBe('2E')
  })

  it('невідомі: ВЕЛИКІ довгі в звичайний запис, короткі абревіатури й змішаний регістр без змін', () => {
    expect(canonicalBrand('DREAM MACHINES')).toBe('Dream Machines')
    expect(canonicalBrand('JBL')).toBe('JBL')
    expect(canonicalBrand('  NewBrand ')).toBe('NewBrand')
  })
})
