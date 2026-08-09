import { PageHeader } from '../../components'
import { RootLayout } from '../../layouts/RootLayout'
import { SetsPanel } from './panels/SetsPanel'

/**
 * Sets, from outside a party.
 *
 * The same panel the Features tab shows, minus the ability to load one into a
 * queue — there is no queue here. This is the between-nights view: build the
 * list on Tuesday, use it on Friday.
 */
export function SetsPage() {
  return (
    <RootLayout>
      <PageHeader
        title="My sets"
        subtitle="Lists you can drop into any night"
        showBack
      />
      <main className="flex-1 px-4 py-5">
        <SetsPanel />
      </main>
    </RootLayout>
  )
}
