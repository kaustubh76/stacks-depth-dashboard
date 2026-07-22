// Shared focus-trap for the cockpit's aria-modal dialogs: keep Tab / Shift-Tab cycling WITHIN the
// dialog while it's open (WCAG 2.1.2 — a modal must not let keyboard focus escape to the page
// behind it). Call from the dialog's onKeyDown. Each dialog additionally restores focus to its
// opener on close via a `restoreRef` (see Cheatsheet.tsx for the pattern).

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/** Minimal structural type so this works for both React synthetic and native keyboard events. */
interface KeyEvt {
  key: string;
  shiftKey: boolean;
  preventDefault: () => void;
}

/** On a Tab keydown inside `container`, wrap focus to the other end when it would leave the dialog. */
export function trapTab(e: KeyEvt, container: HTMLElement | null): void {
  if (e.key !== "Tab" || !container) return;
  const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
  if (items.length === 0) {
    e.preventDefault();
    container.focus();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement as HTMLElement | null;
  if (e.shiftKey) {
    if (active === first || active === container || !container.contains(active)) {
      e.preventDefault();
      last.focus();
    }
  } else if (active === last) {
    e.preventDefault();
    first.focus();
  }
}
