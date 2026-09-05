import { useRef, useState, type PointerEvent } from "react";
import {
  Archive,
  ArchiveRestore,
  Banknote,
  Menu,
  CreditCard,
  Package,
  Pencil,
  PiggyBank,
  TrendingUp,
  Trash2,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import type { Account, AccountMoveDirection, AccountType, AccountWithBalance } from "@/types";

interface AccountListProps {
  items: AccountWithBalance[];
  onEdit: (account: Account) => void;
  onMove: (account: AccountWithBalance, direction: AccountMoveDirection | number) => void;
  isMovePending: boolean;
  onToggleArchived: (account: AccountWithBalance) => void;
  onDelete: (account: AccountWithBalance) => void;
}

const TYPE_ICONS: Record<AccountType, LucideIcon> = {
  checking: Wallet,
  debit_card: CreditCard,
  savings: PiggyBank,
  credit_card: CreditCard,
  cash: Banknote,
  investment: TrendingUp,
  other: Package,
};

export function AccountList({
  items,
  onEdit,
  onMove,
  isMovePending,
  onToggleArchived,
  onDelete,
}: AccountListProps) {
  const { t } = useTranslation();
  const listRef = useRef<HTMLUListElement>(null);
  const dragRef = useRef<{ source: number; target: number; pointer: number } | null>(null);
  const [drag, setDrag] = useState<{ source: number; target: number } | null>(null);

  function cancelDrag() {
    dragRef.current = null;
    setDrag(null);
  }

  function startDrag(event: PointerEvent<HTMLButtonElement>, id: number) {
    if (isMovePending || !event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { source: id, target: id, pointer: event.pointerId };
    setDrag({ source: id, target: id });
  }

  function trackDrag(event: PointerEvent<HTMLButtonElement>) {
    const current = dragRef.current;
    if (!current || current.pointer !== event.pointerId) return;
    const rows = listRef.current?.querySelectorAll<HTMLLIElement>("[data-account-id]");
    if (!rows?.length) return;
    const nearest = Array.from(rows).reduce((best, row) => {
      const rect = row.getBoundingClientRect();
      const bestRect = best.getBoundingClientRect();
      return Math.abs(event.clientY - (rect.top + rect.height / 2)) <
        Math.abs(event.clientY - (bestRect.top + bestRect.height / 2)) ? row : best;
    });
    current.target = Number(nearest.dataset.accountId);
    setDrag({ source: current.source, target: current.target });
    if (event.clientY < 60) window.scrollBy(0, -20);
    else if (event.clientY > window.innerHeight - 60) window.scrollBy(0, 20);
  }

  function finishDrag(event: PointerEvent<HTMLButtonElement>) {
    const current = dragRef.current;
    const bounds = listRef.current?.getBoundingClientRect();
    if (current?.pointer === event.pointerId && bounds &&
        event.clientX >= bounds.left && event.clientX <= bounds.right &&
        event.clientY >= bounds.top && event.clientY <= bounds.bottom &&
        current.source !== current.target) {
      const account = items.find((item) => item.id === current.source);
      if (account && items.some((item) => item.id === current.target)) onMove(account, current.target);
    }
    cancelDrag();
  }

  if (items.length === 0) {
    return <p className="py-10 text-center text-sm text-text-muted">{t("account.empty")}</p>;
  }

  return (
    <ul ref={listRef} aria-busy={isMovePending} className="divide-y divide-gridline">
      {items.map((account, index) => {
        const Icon = TYPE_ICONS[account.type];
        const balance = Number(account.balance);

        return (
          <li
            key={account.id}
            data-account-id={account.id}
            className={`relative flex flex-wrap items-center gap-3 py-3 sm:flex-nowrap ${account.is_archived ? "opacity-50" : ""} ${drag?.source === account.id ? "bg-surface-2" : ""}`}
          >
            {drag && drag.target === account.id && drag.source !== drag.target && (
              <span className={`pointer-events-none absolute inset-x-0 h-0.5 bg-series-1 ${items.findIndex((item) => item.id === drag.source) < index ? "bottom-0" : "top-0"}`} />
            )}
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2">
              <Icon size={16} className="text-text-secondary" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 truncate text-sm font-medium text-text-primary">
                {account.name}
                {account.is_archived && (
                  <span className="shrink-0 rounded bg-surface-2 px-1 py-0.5 text-[10px] leading-none text-text-muted">
                    {t("account.archivedBadge")}
                  </span>
                )}
              </span>
              <span className="block truncate text-xs text-text-muted">
                {t(`account.type.${account.type}` as TranslationKey)}
              </span>
            </span>
            <span
              className="shrink-0 text-sm font-medium tabular-nums"
              style={{ color: balance < 0 ? "var(--danger)" : "var(--text-primary)" }}
            >
              {formatCurrency(balance)}
            </span>
            <span className="ml-auto flex w-full shrink-0 items-center justify-end gap-1 sm:w-auto">
              <button
                type="button"
                aria-label={t("account.dragLabel", { name: account.name })}
                title={t("account.dragHint")}
                disabled={items.length < 2 || isMovePending}
                onPointerDown={(event) => startDrag(event, account.id)}
                onPointerMove={trackDrag}
                onPointerUp={finishDrag}
                onPointerCancel={cancelDrag}
                onLostPointerCapture={cancelDrag}
                onKeyDown={(event) => {
                  if (event.key === "Escape") cancelDrag();
                  if (dragRef.current || isMovePending) return;
                  if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                    event.preventDefault();
                    if (event.key === "ArrowUp" && index > 0) onMove(account, "up");
                    if (event.key === "ArrowDown" && index < items.length - 1) onMove(account, "down");
                  }
                }}
                className="flex h-11 w-11 touch-none select-none items-center justify-center rounded-md text-text-muted hover:bg-surface-2 hover:text-text-primary cursor-grab active:cursor-grabbing disabled:cursor-default disabled:opacity-25 sm:h-9 sm:w-9"
              >
                <Menu size={18} />
              </button>
              <button
                type="button"
                aria-label={account.is_archived ? t("account.unarchiveLabel") : t("account.archiveLabel")}
                onClick={() => onToggleArchived(account)}
                className="rounded-md p-1.5 text-text-muted hover:bg-surface-2 hover:text-text-primary"
              >
                {account.is_archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
              </button>
              <button
                type="button"
                aria-label={t("common.edit")}
                onClick={() => onEdit(account)}
                className="rounded-md p-1.5 text-text-muted hover:bg-surface-2 hover:text-text-primary"
              >
                <Pencil size={15} />
              </button>
              <button
                type="button"
                aria-label={t("common.delete")}
                onClick={() => onDelete(account)}
                className="rounded-md p-1.5 text-text-muted hover:bg-surface-2 hover:text-danger"
              >
                <Trash2 size={15} />
              </button>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
