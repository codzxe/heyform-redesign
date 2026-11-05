import { IconChevronDown, IconChevronUp, IconLayoutGrid } from '@tabler/icons-react'
import type { FC } from 'react'

import { useTranslation } from '../utils'

import { Button, Tooltip } from '../components'
import { useStore } from '../store'
import { Branding } from './Branding'

export const Footer: FC = () => {
  const { state, dispatch } = useStore()
  const { t } = useTranslation()

  function handlePrevious() {
    dispatch({ type: 'scrollPrevious' })
  }

  function handleNext() {
    dispatch({ type: 'scrollNext' })
  }

  function handleToggleSidebar() {
    dispatch({
      type: 'setIsSidebarOpen',
      payload: {
        isSidebarOpen: !state.isSidebarOpen
      }
    })
  }

  return (
    <div className="myform-footer">
      <div className="myform-footer-wrapper">
        <div className="myform-footer-left"></div>

        <div className="myform-footer-right">
          <div className="myform-pagination">
            {state.enableQuestionList && (
              <Tooltip ariaLabel={t('Questions')}>
                <Button.Link
                  className="myform-sidebar-toggle"
                  leading={<IconLayoutGrid />}
                  onClick={handleToggleSidebar}
                />
              </Tooltip>
            )}

            {state.enableNavigationArrows !== false && (
              <>
                <Tooltip ariaLabel={t('Previous question')}>
                  <Button.Link
                    className="myform-pagination-previous"
                    leading={<IconChevronUp />}
                    disabled={state.scrollIndex! < 1}
                    onClick={handlePrevious}
                  />
                </Tooltip>

                <Tooltip ariaLabel={t('Next question')}>
                  <Button.Link
                    className="myform-pagination-next"
                    leading={<IconChevronDown />}
                    disabled={
                      state.isScrollNextDisabled || state.scrollIndex! >= state.fields.length - 1
                    }
                    onClick={handleNext}
                  />
                </Tooltip>
              </>
            )}
          </div>

          <Branding />
        </div>
      </div>
    </div>
  )
}
