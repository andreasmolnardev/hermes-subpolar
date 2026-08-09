import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <main className="setup-page flex min-h-screen items-center justify-center px-5">
      <section className="setup-card w-full max-w-md rounded-2xl p-8 text-center">
        <p className="setup-eyebrow">404</p>
        <h1 className="mt-2 text-2xl font-semibold">Page not found</h1>
        <p className="setup-copy mt-2">That workspace route does not exist.</p>
        <Link to="/chat/new" className="setup-primary mt-6 inline-block">
          Open workspace
        </Link>
      </section>
    </main>
  )
}
