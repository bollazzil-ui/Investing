import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Check, type LucideIcon } from 'lucide-react';

export type MenuEntry =
  | {
      kind?: 'item';
      label: string;
      icon?: LucideIcon;
      onSelect: () => void;
      disabled?: boolean;
      danger?: boolean;
      /** Shows a check mark — for a choice among several, like the theme. */
      checked?: boolean;
    }
  | { kind: 'separator' }
  | { kind: 'label'; label: string };

/**
 * A button that opens a small popover menu.
 *
 * The popover is `position: fixed`, so a table's horizontal scroller never
 * clips it. Arrow keys move between items, Escape closes and returns focus to
 * the trigger, and a click anywhere else closes it.
 */
export function Menu({
  trigger,
  triggerClassName = 'btn',
  ariaLabel,
  title,
  entries,
  align = 'end',
}: {
  trigger: React.ReactNode;
  triggerClassName?: string;
  ariaLabel: string;
  title?: string;
  entries: MenuEntry[];
  align?: 'start' | 'end';
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);

  // Place the popover under the trigger, flipping up or inward if it would
  // leave the viewport.
  const place = useCallback(() => {
    const t = triggerRef.current?.getBoundingClientRect();
    const m = menuRef.current?.getBoundingClientRect();
    if (!t || !m) return;
    if (t.bottom < 0 || t.top > window.innerHeight) {
      // The trigger has scrolled out of sight; a floating menu would be orphaned.
      setOpen(false);
      return;
    }
    const gap = 6;
    let top = t.bottom + gap;
    if (top + m.height > window.innerHeight - 8 && t.top - gap - m.height > 8) {
      top = t.top - gap - m.height;
    }
    let left = align === 'end' ? t.right - m.width : t.left;
    left = Math.min(Math.max(8, left), window.innerWidth - m.width - 8);
    setPos({ top, left });
  }, [align]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close(false);
    }
    document.addEventListener('mousedown', onPointer);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      setPos(null);
    };
  }, [open, close, place]);

  // Focus the first item once the popover is in place; focusing it while still
  // parked off-screen would scroll the page, which closes the menu.
  useEffect(() => {
    if (!open || !pos) return;
    menuRef.current
      ?.querySelector<HTMLElement>('[role^="menuitem"]:not(:disabled)')
      ?.focus({ preventScroll: true });
  }, [open, pos]);

  function onKeyDown(e: React.KeyboardEvent) {
    const items = [
      ...(menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not(:disabled)') ?? []),
    ];
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[(at + 1) % items.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[(at - 1 + items.length) % items.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      items[items.length - 1]?.focus();
    } else if (e.key === 'Tab') {
      close(false);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        aria-label={ariaLabel}
        title={title ?? ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {trigger}
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={ariaLabel}
          className="menu"
          style={pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999 }}
          onKeyDown={onKeyDown}
        >
          {entries.map((entry, i) => {
            if (entry.kind === 'separator') return <div key={i} className="menu-sep" role="separator" />;
            if (entry.kind === 'label')
              return (
                <div key={i} className="menu-label" role="presentation">
                  {entry.label}
                </div>
              );
            const Icon = entry.icon;
            const checkable = entry.checked !== undefined;
            return (
              <button
                key={i}
                type="button"
                role={checkable ? 'menuitemradio' : 'menuitem'}
                aria-checked={checkable ? entry.checked : undefined}
                disabled={entry.disabled}
                className={`menu-item ${entry.danger ? 'menu-item-danger' : ''}`}
                onClick={() => {
                  close(true);
                  entry.onSelect();
                }}
              >
                {Icon && <Icon size={15} strokeWidth={2} aria-hidden />}
                <span className="flex-1">{entry.label}</span>
                {checkable && entry.checked && (
                  <Check size={15} strokeWidth={2.25} aria-hidden className="!text-[var(--accent)]" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
