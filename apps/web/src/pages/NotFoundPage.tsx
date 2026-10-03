import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-2xl font-bold">Такої сторінки немає</h1>
      <p className="mt-2 text-ink-2">Перевірте адресу або поверніться до стрічки.</p>
      <Link to="/" className="mt-6 inline-flex min-h-11 items-center rounded-full bg-ink px-5 text-sm font-semibold text-canvas">
        До стрічки знижок
      </Link>
    </div>
  )
}
