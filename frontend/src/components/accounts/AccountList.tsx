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
import { useAccountDrag } from "@/hooks/useAccountDrag";
import type { Account, AccountMoveDirection, AccountType, AccountWithBalance } from "@/types";

interface AccountListProps {
  items: AccountWithBalance[];
  onEdit: (account: Account) => void;
  onMove: (account: AccountWithBalance, direction: AccountMoveDirection | number) => Promise<void>;
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
  const { listRef, drag, displayedItems, startDrag, trackDrag, finishDrag, cancelDrag, offsetAt } =
    useAccountDrag(items, isMovePending, onMove);

  if (items.length === 0) {
    return <p className="py-10 text-center text-sm text-text-muted">{t("account.empty")}</p>;
  }

  return (
    <ul ref={listRef} aria-busy={isMovePending || !!drag} className="relative isolate">
      {displayedItems.map((account, index) => {
        const Icon = TYPE_ICONS[account.type];
        const balance = Number(account.balance);
        const lifted = drag?.source === index;

        return (
          <li
            key={account.id}
            data-account-id={account.id}
            data-dragging={lifted && !drag.settling || undefined}
            style={{ transform: `translate3d(0, ${offsetAt(index)}px, 0)` }}
            className={`relative flex flex-wrap items-center gap-3 border-b border-gridline py-3 last:border-transparent sm:flex-nowrap duration-200 ease-out motion-reduce:transition-none ${
              !drag || (lifted && !drag.settling) ? "transition-[box-shadow,background-color]" : "transition-[transform,box-shadow,background-color]"
            } ${account.is_archived ? "opacity-50" : ""} ${lifted ? "z-10 rounded-lg bg-surface-2 shadow-xl ring-1 ring-gridline" : ""} ${drag ? "select-none will-change-transform" : ""}`}
          >
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
                disabled={items.length < 2 || isMovePending || drag?.settling}
                onPointerDown={(event) => startDrag(event, account.id)}
                onPointerMove={trackDrag}
                onPointerUp={finishDrag}
                onPointerCancel={cancelDrag}
                onLostPointerCapture={cancelDrag}
                onKeyDown={(event) => {
                  if (event.key === "Escape") cancelDrag();
                  if (drag || isMovePending) return;
                  if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                    event.preventDefault();
                    if (event.key === "ArrowUp" && index > 0) void onMove(account, "up").catch(() => {});
                    if (event.key === "ArrowDown" && index < items.length - 1) void onMove(account, "down").catch(() => {});
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
