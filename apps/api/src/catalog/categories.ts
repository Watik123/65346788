import type { PrismaClient } from '../generated/prisma/client'

export interface CategoryDef {
  slug: string
  name: string
  parent?: string
}

/** Категорії сервісу. Спільні для тестових і справжніх даних. */
export const CATEGORIES: CategoryDef[] = [
  { slug: 'elektronika', name: 'Електроніка' },
  { slug: 'pobutova-tekhnika', name: 'Побутова техніка' },
  { slug: 'televizory', name: 'Телевізори', parent: 'elektronika' },
  { slug: 'noutbuky', name: 'Ноутбуки', parent: 'elektronika' },
  { slug: 'smartfony', name: 'Смартфони', parent: 'elektronika' },
  { slug: 'pralni-mashyny', name: 'Пральні машини', parent: 'pobutova-tekhnika' },
  { slug: 'kholodylnyky', name: 'Холодильники', parent: 'pobutova-tekhnika' },
  { slug: 'pylososy', name: 'Пилососи', parent: 'pobutova-tekhnika' },
]

/** Створює відсутні категорії (наявні не чіпає). Повертає slug → id. */
export async function ensureCategories(prisma: PrismaClient): Promise<Map<string, number>> {
  const ids = new Map((await prisma.category.findMany({ select: { id: true, slug: true } })).map((c) => [c.slug, c.id]))
  for (const level of [CATEGORIES.filter((c) => !c.parent), CATEGORIES.filter((c) => c.parent)]) {
    for (const c of level) {
      if (ids.has(c.slug)) continue
      const row = await prisma.category.create({ data: { slug: c.slug, name: c.name, parentId: c.parent ? (ids.get(c.parent) ?? null) : null } })
      ids.set(c.slug, row.id)
    }
  }
  return ids
}
