import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AppButton } from './AppButton'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Catches render-time crashes so a single bad screen shows a recoverable
 * message instead of a blank white app.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error:', error, info.componentStack)
  }

  private handleReload = () => {
    // A full reload is the honest recovery here: state may be inconsistent.
    window.location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-ink-950 px-6 text-center">
        <h1 className="text-2xl font-bold text-fg">Something went wrong</h1>
        <p className="max-w-xs text-sm text-fg-muted">
          The app hit an unexpected error. Reloading usually fixes it.
        </p>
        <AppButton size="lg" onClick={this.handleReload}>
          Reload app
        </AppButton>
      </div>
    )
  }
}
