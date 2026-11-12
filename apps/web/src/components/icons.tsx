import type { ReactNode, SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Icon({ size = 20, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const CheckIcon = (p: IconProps) => <Icon {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Icon>
export const CloseIcon = (p: IconProps) => <Icon {...p}><path d="M6 6l12 12M18 6L6 18" /></Icon>
export const InfoIcon = (p: IconProps) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.8v.2" /></Icon>
export const ChevronLeftIcon = (p: IconProps) => <Icon {...p}><path d="M14.5 6l-6 6 6 6" /></Icon>
export const ChevronRightIcon = (p: IconProps) => <Icon {...p}><path d="M9.5 6l6 6-6 6" /></Icon>
export const ArrowLeftIcon = (p: IconProps) => <Icon {...p}><path d="M19 12H5M11 6l-6 6 6 6" /></Icon>
export const ExternalIcon = (p: IconProps) => <Icon {...p}><path d="M14 4h6v6M20 4l-9 9M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" /></Icon>
export const SearchIcon = (p: IconProps) => <Icon {...p}><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></Icon>
export const HeartIcon = ({ filled, ...p }: IconProps & { filled?: boolean }) => (
  <Icon {...p}>
    <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z" fill={filled ? 'currentColor' : 'none'} />
  </Icon>
)
export const LinkIcon = (p: IconProps) => <Icon {...p}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></Icon>
export const ArrowDownIcon = (p: IconProps) => <Icon {...p}><path d="M12 5v14M6 13l6 6 6-6" /></Icon>
export const FilterIcon = (p: IconProps) => <Icon {...p}><path d="M4 6h16M7 12h10M10 18h4" /></Icon>
export const SunIcon = (p: IconProps) => <Icon {...p}><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" /></Icon>
export const MoonIcon = (p: IconProps) => <Icon {...p}><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></Icon>
export const SystemIcon = (p: IconProps) => <Icon {...p}><rect x="3" y="4.5" width="18" height="12" rx="2" /><path d="M8.5 20h7M12 16.5V20" /></Icon>
export const StarIcon = ({ size = 14, ...rest }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" {...rest}>
    <path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4L2.8 9.5l6.4-.8z" />
  </svg>
)

/** Логотип: цінник із галочкою */
export const LogoMark = ({ size = 28, ...rest }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false" {...rest}>
    <rect width="32" height="32" rx="8" fill="var(--accent)" />
    <path d="M9 16.5l4.5 4.5L23 11.5" fill="none" stroke="var(--accent-ink)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/* Значки категорій для заглушок замість фото */
const CATEGORY_ICONS: Record<string, (p: IconProps) => ReactNode> = {
  televizory: (p) => <Icon {...p}><rect x="3" y="5" width="18" height="12" rx="2" /><path d="M8 21h8M12 17v4" /></Icon>,
  planshety: (p) => <Icon {...p}><rect x="4.5" y="2.5" width="15" height="19" rx="2" /><path d="M11 18.5h2" /></Icon>,
  smartfony: (p) => <Icon {...p}><rect x="7" y="2.5" width="10" height="19" rx="2.2" /><path d="M11 18.5h2" /></Icon>,
  'pralni-mashyny': (p) => <Icon {...p}><rect x="4" y="3" width="16" height="18" rx="2" /><circle cx="12" cy="13.5" r="4" /><path d="M7.5 6.5h2M15.5 6.5h1" /></Icon>,
  kholodylnyky: (p) => <Icon {...p}><rect x="6" y="2.5" width="12" height="19" rx="2" /><path d="M6 10h12M9 5.5v2M9 12.5v3" /></Icon>,
  pylososy: (p) => <Icon {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" /><path d="M12 3v3" /></Icon>,  navushnyky: (p) => <Icon {...p}><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><rect x="3" y="13.5" width="4" height="6.5" rx="1.5" /><rect x="17" y="13.5" width="4" height="6.5" rx="1.5" /></Icon>,
  'smart-hodynnyky': (p) => <Icon {...p}><rect x="6.5" y="6.5" width="11" height="11" rx="3" /><path d="M9 6.5l.7-3.5h4.6l.7 3.5M9 17.5l.7 3.5h4.6l.7-3.5M12 10v2.2l1.5 1" /></Icon>,
  'portatyvna-akustyka': (p) => <Icon {...p}><rect x="6" y="2.5" width="12" height="19" rx="2.5" /><circle cx="12" cy="14.5" r="3.2" /><circle cx="12" cy="7" r="1.2" /></Icon>,
  'ihrovi-konsoli': (p) => <Icon {...p}><path d="M7 8h10a4.5 4.5 0 0 1 4.4 5.4l-.6 2.9a2.3 2.3 0 0 1-4.1.8L15.5 15h-7l-1.2 2.1a2.3 2.3 0 0 1-4.1-.8l-.6-2.9A4.5 4.5 0 0 1 7 8z" /><path d="M7.5 10.5v3M6 12h3M15.5 11h.01M17.5 13h.01" /></Icon>,
  fotoaparaty: (p) => <Icon {...p}><path d="M3.5 8.5A1.5 1.5 0 0 1 5 7h2.5l1.5-2.5h6L16.5 7H19a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z" /><circle cx="12" cy="13" r="3.5" /></Icon>,
  routery: (p) => <Icon {...p}><rect x="3" y="14" width="18" height="6" rx="1.5" /><path d="M7 17h.01M10.5 17h.01M12 14V9M8.5 7.5a5 5 0 0 1 7 0M6 5a8.5 8.5 0 0 1 12 0" /></Icon>,
  powerbanky: (p) => <Icon {...p}><rect x="3" y="7.5" width="16" height="9" rx="2" /><path d="M21.5 10.5v3M11.5 9.5l-2 2.7h3l-2 2.8" /></Icon>,
  heneratory: (p) => <Icon {...p}><path d="M13 2.5L5 13.5h6l-1 8 8-11h-6z" /></Icon>,
  plyty: (p) => <Icon {...p}><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M4 8.5h16M8 5.8h.01M12 5.8h.01M16 5.8h.01" /><rect x="7.5" y="11.5" width="9" height="6" rx="1" /></Icon>,
  vytyazhky: (p) => <Icon {...p}><path d="M9 3h6v6l4.5 6.5v2h-15v-2L9 9zM9 21v-1.2M12 21v-1.2M15 21v-1.2" /></Icon>,
  boilery: (p) => <Icon {...p}><rect x="6.5" y="2.5" width="11" height="16" rx="5" /><path d="M9.5 18.5V21M14.5 18.5V21M12 9.5a2 2 0 0 0-2 2.2c0 1.2 2 2.8 2 2.8s2-1.600 2-2.800a2 2 0 0 0-2-2.200z" /></Icon>,
  'mikrokhvylovi-pechi': (p) => <Icon {...p}><rect x="2.500" y="5.500" width="19" height="13" rx="2" /><rect x="5.500" y="8.500" width="9.500" height="7" rx="1" /><path d="M18 9.500h.01M18 12h.01M18 14.500h.01" /></Icon>,
  kavovarky: (p) => <Icon {...p}><path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10.500h1.500a2.500 2.500 0 0 1 0 5H16M4 21.500h13M8 3v2.500M11.500 3v2.500" /></Icon>,
  elektrochainyky: (p) => <Icon {...p}><path d="M7 7.500h8l1.500 12h-11zM8.500 7.500V5.500h5v2M15.300 9.500l3.200-1.500v3l-2.700 2.200M5.500 19.500h11" /></Icon>,
  blendery: (p) => <Icon {...p}><path d="M7.500 3h9l-1.500 10h-6zM9 13l-1.500 8h9L15 13M10.500 17.500h3M16.500 5.500H19v3" /></Icon>,
  prasky: (p) => <Icon {...p}><path d="M3 17.500c0-4.500 3.500-7 8-7h9.500v7zM7 10.800V8a2 2 0 0 1 2-2h7M11 14.500h.01M14.500 14.500h.01" /></Icon>,
  kondytsionery: (p) => <Icon {...p}><rect x="2.500" y="5" width="19" height="8" rx="2" /><path d="M6 10h12M7.500 16.500c0 1.200-1 1.500-1 2.700M12 16.500c0 1.200-1 1.500-1 2.700M16.500 16.500c0 1.200-1 1.500-1 2.700" /></Icon>,
  ventyliatory: (p) => <Icon {...p}><circle cx="12" cy="10" r="7.500" /><circle cx="12" cy="10" r="1.300" /><path d="M12 8.700c-.5-2.500.5-4 2-4.200M13.200 10.600c2.300 1 3 2.700 2.400 4.100M10.800 10.600c-2.200 1.200-4 .700-4.800-.600M12 17.500V21M8.500 21.500h7" /></Icon>,
  feny: (p) => <Icon {...p}><path d="M3.500 6.500h9a4 4 0 0 1 0 8h-9zM16.500 9.500l4-1.500v5l-4-1.500M7 14.500l1.500 6.500h3l-1-6.500" /></Icon>,
  elektrobrytvy: (p) => <Icon {...p}><rect x="7.500" y="8.500" width="9" height="13" rx="3" /><path d="M7 8.500V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2.500M10 6.500h4M12 12.500v2.500" /></Icon>,
  'zubni-shchitky': (p) => <Icon {...p}><rect x="10" y="9.500" width="4" height="12" rx="2" /><path d="M10.500 9.500v-5a1.500 1.500 0 0 1 3 0v5M8 3.500h2.500M8 5.500h2.500M12 13.500v2" /></Icon>,
}

/** Схожі категорії з тим самим значком */
const ICON_ALIAS: Record<string, string> = {
  monitory: 'televizory',
  saundbary: 'portatyvna-akustyka',
  'roboty-pylososy': 'pylososy',
  'sushylni-mashyny': 'pralni-mashyny',
  'posudomyini-mashyny': 'pralni-mashyny',
  'morozylni-kamery': 'kholodylnyky',
  dukhovky: 'plyty',
  'varylni-poverkhni': 'plyty',
  'zaryadni-stantsii': 'powerbanky',
  miksery: 'blendery',
  'kukhonni-kombainy': 'blendery',
  sokovyzhymalky: 'blendery',
  multivarky: 'mikrokhvylovi-pechi',
  aerohryli: 'mikrokhvylovi-pechi',
  hryli: 'mikrokhvylovi-pechi',
  tostery: 'mikrokhvylovi-pechi',
  khlibopichky: 'mikrokhvylovi-pechi',
  vidparyuvachi: 'prasky',
  obihrivachi: 'kondytsionery',
  zvolozhuvachi: 'ventyliatory',
  ochyshchuvachi: 'ventyliatory',
}

export function CategoryIcon({ slug, ...rest }: IconProps & { slug: string }) {
  const render = CATEGORY_ICONS[ICON_ALIAS[slug] ?? slug]
  if (render) return <>{render(rest)}</>
  return <Icon {...rest}><path d="M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8" /></Icon>
}
