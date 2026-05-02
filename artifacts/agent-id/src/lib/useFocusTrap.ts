import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

interface UseFocusTrapOptions {
  onClose?: () => void;
  closeOnEscape?: boolean;
  initialFocus?: 'first' | 'container';
}

function getFocusable(node: HTMLElement): HTMLElement[] {
  return Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)).filter(
    (el) => !el.hasAttribute('disabled') && el.tabIndex !== -1 && el.offsetParent !== null,
  );
}

export function useFocusTrap<T extends HTMLElement>(
  active: boolean,
  options: UseFocusTrapOptions = {},
) {
  const ref = useRef<T | null>(null);
  const onCloseRef = useRef(options.onClose);
  onCloseRef.current = options.onClose;
  const closeOnEscape = options.closeOnEscape !== false;
  const initialFocus = options.initialFocus ?? 'first';

  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (!node) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    if (!node.hasAttribute('tabindex')) {
      node.setAttribute('tabindex', '-1');
    }

    const focusInitial = () => {
      if (initialFocus === 'first') {
        const focusables = getFocusable(node);
        const target = focusables[0] ?? node;
        target.focus();
      } else {
        node.focus();
      }
    };

    const rafId = requestAnimationFrame(focusInitial);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && closeOnEscape) {
        event.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusables = getFocusable(node);
      if (focusables.length === 0) {
        event.preventDefault();
        node.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const current = document.activeElement as HTMLElement | null;
      if (event.shiftKey) {
        if (current === first || !node.contains(current)) {
          event.preventDefault();
          last.focus();
        }
      } else {
        if (current === last || !node.contains(current)) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener('keydown', handleKeyDown, true);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        try {
          previouslyFocused.focus();
        } catch {
          /* ignore */
        }
      }
    };
  }, [active, closeOnEscape, initialFocus]);

  return ref;
}
