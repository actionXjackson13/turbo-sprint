import { NavLink } from 'react-router-dom'
import clsx from 'clsx'
import type { ReactNode } from 'react'

export interface NavItem {
  to: string
  label: string
  icon: ReactNode
  /** Small count bubble (e.g. new requests awaiting the DJ). */
  badge?: number
  /** Match only the exact path — used for index routes. */
  end?: boolean
}

export interface BottomNavigationProps {
  items: NavItem[]
}

export function BottomNavigation({ items }: BottomNavigationProps) {
  return (
    <nav
      aria-label="Primary"
      className={clsx(
        'fixed inset-x-0 bottom-0 z-30',
        'mx-auto w-full max-w-shell',
        'border-t border-hairline bg-ink-950/85 backdrop-blur-xl',
        'pb-safe',
      )}
    >
      <ul className="flex items-stretch">
        {items.map((item) => (
          <li key={item.to} className="flex-1">
            <NavLink
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                clsx(
                  'relative flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-1.5',
                  'text-[0.625rem] font-medium tracking-wide transition-colors',
                  isActive
                    ? 'text-brand-400'
                    : 'text-fg-subtle hover:text-fg-muted',
                )
              }
            >
              <span className="relative" aria-hidden="true">
                {item.icon}
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-4 rounded-full bg-brand-500 px-1 text-[10px] leading-4 font-bold text-white">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </span>
              <span className="truncate">{item.label}</span>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="sr-only">{item.badge} new</span>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
