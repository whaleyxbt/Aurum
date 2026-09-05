import { useState } from "react";
import { AlertTriangle, ArrowLeftRight, ArrowRight, CalendarSearch, Pencil, SquareDivide, StickyNote, Trash2, Wallet } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { getCategoryIcon } from "@/lib/icons";
import { formatCurrency, formatTransactionDate, getIntlLocale } from "@/lib/format";
import { useTranslation } from "@/lib/i18n";
import { categoryPath } from "@/lib/categoryLabels";
import { useCategories } from "@/hooks/useCategories";
import { useAccounts } from "@/hooks/useAccounts";
import { groupTransactionsByDate } from "@/lib/transactionGroups";
import type { Transaction } from "@/types";

interface TransactionsTableProps {
  items: Transaction[];
  onEdit: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => void;
  groupByDate?: boolean;
  /** Present only while showing search results, which span every month —
   * lets a row's date carry the year and offers a way to jump back to
   * browsing that transaction's month instead of just listing it flat. */
  onJumpToMonth?: (transaction: Transaction) => void;
}

export function TransactionsTable({ items, onEdit, onDelete, onJumpToMonth, groupByDate = true }: TransactionsTableProps) {
  const { t } = useTranslation();
  const { data: categories } = useCategories();
  const { data: accounts } = useAccounts(true);
  const [noteTransaction, setNoteTransaction] = useState<Transaction | null>(null);
  const groups = groupByDate ? groupTransactionsByDate(items) : [{ date: null, items }];

  if (items.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-text-muted">
        {onJumpToMonth ? t("transactions.searchNoneFound") : t("transactions.noneFound")}
      </p>
    );
  }

  return (
    <>
      <div className="space-y-7">
        {groups.map((group) => (
          <section key={group.date ?? "all"} aria-label={group.date ?? undefined}>
            {group.date && (
              <div className="mb-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-gridline pb-3 pt-1">
                <h2 className="text-xl font-bold tracking-tight text-text-primary sm:text-2xl">
                  <time dateTime={group.date}>
                    {new Intl.DateTimeFormat(getIntlLocale(), {
                      day: "numeric", month: "long", year: onJumpToMonth ? "numeric" : undefined,
                    }).format(new Date(`${group.date}T00:00:00`))}
                  </time>
                </h2>
                <span className="text-sm text-text-secondary">
                  {new Intl.DateTimeFormat(getIntlLocale(), { weekday: "long" }).format(new Date(`${group.date}T00:00:00`))}
                </span>
              </div>
            )}
            <ul className="divide-y divide-gridline">
              {group.items.map((tx) => {
                const isTransfer = tx.type === "transfer";
                const isExpense = tx.type === "expense";
                const isSplit = tx.splits.length > 0;
                const Icon = isTransfer ? ArrowLeftRight : isSplit ? SquareDivide : getCategoryIcon(tx.category?.icon);
                const color = isTransfer || isSplit ? "var(--text-muted)" : tx.category?.color ?? "var(--text-muted)";
                const categoryBadges = isSplit
                  ? tx.splits.map((split) => ({ key: split.id, category: split.category, amount: split.amount }))
                  : [{ key: "category", category: tx.category, amount: null }];
                const destination = accounts?.find((account) => account.id === tx.transfer_account_id);

                return (
                  <li key={tx.id} data-transaction-id={tx.id} className="group grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 py-4 sm:grid-cols-[2.25rem_minmax(0,1fr)_auto_auto]">
                    <span
                      className="col-start-1 row-span-2 row-start-1 flex h-9 w-9 items-center justify-center rounded-full"
                      style={{ backgroundColor: typeof color === "string" && color.startsWith("#") ? `${color}26` : "var(--surface-2)" }}
                    >
                      <Icon size={16} style={{ color }} />
                    </span>

                    <span className="col-start-2 row-start-1 min-w-0 break-words text-sm font-semibold leading-5 text-text-primary sm:text-[15px]">{tx.description}</span>

                    <div className="col-span-2 col-start-2 row-start-2 flex min-w-0 flex-wrap items-center gap-2 sm:col-span-1">
                      {!groupByDate && <time dateTime={tx.date} className="text-xs text-text-secondary">{formatTransactionDate(tx.date, Boolean(onJumpToMonth))}</time>}
                      <span aria-label={`${t("transactions.form.accountLabel")}: ${tx.account.name}`} className="inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-md border border-series-1/30 bg-series-1/10 px-2 py-1 text-xs leading-5 text-text-primary">
                        <Wallet size={13} className="shrink-0 text-series-1" />
                        <span className="text-text-secondary">{t("transactions.form.accountLabel")}:</span>
                        <span className="min-w-0 break-words font-semibold">{tx.account.name}</span>
                        {isTransfer && tx.transfer_account_id && <>
                          <ArrowRight size={13} className="shrink-0 text-series-1" />
                          <span aria-label={t("transactions.form.transferAccountLabel")} className="min-w-0 break-words font-semibold">{destination?.name ?? `#${tx.transfer_account_id}`}</span>
                        </>}
                      </span>
                      {isTransfer ? (
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-gridline px-2 py-1 text-xs leading-5 text-text-secondary"><ArrowLeftRight size={13} />{t("transactions.form.typeTransfer")}</span>
                      ) : categoryBadges.map(({ key, category, amount }) => {
                        const label = category ? categoryPath(category, categories) : t("transactions.form.noCategory");
                        const badgeColor = category?.color ?? "var(--series-4)";
                        return (
                          <span key={key} aria-label={`${t("transactions.form.categoryLabel")}: ${label}`} className="inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-md border px-2 py-1 text-xs leading-5 text-text-primary" style={{
                            backgroundColor: `color-mix(in srgb, ${badgeColor} 12%, transparent)`,
                            borderColor: `color-mix(in srgb, ${badgeColor} 40%, transparent)`,
                          }}>
                            {category ? <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: badgeColor }} /> : <AlertTriangle size={13} className="shrink-0 text-series-4" />}
                            <span className="text-text-secondary">{t("transactions.form.categoryLabel")}:</span>
                            <span className="min-w-0 break-words font-semibold">{label}</span>
                            {amount && <span className="tabular-nums text-text-secondary">{formatCurrency(amount)}</span>}
                          </span>
                        );
                      })}
                      {tx.tags.length > 0 && <span className="w-full break-words text-xs text-text-secondary">{tx.tags.map((tag) => `#${tag.name}`).join(" · ")}</span>}
                    </div>

                    <span
                      className={`col-start-3 row-start-1 whitespace-nowrap text-right text-sm font-semibold tabular-nums sm:text-base ${
                        isTransfer ? "text-text-muted" : isExpense ? "text-text-primary" : "text-success"
                      }`}
                    >
                      {isTransfer ? "" : isExpense ? "-" : "+"}
                      {formatCurrency(tx.amount)}
                    </span>

                    <span className="col-span-2 col-start-2 row-start-3 flex justify-end gap-1 sm:col-span-1 sm:col-start-4 sm:row-span-2 sm:row-start-1 sm:self-center">
                      {onJumpToMonth && (
                        <button
                          type="button"
                          aria-label={t("transactions.jumpToMonth")}
                          onClick={() => onJumpToMonth(tx)}
                          className="rounded-md p-1.5 text-text-muted hover:bg-surface-2 hover:text-text-primary"
                        >
                          <CalendarSearch size={15} />
                        </button>
                      )}
                      {tx.notes && (
                        <button
                          type="button"
                          aria-label={t("transactions.viewNote")}
                          onClick={() => setNoteTransaction(tx)}
                          className="rounded-md p-1.5 text-text-muted hover:bg-surface-2 hover:text-text-primary"
                        >
                          <StickyNote size={15} />
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label={t("common.edit")}
                        onClick={() => onEdit(tx)}
                        className="rounded-md p-1.5 text-text-muted hover:bg-surface-2 hover:text-text-primary"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        aria-label={t("common.delete")}
                        onClick={() => onDelete(tx)}
                        className="rounded-md p-1.5 text-text-muted hover:bg-surface-2 hover:text-danger"
                      >
                        <Trash2 size={15} />
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <Dialog
        open={noteTransaction !== null}
        onClose={() => setNoteTransaction(null)}
        title={t("transactions.noteDialogTitle")}
      >
        <p className="whitespace-pre-wrap text-sm text-text-primary">{noteTransaction?.notes}</p>
      </Dialog>
    </>
  );
}
