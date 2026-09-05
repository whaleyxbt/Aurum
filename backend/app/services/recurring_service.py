"""Recurring transaction templates: CRUD, plus "post now" — a one-click
action that creates a real Transaction from the template. Deliberately not a
background job (see also insights_service.py's docstring on scope): the
schedule only advances when the user actually clicks Post, so a missed
week never silently back-fills a pile of transactions.
"""
import calendar
from datetime import date as date_
from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.category import Category
from app.models.enums import CategoryKind, RecurringFrequency, TransactionType
from app.models.recurring import RecurringTransaction
from app.models.transaction import Transaction
from app.schemas.recurring import RecurringTransactionCreate, RecurringTransactionRead, RecurringTransactionUpdate

_EAGER = (
    selectinload(RecurringTransaction.account),
    selectinload(RecurringTransaction.category),
    selectinload(RecurringTransaction.transfer_account),
)

_TYPE_TO_CATEGORY_KIND = {
    TransactionType.INCOME: CategoryKind.INCOME,
    TransactionType.EXPENSE: CategoryKind.EXPENSE,
}


async def _ensure_category_matches_type(
    session: AsyncSession, category_id: int | None, transaction_type: TransactionType
) -> None:
    if category_id is None:
        return
    expected_kind = _TYPE_TO_CATEGORY_KIND.get(transaction_type)
    category = await session.get(Category, category_id)
    if category is None:
        raise HTTPException(status_code=400, detail="Category not found")
    if expected_kind is not None and category.kind != expected_kind:
        raise HTTPException(
            status_code=400,
            detail=f"Category '{category.name}' is a {category.kind.value} category and cannot be used for a {transaction_type.value} recurring transaction",
        )


def _advance(anchor: date_, frequency: RecurringFrequency, periods: int = 1) -> date_:
    """Calculate an occurrence from the original anchor, avoiding month-end drift."""
    if frequency == RecurringFrequency.WEEKLY:
        return anchor + timedelta(weeks=periods)
    if frequency == RecurringFrequency.MONTHLY:
        years, month_index = divmod(anchor.month - 1 + periods, 12)
        year = anchor.year + years
        month = month_index + 1
        clamped_day = min(anchor.day, calendar.monthrange(year, month)[1])
        return date_(year, month, clamped_day)
    # YEARLY — Feb 29 anchors fall back to Feb 28 in non-leap years.
    try:
        return anchor.replace(year=anchor.year + periods)
    except ValueError:
        return anchor.replace(year=anchor.year + periods, day=28)


def _next_due_date(recurring: RecurringTransaction) -> date_:
    anchor = recurring.anchor_date
    posted = recurring.last_posted_date
    if posted is None or posted < anchor:
        return anchor

    # Posting late skips missed occurrences, but never changes the anchor's
    # weekday/day-of-month. Use the posting date, not today, so overdue dates
    # remain overdue until the user posts another transaction.
    if recurring.frequency == RecurringFrequency.WEEKLY:
        periods = (posted - anchor).days // 7
    elif recurring.frequency == RecurringFrequency.MONTHLY:
        periods = (posted.year - anchor.year) * 12 + posted.month - anchor.month
    else:
        periods = posted.year - anchor.year
    candidate = _advance(anchor, recurring.frequency, periods)
    if candidate <= posted:
        candidate = _advance(anchor, recurring.frequency, periods + 1)
    return candidate


def _to_read(recurring: RecurringTransaction) -> RecurringTransactionRead:
    next_due = _next_due_date(recurring)
    today = date_.today()
    return RecurringTransactionRead(
        id=recurring.id,
        account_id=recurring.account_id,
        account_name=recurring.account.name,
        category_id=recurring.category_id,
        category_name=recurring.category.name if recurring.category else None,
        category_color=recurring.category.color if recurring.category else None,
        category_icon=recurring.category.icon if recurring.category else None,
        transfer_account_id=recurring.transfer_account_id,
        transfer_account_name=recurring.transfer_account.name if recurring.transfer_account else None,
        type=recurring.type,
        amount=recurring.amount,
        description=recurring.description,
        merchant=recurring.merchant,
        notes=recurring.notes,
        frequency=recurring.frequency,
        anchor_date=recurring.anchor_date,
        last_posted_date=recurring.last_posted_date,
        is_active=recurring.is_active,
        next_due_date=next_due,
        is_due=recurring.is_active and next_due <= today,
        days_until_due=(next_due - today).days,
    )


async def _get_or_404(session: AsyncSession, recurring_id: int) -> RecurringTransaction:
    result = await session.execute(
        select(RecurringTransaction).options(*_EAGER).where(RecurringTransaction.id == recurring_id)
    )
    recurring = result.scalar_one_or_none()
    if recurring is None:
        raise HTTPException(status_code=404, detail="Recurring transaction not found")
    return recurring


async def list_recurring(session: AsyncSession) -> list[RecurringTransactionRead]:
    result = await session.execute(
        select(RecurringTransaction).options(*_EAGER).order_by(RecurringTransaction.id)
    )
    return [_to_read(row) for row in result.scalars().all()]


async def create_recurring(session: AsyncSession, payload: RecurringTransactionCreate) -> RecurringTransactionRead:
    await _ensure_category_matches_type(session, payload.category_id, payload.type)
    recurring = RecurringTransaction(**payload.model_dump())
    session.add(recurring)
    await session.commit()
    return _to_read(await _get_or_404(session, recurring.id))


async def update_recurring(
    session: AsyncSession, recurring_id: int, payload: RecurringTransactionUpdate
) -> RecurringTransactionRead:
    recurring = await _get_or_404(session, recurring_id)
    updates = payload.model_dump(exclude_unset=True)
    effective_type = updates.get("type", recurring.type)
    effective_category_id = updates.get("category_id", recurring.category_id)
    await _ensure_category_matches_type(session, effective_category_id, effective_type)
    for field, value in updates.items():
        setattr(recurring, field, value)
    await session.commit()
    return _to_read(await _get_or_404(session, recurring_id))


async def delete_recurring(session: AsyncSession, recurring_id: int) -> None:
    recurring = await session.get(RecurringTransaction, recurring_id)
    if recurring is None:
        raise HTTPException(status_code=404, detail="Recurring transaction not found")
    await session.delete(recurring)
    await session.commit()


async def post_recurring(session: AsyncSession, recurring_id: int) -> RecurringTransactionRead:
    """Creates a real Transaction from the template, dated today, and moves
    last_posted_date forward — the only thing that advances the schedule."""
    recurring = await _get_or_404(session, recurring_id)
    today = date_.today()

    session.add(
        Transaction(
            account_id=recurring.account_id,
            category_id=recurring.category_id,
            transfer_account_id=recurring.transfer_account_id,
            type=recurring.type,
            amount=recurring.amount,
            description=recurring.description,
            merchant=recurring.merchant,
            notes=recurring.notes,
            date=today,
        )
    )
    recurring.last_posted_date = today
    await session.commit()
    return _to_read(await _get_or_404(session, recurring_id))
