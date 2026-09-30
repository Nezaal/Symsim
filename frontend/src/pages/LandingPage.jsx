import { Link } from 'react-router'
import { Activity, ArrowRight, MousePointerClick, Search } from 'lucide-react'
import { getComponentType } from '@systemsim/engine'
import ComponentIcon from '../components/ComponentIcon.jsx'
import { categoryColor } from '../lib/categories.js'

const PIPELINE = [
  { type: 'client', note: '1,000 req/s' },
  { type: 'apiGateway', note: 'limit 1,000 req/s' },
  { type: 'loadBalancer', note: 'round-robin' },
  { type: 'appServer', note: '3 × 2 vCPU', bottleneck: true },
  { type: 'sqlDatabase', note: 'pool 100' },
]

const STEPS = [
  {
    icon: MousePointerClick,
    title: 'Design',
    text: 'Drag gateways, load balancers, app servers, caches, queues and databases onto a canvas and wire them up.',
  },
  {
    icon: Activity,
    title: 'Simulate',
    text: 'Generate synthetic traffic and watch throughput and p50/p95/p99 latency live. Reproducible with a seed.',
  },
  {
    icon: Search,
    title: 'Find the bottleneck',
    text: 'See which component limits throughput and why, then change the design and run it again.',
  },
]

/** Public landing page (/). The app itself lives at /app. */
function LandingPage() {
  return (
    <div className="min-h-full bg-canvas text-ink">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 md:px-6">
        <span className="text-sm font-semibold tracking-tight">SystemSim</span>
        <Link to="/app?signin=1" className="text-sm text-ink-muted hover:text-ink">
          Sign in
        </Link>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-12 md:px-6 md:pt-20">
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight md:text-5xl">
            Design a backend. Push traffic through it. See where it breaks.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-ink-muted">
            SystemSim is a visual system-design simulator. Build an architecture, generate load, and learn why it
            slows down, all in your browser. No servers, no cloud bill.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/app"
              className="flex items-center gap-2 rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent/90"
            >
              Try it now, no account needed <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <Link
              to="/app?signin=1"
              className="rounded-md border border-line px-4 py-2.5 text-sm font-medium text-ink hover:bg-surface-2"
            >
              Sign in to save your designs
            </Link>
          </div>

          <PipelineIllustration />
        </section>

        <section className="border-t border-line bg-surface">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 md:grid-cols-3 md:px-6">
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <div key={title}>
                <p className="flex items-center gap-2 text-sm font-medium text-ink">
                  <Icon size={18} className="text-accent" aria-hidden="true" />
                  {i + 1}. {title}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">{text}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="mx-auto max-w-6xl px-4 py-8 text-xs text-ink-muted md:px-6">
        Simulations run entirely in your browser. No real traffic is sent anywhere.
      </footer>
    </div>
  )
}

/** A static picture of the starter template mid-run, with its bottleneck flagged. */
function PipelineIllustration() {
  return (
    <figure className="mt-14 overflow-x-auto rounded-xl border border-line bg-surface p-6">
      <div className="flex min-w-max items-center gap-3">
        {PIPELINE.map(({ type, note, bottleneck }, i) => {
          const def = getComponentType(type)
          const color = categoryColor(def.category)
          return (
            <div key={type} className="flex items-center gap-3">
              {i > 0 && <ArrowRight size={16} className="text-ink-muted" aria-hidden="true" />}
              <div
                className={`relative w-40 rounded-md border border-l-4 bg-surface-2 px-3 py-2 ${
                  bottleneck ? 'border-red-500 ring-2 ring-red-500/60' : 'border-line'
                }`}
                style={{ borderLeftColor: color }}
              >
                {bottleneck && (
                  <span className="absolute -top-2.5 right-2 rounded bg-red-500 px-1.5 text-[10px] font-medium text-white">
                    Bottleneck
                  </span>
                )}
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <ComponentIcon type={type} size={14} color={color} />
                  {def.label}
                </span>
                <span className="text-xs text-ink-muted">{note}</span>
              </div>
            </div>
          )
        })}
      </div>
      <figcaption className="mt-4 text-sm text-ink-muted">
        <span className="font-medium text-ink">App servers: CPU-bound.</span> 6 cores ÷ 20 ms gives about 300 req/s of
        compute, but 1,000 req/s arrived. Add instances or cores, or reduce processing time.
      </figcaption>
    </figure>
  )
}

export default LandingPage
