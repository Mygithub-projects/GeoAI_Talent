'use client'

import { useState } from 'react'
import { NavRail } from './NavRail'
import { TopBar } from './TopBar'
import { AssistantDrawer } from './AssistantDrawer'
import { signOut } from '@/app/(protected)/actions'

interface AppShellProps {
  children: React.ReactNode
  userName: string | null
  userRole: string
  pendingCount?: number
}

export function AppShell({ children, userName, userRole, pendingCount = 0 }: AppShellProps) {
  const [navExpanded, setNavExpanded] = useState(false)
  const [assistantOpen, setAssistantOpen] = useState(false)

  return (
    <div className="flex h-full flex-col">
      <TopBar
        userName={userName}
        userRole={userRole}
        onToggleNav={() => setNavExpanded(v => !v)}
        onToggleAssistant={() => setAssistantOpen(v => !v)}
        assistantOpen={assistantOpen}
        onSignOut={signOut}
      />

      <div className="flex flex-1 overflow-hidden">
        <NavRail
          expanded={navExpanded}
          onToggle={() => setNavExpanded(v => !v)}
          userRole={userRole}
          pendingCount={pendingCount}
        />

        <main className="relative flex-1 overflow-hidden">
          {children}
        </main>

        <AssistantDrawer
          open={assistantOpen}
          onClose={() => setAssistantOpen(false)}
        />
      </div>
    </div>
  )
}
