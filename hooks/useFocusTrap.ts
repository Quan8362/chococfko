'use client'

// Reusable modal focus management (27G-H1A). When `active`, this hook, bound to a dialog container:
//   • remembers the element that had focus and moves focus INTO the dialog (initialFocus or first
//     focusable, falling back to the container itself);
//   • traps Tab / Shift+Tab so focus cycles within the dialog and never reaches the background;
//   • closes on Escape via `onClose`;
//   • on deactivate/unmount, RETURNS focus to the element that opened the dialog.
//
// No dependency, no portal assumptions — the caller renders role="dialog" aria-modal="true" and
// links its title via aria-labelledby. Shared by the poker report modal and any future dialog.

import { useEffect, type RefObject } from 'react'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function focusableWithin(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true' && el.offsetParent !== null,
  )
}

export interface FocusTrapOptions {
  // Element to focus first (defaults to the first focusable in the container).
  readonly initialFocusRef?: RefObject<HTMLElement>
  // Whether Escape should invoke onClose (default true).
  readonly closeOnEscape?: boolean
}

export function useFocusTrap(
  active: boolean,
  containerRef: RefObject<HTMLElement>,
  onClose?: () => void,
  options: FocusTrapOptions = {},
): void {
  const { initialFocusRef, closeOnEscape = true } = options

  useEffect(() => {
    if (!active) return
    const container = containerRef.current
    if (!container) return

    const previouslyFocused = (typeof document !== 'undefined' ? document.activeElement : null) as HTMLElement | null

    // Move focus into the dialog.
    const initial = initialFocusRef?.current ?? focusableWithin(container)[0] ?? container
    // A non-focusable container needs a tabindex so it can receive focus as a fallback.
    if (initial === container && !container.hasAttribute('tabindex')) container.setAttribute('tabindex', '-1')
    initial.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (closeOnEscape && e.key === 'Escape') {
        e.stopPropagation()
        onClose?.()
        return
      }
      if (e.key !== 'Tab') return
      const items = focusableWithin(container)
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const activeEl = document.activeElement as HTMLElement | null
      if (e.shiftKey) {
        if (activeEl === first || !container.contains(activeEl)) {
          e.preventDefault()
          last.focus()
        }
      } else if (activeEl === last || !container.contains(activeEl)) {
        e.preventDefault()
        first.focus()
      }
    }

    container.addEventListener('keydown', onKeyDown)
    return () => {
      container.removeEventListener('keydown', onKeyDown)
      // Return focus to the opener if it is still in the document.
      if (previouslyFocused && typeof previouslyFocused.focus === 'function' && document.contains(previouslyFocused)) {
        previouslyFocused.focus()
      }
    }
  }, [active, containerRef, onClose, initialFocusRef, closeOnEscape])
}
