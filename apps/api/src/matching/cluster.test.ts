import { describe, expect, it } from 'vitest'
import { clusterOffers, type ClusterItem } from './cluster'
import { MatchDecisions } from './decisions'

const item = (shop: string, id: string, name: string, over: Partial<ClusterItem['fields']> = {}): ClusterItem => ({
  key: `${shop}:${id}`,
  shop,
  group: 'smartfony',
  fields: { brand: 'OnePlus', name, modelCode: null, ean: null, ...over },
})
const groups = (items: ClusterItem[], decisions = new MatchDecisions()) =>
  clusterOffers(items, decisions)
    .clusters.map((c) => c.members.map((m) => m.key).sort().join(' + '))
    .sort()

describe('clusterOffers', () => {
  // Цитрус пише товар без коду, Foxtrot із кодом і зайвим словом, KTC з кодом
  const citrus = item('citrus', '1', 'Смартфон OnePlus Nord CE6 8/256GB (Fresh Blue)')
  const foxtrot = item('foxtrot', '2', 'Телефон ONEPLUS Nord CE6 5G 8/256GB Fresh Blue (OPNCE65G8256FBL)')
  const ktc = item('ktc', '3', 'Смартфон OnePlus Nord CE6 8/256GB Fresh Blue (OPNCE65G8256FBL)')

  it('результат не залежить від порядку магазинів: групи, пов\'язані через третій магазин, з\'єднуються', () => {
    const expected = ['citrus:1 + foxtrot:2 + ktc:3']
    expect(groups([citrus, foxtrot, ktc])).toEqual(expected)
    expect(groups([foxtrot, citrus, ktc])).toEqual(expected)
    expect(groups([ktc, citrus, foxtrot])).toEqual(expected)
  })

  it('товари одного магазину не зливаються; двом однаковим спискам дістаються різні товари', () => {
    const twin = item('foxtrot', '9', 'Телефон ONEPLUS Nord CE6 5G 8/256GB Fresh Blue (OPNCE65G8256FBL)')
    const out = groups([foxtrot, twin, ktc])
    expect(out).toHaveLength(2)
    expect(out.some((g) => g.includes('foxtrot:2') && g.includes('foxtrot:9'))).toBe(false)
  })

  it('пряма суперечність з будь-якою пропозицією групи не дає приєднатись', () => {
    // Чорний не може потрапити до групи синього, хоч код серії спільний
    const black = item('moyo', '4', 'Смартфон OnePlus Nord CE6 8/256GB Black (OPNCE65G8256FBL)')
    expect(groups([citrus, ktc, black])).toEqual(['citrus:1 + ktc:3', 'moyo:4'])
  })

  it('штрихкод і рішення людини сильніші за назви', () => {
    const a = item('a', '1', 'Навушники Alfa One', { brand: 'Alfa', ean: '4006381333931' })
    const b = item('b', '2', 'Гарнітура Alfa Uno (чорна)', { brand: 'Alfa', ean: '4006381333931' })
    expect(groups([a, b])).toEqual(['a:1 + b:2'])

    const same = new MatchDecisions([{ a: 'citrus:1', b: 'moyo:7', decision: 'same', at: '' }])
    const other = item('moyo', '7', 'OnePlus CE6 синій')
    expect(groups([citrus, other], same)).toEqual(['citrus:1 + moyo:7'])

    const different = new MatchDecisions([{ a: 'foxtrot:2', b: 'ktc:3', decision: 'different', at: '' }])
    expect(groups([foxtrot, ktc], different)).toEqual(['foxtrot:2', 'ktc:3'])
  })

  it('схожі, але не напевно однакові товари потрапляють у спірні пари', () => {
    const a = item('a', '1', 'Робот-пилосос Xiaomi Robot Vacuum H50 Pro', { brand: 'Xiaomi' })
    const b = item('b', '2', 'Робот-пилосос Xiaomi Robot Vacuum H50 Pro Station', { brand: 'Xiaomi' })
    const { clusters, reviews } = clusterOffers([a, b], new MatchDecisions())
    expect(clusters).toHaveLength(2)
    expect(reviews).toMatchObject([{ a: 'b:2', b: 'a:1' }])
  })
})
