import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AppButton } from './AppButton'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
  componentStack: string | null
  copied: boolean
}

/**
 * Catches render-time crashes so a single bad screen shows a recoverable
 * message instead of a blank white app.
 *
 * It also *shows what happened*. It used to say only "reloading usually fixes
 * it" and put the real error in the console — which is fine on a laptop and
 * useless on a phone, where there is no console to open. The one person who
 * can see the failure is the person holding the device, so the screen hands
 * them something they can send on.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: null, copied: false }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error:', error, info.componentStack)
    this.setState({ componentStack: info.componentStack ?? null })
  }

  private handleReload = () => {
    // A full reload is the honest recovery here: state may be inconsistent.
    window.location.reload()
  }

  /** Everything worth sending, in one block. */
  private report(): string {
    const { error, componentStack } = this.state
    return [
      `Error: ${error?.name ?? 'Error'}: ${error?.message ?? 'unknown'}`,
      `Where: ${window.location.hash || '/'}`,
      '',
      error?.stack ?? '(no stack)',
      '',
      'Component stack:',
      componentStack ?? '(none)',
    ].join('\n')
  }

  private handleCopy = () => {
    void navigator.clipboard
      ?.writeText(this.report())
      .then(() => {
        this.setState({ copied: true })
        setTimeout(() => this.setState({ copied: false }), 2000)
      })
      .catch(() => {
        // Clipboard blocked — the text is on screen to be selected by hand.
      })
  }

  render() {
    const { error, copied } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-ink-950 px-6 py-10">
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="text-2xl font-bold text-fg">Something went wrong</h1>
          <p className="text-sm text-fg-muted">
            The app hit an unexpected error. Reloading usually fixes it.
          </p>

          <AppButton size="lg" fullWidth onClick={this.handleReload}>
            Reload app
          </AppButton>

          {/*
            Open by default. A collapsed panel is a panel nobody opens, and the
            message is the whole reason this screen is worth more than a blank
            one.
          */}
          <details open className="text-left">
            <summary className="cursor-pointer text-meta text-fg-subtle uppercase">
              What happened
            </summary>

            <pre className="mt-2 max-h-56 overflow-auto rounded-control border border-hairline bg-ink-900 p-3 text-left text-meta whitespace-pre-wrap text-fg-muted">
              {this.report()}
            </pre>

            <AppButton
              variant="secondary"
              size="sm"
              fullWidth
              className="mt-2"
              onClick={this.handleCopy}
            >
              {copied ? 'Copied' : 'Copy details'}
            </AppButton>
          </details>
        </div>
      </div>
    )
  }
}
