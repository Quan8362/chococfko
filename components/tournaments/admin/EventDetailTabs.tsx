'use client'

// Top-level tab shell for the event workspace page (Prompt 15C-1). Adds a "Luật thi đấu" (rules) tab
// beside the existing competition workspace WITHOUT redesigning the workspace itself: each tab's body
// is a server-rendered slot passed in as a prop. Shared by BOTH the Site-Admin and scoped mounts so
// they use one implementation. Implements the WAI-ARIA tabs pattern (roving tabindex, arrow-key
// navigation) via the shared WorkspaceTabs list; both panels' content is provided eagerly (already
// fetched on the server) and only the active one is shown.

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import WorkspaceTabs from './WorkspaceTabs'

type Tab = 'competition' | 'rules'

export default function EventDetailTabs({
  competition,
  rules,
  showRules,
}: {
  competition: React.ReactNode
  rules: React.ReactNode
  showRules: boolean
}) {
  const t = useTranslations('admin_event_rules')
  const [tab, setTab] = useState<Tab>('competition')
  const active = !showRules ? 'competition' : tab

  return (
    <div>
      <WorkspaceTabs<Tab>
        tabs={[
          { id: 'competition', label: t('tab_competition'), show: true },
          { id: 'rules', label: t('tab_rules'), show: showRules },
        ]}
        active={active}
        onSelect={setTab}
        idPrefix="event-detail"
        ariaLabel={t('tabs_aria')}
      />
      <div id="event-detail-panel" role="tabpanel" aria-labelledby={`event-detail-tab-${active}`}>
        <div hidden={active !== 'competition'}>{competition}</div>
        {showRules && <div hidden={active !== 'rules'}>{rules}</div>}
      </div>
    </div>
  )
}
