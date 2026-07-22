/**
 * Visually-hidden-until-focus "skip to content" link — the first focusable element on every view,
 * so keyboard/screen-reader users can jump past the sticky header + nav straight to `#main`.
 * Uses onClick+preventDefault (NOT a real `#main` navigation) so it never clobbers the
 * single-writer scenario hash in useHashState.
 */
export default function SkipLink() {
  return (
    <a
      href="#main"
      onClick={(e) => {
        e.preventDefault();
        const m = document.getElementById("main");
        if (m) {
          m.focus();
          m.scrollIntoView();
        }
      }}
      className="sr-only rounded-sm focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[100] focus:border-3 focus:border-[color:var(--thick-line)] focus:bg-panel focus:px-3 focus:py-2 focus:font-display focus:text-sm focus:font-bold focus:text-brand focus:shadow-brut-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
    >
      Skip to content
    </a>
  );
}
