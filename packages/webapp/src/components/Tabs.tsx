import { Content, List, Root, Trigger } from '@radix-ui/react-tabs'
import { FC, ReactNode, useEffect, useRef, useState } from 'react'

interface TabItem {
  value: string
  label: ReactNode
  content?: ReactNode
}

interface TabsProps extends Omit<ComponentProps, 'onChange'> {
  tabs: TabItem[]
  action?: ReactNode
  defaultTab?: string
  onChange?: (tab: string) => void
}

const TabsComponent: FC<TabsProps> = ({ className, tabs, defaultTab, action, onChange }) => {
  const triggersRef = useRef<AnyMap<string, HTMLButtonElement | null>>({})

  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0].value)
  const [underlineWidth, setUnderlineWidth] = useState(0)
  const [underlineLeft, setUnderlineLeft] = useState(0)

  function handleLayout() {
    const activeTrigger = triggersRef.current[activeTab]

    if (activeTrigger) {
      setUnderlineWidth(activeTrigger.offsetWidth)
      setUnderlineLeft(activeTrigger.offsetLeft)
    }
  }

  useEffect(() => {
    handleLayout()
  }, [])

  useEffect(() => {
    onChange?.(activeTab)
    handleLayout()
  }, [activeTab, onChange])

  return (
    <Root className={className} value={activeTab} onValueChange={setActiveTab}>
      <div
        className="border-accent-light text-secondary flex h-12 items-center justify-between border-b px-4 pt-4 text-sm font-medium"
        data-slot="nav"
      >
        <List className="relative flex items-center gap-x-6" data-slot="tablist">
          {tabs.map(t => (
            <Trigger
              key={t.value}
              ref={el => (triggersRef.current[t.value] = el as Any)}
              className="text-secondary aria-selected:text-primary pb-3"
              data-slot="tab"
              data-tab={t.value}
              role="tab"
              aria-selected={activeTab === t.value ? 'true' : 'false'}
              value={t.value}
            >
              {t.label}
            </Trigger>
          ))}

          <div
            className="bg-primary absolute bottom-0 left-0 h-0.5 rounded-full transition-all duration-300"
            data-slot="underline"
            style={{
              width: underlineWidth,
              transform: `translateX(${underlineLeft}px)`
            }}
          />
        </List>

        {action}
      </div>

      {tabs.map(t => (
        <Content key={t.value} value={t.value} data-slot="content" data-content={t.value}>
          {t.content}
        </Content>
      ))}
    </Root>
  )
}

const SegmentedControl: FC<TabsProps> = ({ className, tabs, defaultTab, action, onChange }) => {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0].value)

  useEffect(() => {
    onChange?.(activeTab)
  }, [activeTab, onChange])

  return (
    <Root className={className} value={activeTab} onValueChange={setActiveTab}>
      <div className="bg-accent-light text-secondary grid h-10 rounded-full p-1" data-slot="nav">
        <List className="flex items-center gap-x-1" data-slot="tablist">
          {tabs.map(t => (
            <Trigger
              key={t.value}
              className="text-secondary hover:text-primary aria-selected:bg-foreground aria-selected:text-primary w-full flex-1 rounded-full px-3 py-1 text-sm/6 font-medium"
              data-slot="tab"
              data-tab={t.value}
              role="tab"
              aria-selected={activeTab === t.value ? 'true' : 'false'}
              value={t.value}
            >
              {t.label}
            </Trigger>
          ))}
        </List>

        {action}
      </div>

      {tabs.map(t => (
        <Content key={t.value} value={t.value} data-slot="content" data-content={t.value}>
          {t.content}
        </Content>
      ))}
    </Root>
  )
}

export const Tabs = Object.assign(TabsComponent, {
  SegmentedControl
})
