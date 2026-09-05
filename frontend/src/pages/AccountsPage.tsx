import { useState } from "react";
import { Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AccountList } from "@/components/accounts/AccountList";
import { AccountFormModal } from "@/components/accounts/AccountFormModal";
import { useAccounts, useDeleteAccount, useMoveAccount, useUpdateAccount } from "@/hooks/useAccounts";
import { useTranslation } from "@/lib/i18n";
import type { Account, AccountMoveDirection, AccountWithBalance } from "@/types";

export function AccountsPage() {
  const { t } = useTranslation();
  const [showArchived, setShowArchived] = useState(false);
  const { data: accounts, isLoading } = useAccounts(showArchived);
  const updateAccount = useUpdateAccount();
  const moveAccount = useMoveAccount();
  const deleteAccount = useDeleteAccount();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);

  function openCreateModal() {
    setEditingAccount(null);
    setModalOpen(true);
  }

  function openEditModal(account: Account) {
    setEditingAccount(account);
    setModalOpen(true);
  }

  function handleToggleArchived(account: AccountWithBalance) {
    updateAccount.mutate({ id: account.id, input: { is_archived: !account.is_archived } });
  }

  function handleDelete(account: AccountWithBalance) {
    if (window.confirm(t("account.confirmDelete", { name: account.name }))) {
      deleteAccount.mutate(account.id);
    }
  }

  function handleMove(account: AccountWithBalance, direction: AccountMoveDirection | number) {
    moveAccount.mutate({ id: account.id, direction, includeArchived: showArchived });
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>{t("nav.accounts")}</CardTitle>
          <Button onClick={openCreateModal}>
            <Plus size={16} />
            {t("common.add")}
          </Button>
        </CardHeader>
        <CardContent>
          {moveAccount.isError && (
            <p role="alert" className="mb-3 text-sm text-danger">{t("account.moveError")}</p>
          )}
          <label className="mb-3 flex items-center gap-2 text-xs text-text-muted">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(event) => setShowArchived(event.target.checked)}
              className="h-3.5 w-3.5 accent-text-primary"
            />
            {t("account.showArchived")}
          </label>
          {isLoading ? (
            <p className="py-10 text-center text-sm text-text-muted">{t("common.loading")}</p>
          ) : (
            <AccountList
              items={accounts ?? []}
              onEdit={openEditModal}
              onMove={handleMove}
              isMovePending={moveAccount.isPending}
              onToggleArchived={handleToggleArchived}
              onDelete={handleDelete}
            />
          )}
        </CardContent>
      </Card>

      <AccountFormModal open={modalOpen} onClose={() => setModalOpen(false)} account={editingAccount} />
    </div>
  );
}
