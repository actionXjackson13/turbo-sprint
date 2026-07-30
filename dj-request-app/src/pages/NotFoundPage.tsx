import { useNavigate } from 'react-router-dom'
import { AppButton, EmptyState } from '../components'
import { RootLayout } from '../layouts/RootLayout'
import { routes } from '../lib/router'

export function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <RootLayout>
      <div className="flex flex-1 items-center justify-center">
        <EmptyState
          title="Page not found"
          description="That link doesn't lead anywhere in the app."
          action={
            <AppButton size="lg" onClick={() => navigate(routes.welcome)}>
              Go home
            </AppButton>
          }
        />
      </div>
    </RootLayout>
  )
}
