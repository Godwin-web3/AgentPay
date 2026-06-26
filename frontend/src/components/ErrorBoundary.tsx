import { Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'

interface Props {
  children: ReactNode
  onReset?: () => void
}

interface State {
  hasError: boolean
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info)
  }

  handleReset = () => {
    this.setState({ hasError: false })
    if (this.props.onReset) this.props.onReset()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 1,
          padding: 40,
          gap: 16,
          fontFamily: 'var(--font-mono)',
        }}>
          <div style={{ fontSize: 32 }}>!</div>
          <div style={{
            fontSize: 14,
            color: 'var(--danger)',
            letterSpacing: 2,
            textTransform: 'uppercase',
          }}>
            Something went wrong
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', maxWidth: 320 }}>
            The view encountered an error. You can reset to the Terminal to continue.
          </div>
          <button
            onClick={this.handleReset}
            className="send-btn"
            style={{ marginTop: 8 }}
          >
            BACK TO TERMINAL
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
