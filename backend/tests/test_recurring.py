"""Recurring schedules must stay anchored when a payment is posted off schedule."""
from datetime import date

import pytest
from httpx import AsyncClient

from app.models.enums import RecurringFrequency
from app.models.recurring import RecurringTransaction
from app.services import recurring_service
from tests.helpers import money


def freeze_today(monkeypatch, value: str) -> None:
    class FixedDate(date):
        @classmethod
        def today(cls):
            return date.fromisoformat(value)

    monkeypatch.setattr(recurring_service, "date_", FixedDate)


@pytest.mark.parametrize("frequency,anchor,posted,expected", [
    ("monthly", "2026-06-19", None, "2026-06-19"),
    ("monthly", "2026-06-19", "2026-07-08", "2026-07-19"),
    ("monthly", "2026-06-19", "2026-07-19", "2026-08-19"),
    ("monthly", "2026-06-19", "2026-07-22", "2026-08-19"),
    ("monthly", "2026-06-19", "2026-05-01", "2026-06-19"),
    ("monthly", "2026-01-31", "2026-02-28", "2026-03-31"),
    ("monthly", "2028-01-31", "2028-02-01", "2028-02-29"),
    ("monthly", "2026-01-31", "2026-12-31", "2027-01-31"),
    ("weekly", "2026-01-05", "2026-01-07", "2026-01-12"),
    ("weekly", "2026-01-05", "2026-01-12", "2026-01-19"),
    ("weekly", "2026-01-05", "2026-02-04", "2026-02-09"),
    ("yearly", "2024-02-29", "2025-02-28", "2026-02-28"),
    ("yearly", "2024-02-29", "2027-03-01", "2028-02-29"),
    ("yearly", "2024-06-19", "2026-04-01", "2026-06-19"),
])
def test_next_due_stays_on_anchor(frequency, anchor, posted, expected):
    recurring = RecurringTransaction(
        frequency=RecurringFrequency(frequency),
        anchor_date=date.fromisoformat(anchor),
        last_posted_date=date.fromisoformat(posted) if posted else None,
    )
    assert recurring_service._next_due_date(recurring) == date.fromisoformat(expected)


async def test_post_and_edit_keep_schedule_without_changing_transactions(
    client: AsyncClient, account_id, monkeypatch,
):
    freeze_today(monkeypatch, "2026-07-08")
    created = await client.post("/recurring", json={
        "account_id": account_id, "type": "expense", "amount": "20.00",
        "description": "Test subscription", "frequency": "monthly", "anchor_date": "2026-06-19",
    })
    assert created.status_code == 201
    template = created.json()
    assert template["next_due_date"] == "2026-06-19"
    assert template["is_due"] is True
    assert template["days_until_due"] == -19

    posted = await client.post(f"/recurring/{template['id']}/post")
    assert posted.status_code == 201
    assert posted.json()["last_posted_date"] == "2026-07-08"
    assert posted.json()["next_due_date"] == "2026-07-19"
    assert posted.json()["days_until_due"] == 11
    assert posted.json()["is_due"] is False

    transactions = (await client.get("/transactions")).json()
    assert transactions["total"] == 1
    assert transactions["items"][0]["date"] == "2026-07-08"
    assert money(transactions["items"][0]["amount"]) == money("20.00")

    changed = await client.patch(f"/recurring/{template['id']}", json={"anchor_date": "2026-06-23"})
    assert changed.status_code == 200
    assert changed.json()["next_due_date"] == "2026-07-23"
    assert changed.json()["days_until_due"] == 15
    changed = await client.patch(f"/recurring/{template['id']}", json={"frequency": "weekly"})
    assert changed.status_code == 200
    assert changed.json()["next_due_date"] == "2026-07-14"
    assert changed.json()["days_until_due"] == 6

    freeze_today(monkeypatch, "2026-07-16")
    listed = (await client.get("/recurring")).json()[0]
    assert listed["next_due_date"] == "2026-07-14"
    assert listed["is_due"] is True
    assert listed["days_until_due"] == -2
    assert (await client.get("/transactions")).json() == transactions


async def test_month_end_posting_returns_to_original_day(client: AsyncClient, account_id, monkeypatch):
    freeze_today(monkeypatch, "2026-01-31")
    created = await client.post("/recurring", json={
        "account_id": account_id, "type": "expense", "amount": "20.00",
        "description": "Month end subscription", "frequency": "monthly", "anchor_date": "2026-01-31",
    })
    assert created.status_code == 201
    recurring_id = created.json()["id"]
    first = await client.post(f"/recurring/{recurring_id}/post")
    assert first.status_code == 201
    assert first.json()["next_due_date"] == "2026-02-28"

    freeze_today(monkeypatch, "2026-02-28")
    second = await client.post(f"/recurring/{recurring_id}/post")
    assert second.status_code == 201
    assert second.json()["next_due_date"] == "2026-03-31"
    assert second.json()["days_until_due"] == 31
