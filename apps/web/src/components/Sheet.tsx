import { useEffect, useRef, type ReactNode } from 'react'
import { CloseIcon } from './icons'

interface Props {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer: ReactNode
}

/** Нижня панель для телефона: фільтри відкриваються поверх стрічки. Esc і клік по затемненню закривають. */
export function Sheet({ open, title, onClose, children, footer }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div className="relative flex max-h-[88dvh] w-full flex-col rounded-t-3xl bg-surface shadow-xl sm:max-w-md sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-base font-bold">{title}</h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Закрити" className="grid size-10 place-items-center rounded-full text-ink-2 hover:bg-surface-2">
            <CloseIcon />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        <div className="border-t border-line px-5 py-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          {footer}
        </div>
      </div>
    </div>
  )
}
