import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { AccountWithBalance } from "@/types";

interface DragState {
  items: AccountWithBalance[];
  rows: { top: number; height: number }[];
  source: number;
  target: number;
  pointer: number;
  startY: number;
  startScrollY: number;
  offsetY: number;
  settling: boolean;
}

// Keep the original layout while dragging; transforms preview the new order
// without moving the DOM node that owns pointer capture.
function offsets(drag: DragState): number[] {
  const order = drag.items.map((_, index) => index);
  order.splice(drag.target, 0, order.splice(drag.source, 1)[0]);
  const result = new Array<number>(order.length);
  let top = drag.rows[0].top;
  for (const index of order) {
    result[index] = top - drag.rows[index].top;
    top += drag.rows[index].height;
  }
  return result;
}

export function useAccountDrag(
  items: AccountWithBalance[],
  isMovePending: boolean,
  onMove: (account: AccountWithBalance, target: number) => Promise<void>,
) {
  const listRef = useRef<HTMLUListElement>(null);
  const currentRef = useRef<DragState | null>(null);
  const mounted = useRef(true);
  const [drag, setDrag] = useState<DragState | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  function update(next: DragState | null) {
    currentRef.current = next;
    if (mounted.current) setDrag(next);
  }

  async function settle(save: boolean) {
    const current = currentRef.current;
    if (!current || current.settling) return;
    const next = { ...current, target: save ? current.target : current.source, settling: true };
    next.offsetY = offsets(next)[next.source];
    update(next);
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 200;
    await new Promise((resolve) => window.setTimeout(resolve, duration));
    if (!mounted.current) return;
    if (save && next.source !== next.target) {
      try {
        // Retain the preview until the mutation and query refresh finish, so
        // the old server order never flashes between drop and confirmation.
        await onMove(next.items[next.source], next.items[next.target].id);
      } catch {
        if (!mounted.current) return;
        update({ ...next, target: next.source, offsetY: 0 });
        await new Promise((resolve) => window.setTimeout(resolve, duration));
      }
    }
    update(null);
  }

  function cancelDrag() {
    void settle(false);
  }

  function startDrag(event: PointerEvent<HTMLButtonElement>, id: number) {
    if (isMovePending || currentRef.current || !event.isPrimary || event.button !== 0) return;
    const list = listRef.current;
    if (!list) return;
    const source = items.findIndex((item) => item.id === id);
    if (source < 0) return;
    const top = list.getBoundingClientRect().top;
    const rows = Array.from(list.querySelectorAll<HTMLLIElement>("[data-account-id]"), (row) => {
      const rect = row.getBoundingClientRect();
      return { top: rect.top - top, height: rect.height };
    });
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    update({ items, rows, source, target: source, pointer: event.pointerId,
      startY: event.clientY, startScrollY: window.scrollY, offsetY: 0, settling: false });
  }

  function trackDrag(event: PointerEvent<HTMLButtonElement>) {
    const current = currentRef.current;
    if (!current || current.settling || current.pointer !== event.pointerId) return;
    if (event.clientY < 60) window.scrollBy(0, -20);
    else if (event.clientY > window.innerHeight - 60) window.scrollBy(0, 20);
    const offsetY = event.clientY - current.startY + window.scrollY - current.startScrollY;
    const source = current.rows[current.source];
    const center = source.top + source.height / 2 + offsetY;
    let target = current.source;
    let distance = Infinity;
    current.rows.forEach((row, index) => {
      const delta = Math.abs(center - row.top - row.height / 2);
      if (delta < distance) { target = index; distance = delta; }
    });
    update({ ...current, target, offsetY });
  }

  function finishDrag(event: PointerEvent<HTMLButtonElement>) {
    const current = currentRef.current;
    if (!current || current.settling || current.pointer !== event.pointerId) return;
    const bounds = listRef.current?.getBoundingClientRect();
    const inside = !!bounds && event.clientX >= bounds.left && event.clientX <= bounds.right &&
      event.clientY >= bounds.top && event.clientY <= bounds.bottom;
    void settle(inside);
  }

  const shifts = drag ? offsets(drag) : [];
  return {
    listRef, drag, displayedItems: drag?.items ?? items,
    startDrag, trackDrag, finishDrag, cancelDrag,
    offsetAt: (index: number) => drag?.source === index ? drag.offsetY : shifts[index] ?? 0,
  };
}
