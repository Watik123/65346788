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
  noutbuky: (p) => <Icon {...p}><rect x="5" y="5" width="14" height="10" rx="1.5" /><path d="M2.5 19h19" /></Icon>,
  smartfony: (p) => <Icon {...p}><rect x="7" y="2.5" width="10" height="19" rx="2.2" /><path d="M11 18.5h2" /></Icon>,
  'pralni-mashyny': (p) => <Icon {...p}><rect x="4" y="3" width="16" height="18" rx="2" /><circle cx="12" cy="13.5" r="4" /><path d="M7.5 6.5h2M15.5 6.5h1" /></Icon>,
  kholodylnyky: (p) => <Icon {...p}><rect x="6" y="2.5" width="12" height="19" rx="2" /><path d="M6 10h12M9 5.5v2M9 12.5v3" /></Icon>,
  pylososy: (p) => <Icon {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" /><path d="M12 3v3" /></Icon>,
}

export function CategoryIcon({ slug, ...rest }: IconProps & { slug: string }) {
  const render = CATEGORY_ICONS[slug]
  if (render) return <>{render(rest)}</>
  return <Icon {...rest}><path d="M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8" /></Icon>
}
