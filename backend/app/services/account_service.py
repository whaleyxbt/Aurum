"""Account CRUD, plus each account's live balance — summed from its
Transaction rows (income adds, expense subtracts, a transfer moves the
amount from the source account to the destination account) rather than
stored, the same "derive it, don't duplicate it" approach
net_worth_service.py uses for Cash.
"""
from collections import defaultdict
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.account import Account
from app.models.enums import TransactionType
from app.models.transaction import Transaction
from app.schemas.account import AccountCreate, AccountMove, AccountUpdate, AccountWithBalance


async def _account_balances(session: AsyncSession) -> dict[int, Decimal]:
    result = await session.execute(
        select(Transaction.type, Transaction.amount, Transaction.account_id, Transaction.transfer_account_id)
    )
    balances: dict[int, Decimal] = defaultdict(Decimal)
    for tx_type, amount, account_id, transfer_account_id in result.all():
        if tx_type == TransactionType.INCOME:
            balances[account_id] += amount
        elif tx_type == TransactionType.EXPENSE:
            balances[account_id] -= amount
        elif tx_type == TransactionType.TRANSFER:
            balances[account_id] -= amount
            if transfer_account_id is not None:
                balances[transfer_account_id] += amount
    return balances


def _to_read(account: Account, balance: Decimal) -> AccountWithBalance:
    return AccountWithBalance(
        id=account.id,
        name=account.name,
        type=account.type,
        currency=account.currency,
        color=account.color,
        is_archived=account.is_archived,
        sort_order=account.sort_order,
        balance=balance,
    )


async def list_accounts(session: AsyncSession, include_archived: bool) -> list[AccountWithBalance]:
    stmt = select(Account).order_by(Account.sort_order, Account.name, Account.id)
    if not include_archived:
        stmt = stmt.where(Account.is_archived.is_(False))
    accounts = (await session.execute(stmt)).scalars().all()
    balances = await _account_balances(session)
    return [_to_read(account, balances.get(account.id, Decimal("0"))) for account in accounts]


async def create_account(session: AsyncSession, payload: AccountCreate) -> AccountWithBalance:
    max_sort_order = await session.scalar(select(func.max(Account.sort_order)))
    next_sort_order = (max_sort_order if max_sort_order is not None else -1) + 1
    account = Account(**payload.model_dump(), sort_order=next_sort_order)
    session.add(account)
    await session.commit()
    await session.refresh(account)
    # A brand-new account has no transactions yet — no need to query.
    return _to_read(account, Decimal("0"))


async def update_account(session: AsyncSession, account_id: int, payload: AccountUpdate) -> AccountWithBalance:
    account = await session.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(account, field, value)
    await session.commit()
    await session.refresh(account)
    balances = await _account_balances(session)
    return _to_read(account, balances.get(account.id, Decimal("0")))


async def move_account(session: AsyncSession, account_id: int, payload: AccountMove) -> None:
    # Lock and normalize the complete order before moving a visible account.
    # Normalization also repairs duplicate positions from an old
    # backup while retaining its deterministic sort_order/name/id order.
    result = await session.execute(
        select(Account).order_by(Account.sort_order, Account.name, Account.id).with_for_update()
    )
    accounts = list(result.scalars().all())
    account = next((item for item in accounts if item.id == account_id), None)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    if account.is_archived and not payload.include_archived:
        raise HTTPException(status_code=400, detail="Archived account is hidden from the current order")

    visible_accounts = accounts if payload.include_archived else [item for item in accounts if not item.is_archived]
    current_index = visible_accounts.index(account)
    if payload.target_account_id is not None:
        target_index = next(
            (index for index, item in enumerate(visible_accounts) if item.id == payload.target_account_id),
            None,
        )
        if target_index is None:
            raise HTTPException(status_code=400, detail="Target account is not visible")
    else:
        offset = -1 if payload.direction == "up" else 1
        target_index = current_index + offset
    if target_index < 0 or target_index >= len(visible_accounts):
        raise HTTPException(status_code=400, detail=f"Account cannot move {payload.direction}")

    visible_accounts = list(visible_accounts)
    visible_accounts.insert(target_index, visible_accounts.pop(current_index))
    # Fill only visible slots so hidden archived accounts keep their positions.
    reordered = iter(visible_accounts)
    for position, item in enumerate(accounts):
        if payload.include_archived or not item.is_archived:
            item = next(reordered)
        item.sort_order = position
    await session.commit()


async def delete_account(session: AsyncSession, account_id: int) -> None:
    account = await session.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    await session.delete(account)
    await session.commit()
