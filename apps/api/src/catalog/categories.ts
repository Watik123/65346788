import type { PrismaClient } from '../generated/prisma/client'

export interface CategoryDef {
  slug: string
  name: string
  parent?: string
}

/** Категорії сервісу. Спільні для тестових і справжніх даних. */
export const CATEGORIES: CategoryDef[] = [
  { slug: 'elektronika', name: 'Електроніка' },
  { slug: 'pobutova-tekhnika', name: 'Велика побутова техніка' },
  { slug: 'kukhnia', name: 'Техніка для кухні' },
  { slug: 'dim', name: 'Дім і клімат' },
  { slug: 'krasa', name: 'Краса і догляд' },
  { slug: 'enerhiia', name: 'Енергонезалежність' },

  { slug: 'smartfony', name: 'Смартфони', parent: 'elektronika' },
  { slug: 'planshety', name: 'Планшети', parent: 'elektronika' },
  { slug: 'televizory', name: 'Телевізори', parent: 'elektronika' },
  { slug: 'monitory', name: 'Монітори', parent: 'elektronika' },
  { slug: 'navushnyky', name: 'Навушники', parent: 'elektronika' },
  { slug: 'smart-hodynnyky', name: 'Смарт-годинники і браслети', parent: 'elektronika' },
  { slug: 'portatyvna-akustyka', name: 'Портативна акустика', parent: 'elektronika' },
  { slug: 'saundbary', name: 'Саундбари', parent: 'elektronika' },
  { slug: 'ihrovi-konsoli', name: 'Ігрові консолі', parent: 'elektronika' },
  { slug: 'fotoaparaty', name: 'Фотоапарати', parent: 'elektronika' },
  { slug: 'routery', name: 'Wi-Fi роутери', parent: 'elektronika' },

  { slug: 'powerbanky', name: 'Павербанки', parent: 'enerhiia' },
  { slug: 'zaryadni-stantsii', name: 'Зарядні станції', parent: 'enerhiia' },
  { slug: 'heneratory', name: 'Генератори', parent: 'enerhiia' },

  { slug: 'pralni-mashyny', name: 'Пральні машини', parent: 'pobutova-tekhnika' },
  { slug: 'sushylni-mashyny', name: 'Сушильні машини', parent: 'pobutova-tekhnika' },
  { slug: 'kholodylnyky', name: 'Холодильники', parent: 'pobutova-tekhnika' },
  { slug: 'morozylni-kamery', name: 'Морозильні камери', parent: 'pobutova-tekhnika' },
  { slug: 'posudomyini-mashyny', name: 'Посудомийні машини', parent: 'pobutova-tekhnika' },
  { slug: 'plyty', name: 'Плити', parent: 'pobutova-tekhnika' },
  { slug: 'dukhovky', name: 'Духові шафи', parent: 'pobutova-tekhnika' },
  { slug: 'varylni-poverkhni', name: 'Варильні поверхні', parent: 'pobutova-tekhnika' },
  { slug: 'vytyazhky', name: 'Витяжки', parent: 'pobutova-tekhnika' },
  { slug: 'boilery', name: 'Бойлери й водонагрівачі', parent: 'pobutova-tekhnika' },

  { slug: 'mikrokhvylovi-pechi', name: 'Мікрохвильові печі', parent: 'kukhnia' },
  { slug: 'kavovarky', name: 'Кавоварки й кавомашини', parent: 'kukhnia' },
  { slug: 'elektrochainyky', name: 'Електрочайники', parent: 'kukhnia' },
  { slug: 'blendery', name: 'Блендери', parent: 'kukhnia' },
  { slug: 'miksery', name: 'Міксери', parent: 'kukhnia' },
  { slug: 'kukhonni-kombainy', name: 'Кухонні комбайни', parent: 'kukhnia' },
  { slug: 'multivarky', name: 'Мультиварки', parent: 'kukhnia' },
  { slug: 'aerohryli', name: 'Мультипечі й аерогрилі', parent: 'kukhnia' },
  { slug: 'hryli', name: 'Електрогрилі', parent: 'kukhnia' },
  { slug: 'tostery', name: 'Тостери', parent: 'kukhnia' },
  { slug: 'sokovyzhymalky', name: 'Соковижималки', parent: 'kukhnia' },
  { slug: 'khlibopichky', name: 'Хлібопічки', parent: 'kukhnia' },

  { slug: 'pylososy', name: 'Пилососи', parent: 'dim' },
  { slug: 'roboty-pylososy', name: 'Роботи-пилососи', parent: 'dim' },
  { slug: 'prasky', name: 'Праски', parent: 'dim' },
  { slug: 'vidparyuvachi', name: 'Відпарювачі й парогенератори', parent: 'dim' },
  { slug: 'kondytsionery', name: 'Кондиціонери', parent: 'dim' },
  { slug: 'obihrivachi', name: 'Обігрівачі', parent: 'dim' },
  { slug: 'ventyliatory', name: 'Вентилятори', parent: 'dim' },
  { slug: 'zvolozhuvachi', name: 'Зволожувачі повітря', parent: 'dim' },
  { slug: 'ochyshchuvachi', name: 'Очищувачі повітря', parent: 'dim' },

  { slug: 'feny', name: 'Фени й стайлери', parent: 'krasa' },
  { slug: 'elektrobrytvy', name: 'Електробритви й тримери', parent: 'krasa' },
  { slug: 'zubni-shchitky', name: 'Електричні зубні щітки', parent: 'krasa' },
]

/**
 * Суміжні категорії, між якими шукаємо той самий товар: магазини кладуть його в різні розділи
 * (планетарний міксер то в «Міксери», то в «Кухонні комбайни», відпарювач то окремо, то серед прасок).
 */
const MATCH_GROUPS: string[][] = [
  ['miksery', 'kukhonni-kombainy', 'blendery'],
  ['prasky', 'vidparyuvachi'],
  ['pylososy', 'roboty-pylososy'],
  ['multivarky', 'aerohryli', 'hryli'],
  ['kholodylnyky', 'morozylni-kamery'],
  ['plyty', 'varylni-poverkhni', 'dukhovky', 'mikrokhvylovi-pechi'],
  ['pralni-mashyny', 'sushylni-mashyny'],
  ['obihrivachi', 'ventyliatory', 'kondytsionery'],
  ['zvolozhuvachi', 'ochyshchuvachi'],
  ['portatyvna-akustyka', 'saundbary'],
  ['powerbanky', 'zaryadni-stantsii'],
]
const GROUP_OF = new Map(MATCH_GROUPS.flatMap((g) => g.map((slug) => [slug, g[0] as string] as const)))

/** Група категорій, у межах якої товари різних магазинів можуть бути тим самим товаром */
export const matchGroup = (slug: string): string => GROUP_OF.get(slug) ?? slug

/** Категорії, яких на сайті більше немає: їхні записи в сховищі пропускаються під час імпорту */
export const REMOVED_CATEGORIES: ReadonlySet<string> = new Set(['noutbuky'])

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
