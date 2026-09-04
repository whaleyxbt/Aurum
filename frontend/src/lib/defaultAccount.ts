import type { Account } from "@/types";

const DEFAULT_ACCOUNT_KEY = "aurum:default-account-id";

export function getDefaultAccountId(accounts: Account[]): string {
  const storedId = localStorage.getItem(DEFAULT_ACCOUNT_KEY);
  if (storedId && accounts.some((account) => String(account.id) === storedId)) {
    return storedId;
  }
  return accounts[0] ? String(accounts[0].id) : "";
}

export function setDefaultAccountId(accountId: string): void {
  localStorage.setItem(DEFAULT_ACCOUNT_KEY, accountId);
}
