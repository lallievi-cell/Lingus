import { useEffect, useState } from 'react';

/** Use the space the player can actually see, including browser chrome and the
 * on-screen keyboard. This changes interface geometry, never simulation time. */
export function useMobileViewport() {
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 860px)').matches);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 860px)');
    const viewport = window.visualViewport;
    const page = document.documentElement;
    let baseline = window.innerHeight;
    let width = window.innerWidth;
    let frame = 0;
    const update = () => {
      frame = 0;
      setMobile(query.matches);
      if (!query.matches) {
        page.style.removeProperty('--lingus-viewport-height');
        setKeyboardOpen(false);
        return;
      }
      const height = viewport && viewport.scale === 1 ? viewport.height : window.innerHeight;
      const focused = document.activeElement;
      const editing =
        focused instanceof HTMLElement &&
        (focused.matches('input:not([type="checkbox"]):not([type="range"]), textarea') ||
          focused.isContentEditable);
      if (width !== window.innerWidth || !editing) baseline = window.innerHeight;
      width = window.innerWidth;
      page.style.setProperty('--lingus-viewport-height', `${Math.round(height)}px`);
      setKeyboardOpen(editing && Math.max(baseline, window.innerHeight) - height > 100);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    query.addEventListener('change', schedule);
    window.addEventListener('resize', schedule);
    viewport?.addEventListener('resize', schedule);
    viewport?.addEventListener('scroll', schedule);
    document.addEventListener('focusin', schedule);
    document.addEventListener('focusout', schedule);
    return () => {
      cancelAnimationFrame(frame);
      query.removeEventListener('change', schedule);
      window.removeEventListener('resize', schedule);
      viewport?.removeEventListener('resize', schedule);
      viewport?.removeEventListener('scroll', schedule);
      document.removeEventListener('focusin', schedule);
      document.removeEventListener('focusout', schedule);
      page.style.removeProperty('--lingus-viewport-height');
    };
  }, []);
  return { mobile, keyboardOpen };
}
