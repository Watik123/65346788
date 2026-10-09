import { describe, expect, it } from 'vitest'
import { extractModelCode } from './model-code'

describe('extractModelCode', () => {
  it.each([
    ['Смартфон Samsung Galaxy S26 Ultra 12/512GB Black (SM-S948BZKGEUC)', 'SM-S948BZKGEUC'],
    ['Смартфон Samsung Galaxy A27 5G 8/256 Black (SM-A276BZKCEUC)', 'SM-A276BZKCEUC'],
    ['Телевізор LED LG 43UA75006LA (Smart TV, Wi-Fi, 3840x2160)', '43UA75006LA'],
    ['Телевізор QLED Samsung QE43Q8FAAUXUA (Smart TV, Wi-Fi, 3840x2160)', 'QE43Q8FAAUXUA'],
    ['Ноутбук Lenovo LOQ 15ARP10E 83S0007GRA Luna Grey', '83S0007GRA'],
    ['Ноутбук ASUS Vivobook 15 X1504MA-BQ137 Quiet Blue', 'X1504MA-BQ137'],
    ['Пилосос Philips PowerPro Expert FC9733/09', 'FC9733/09'],
  ])('%s → %s', (name, code) => expect(extractModelCode(name)).toBe(code))

  it.each([
    ['Робот-пилосос Xiaomi Robot Vacuum H50 Pro (1189770)'],
    ['Смартфон Apple iPhone 17 256GB'],
    ['Телевізор Xiaomi TV A Pro 55 2026 (Google TV, Wi-Fi, 3840x2160)'],
  ])('не вигадує код: %s', (name) => {
    const code = extractModelCode(name)
    // Короткі назви серій (H50, A27) не є кодом моделі; хибних кодів характеристик не має бути
    expect(code === null || !/^(\d+GB|\d+X\d+|2026|1189770)$/i.test(code)).toBe(true)
  })

  it('ігнорує характеристики: пам\'ять, роздільність, рік, 5G, Wi-Fi', () => {
    expect(extractModelCode('Смартфон Xiaomi 15T 12/512GB 5G Wi-Fi 2026')).toBeNull()
  })
})
