"""Account-type and ordering behavior exposed by the accounts API."""
from datetime import date

from httpx import AsyncClient
import pytest

from tests.helpers import money, txn_payload


async def test_debit_card_is_a_liquid_account_type(client: AsyncClient, categories):
    response = await client.post(
        "/accounts",
        json={"name": "Debit card", "type": "debit_card", "currency": "RUB"},
    )

    assert response.status_code == 201
    debit_card = response.json()
    assert debit_card["type"] == "debit_card"

    transaction = await client.post(
        "/transactions",
        json=txn_payload(
            debit_card["id"],
            type="income",
            amount="1000.00",
            category_id=categories["Salary"]["id"],
            date=date.today().isoformat(),
        ),
    )
    assert transaction.status_code == 201

    summary = await client.get("/net-worth/summary", params={"range": "all"})

    assert summary.status_code == 200
    assert money(summary.json()["current"]) == money("1000.00")


async def _account_names(client: AsyncClient, include_archived: bool = False) -> list[str]:
    response = await client.get("/accounts", params={"include_archived": include_archived})
    assert response.status_code == 200
    return [account["name"] for account in response.json()]


async def test_new_accounts_append_and_can_move(client: AsyncClient):
    zebra = (await client.post("/accounts", json={"name": "Zebra"})).json()
    alpha = (await client.post("/accounts", json={"name": "Alpha"})).json()

    assert await _account_names(client) == ["Main Account", "Zebra", "Alpha"]

    moved = await client.post(
        f"/accounts/{alpha['id']}/move",
        json={"direction": "up", "include_archived": False},
    )

    assert moved.status_code == 204
    assert await _account_names(client) == ["Main Account", "Alpha", "Zebra"]

    boundary = await client.post(
        f"/accounts/{zebra['id']}/move",
        json={"direction": "down", "include_archived": False},
    )
    assert boundary.status_code == 400


async def test_move_skips_hidden_archived_accounts(client: AsyncClient):
    first = (await client.post("/accounts", json={"name": "First"})).json()
    archived = (await client.post("/accounts", json={"name": "Archived"})).json()
    last = (await client.post("/accounts", json={"name": "Last"})).json()
    await client.patch(f"/accounts/{archived['id']}", json={"is_archived": True})

    moved = await client.post(
        f"/accounts/{last['id']}/move",
        json={"direction": "up", "include_archived": False},
    )

    assert moved.status_code == 204
    assert await _account_names(client) == ["Main Account", "Last", "First"]
    assert await _account_names(client, include_archived=True) == [
        "Main Account",
        "Last",
        "Archived",
        "First",
    ]


async def test_backup_roundtrip_preserves_account_order(client: AsyncClient):
    first = (await client.post("/accounts", json={"name": "First"})).json()
    last = (await client.post("/accounts", json={"name": "Last"})).json()
    await client.post(
        f"/accounts/{last['id']}/move",
        json={"direction": "up", "include_archived": False},
    )
    expected_order = await _account_names(client)

    backup = (await client.get("/backup/export")).json()
    await client.post(
        f"/accounts/{first['id']}/move",
        json={"direction": "up", "include_archived": False},
    )
    restored = await client.post("/backup/import", json=backup)

    assert restored.status_code == 200
    assert await _account_names(client) == expected_order


async def test_legacy_backup_without_account_order_remains_moveable(client: AsyncClient):
    await client.post("/accounts", json={"name": "Zebra"})
    alpha = (await client.post("/accounts", json={"name": "Alpha"})).json()
    backup = (await client.get("/backup/export")).json()
    for account in backup["accounts"]:
        account.pop("sort_order")

    restored = await client.post("/backup/import", json=backup)
    assert restored.status_code == 200
    assert await _account_names(client) == ["Alpha", "Main Account", "Zebra"]

    moved = await client.post(
        f"/accounts/{alpha['id']}/move",
        json={"direction": "down", "include_archived": False},
    )
    assert moved.status_code == 204
    assert await _account_names(client) == ["Main Account", "Alpha", "Zebra"]


async def test_drag_moves_across_accounts_and_preserves_hidden_slots(client: AsyncClient, account_id):
    first = (await client.post("/accounts", json={"name": "First"})).json()
    archived = (await client.post("/accounts", json={"name": "Archived"})).json()
    last = (await client.post("/accounts", json={"name": "Last"})).json()
    await client.patch(f"/accounts/{archived['id']}", json={"is_archived": True})
    await client.post("/transactions", json=txn_payload(first["id"], type="income", amount="100.00"))
    before = {a["id"]: a["balance"] for a in (await client.get("/accounts")).json()}

    response = await client.post(
        f"/accounts/{last['id']}/move", json={"target_account_id": account_id},
    )
    assert response.status_code == 204
    assert await _account_names(client, True) == ["Last", "Main Account", "Archived", "First"]
    after = {a["id"]: a["balance"] for a in (await client.get("/accounts")).json()}
    assert before == after

    response = await client.post(
        f"/accounts/{last['id']}/move", json={"target_account_id": first["id"]},
    )
    assert response.status_code == 204
    assert await _account_names(client, True) == ["Main Account", "First", "Archived", "Last"]
    response = await client.post(
        f"/accounts/{archived['id']}/move",
        json={"target_account_id": account_id, "include_archived": True},
    )
    assert response.status_code == 204
    assert await _account_names(client, True) == ["Archived", "Main Account", "First", "Last"]


@pytest.mark.parametrize("payload", [
    {}, {"direction": "left"}, {"target_account_id": 0},
    {"direction": "up", "target_account_id": 1},
])
async def test_move_rejects_invalid_destination(client: AsyncClient, account_id, payload):
    response = await client.post(f"/accounts/{account_id}/move", json=payload)
    assert response.status_code == 422
    assert await _account_names(client) == ["Main Account"]


async def test_drag_rejects_hidden_or_missing_target(client: AsyncClient, account_id):
    archived = (await client.post("/accounts", json={"name": "Archived"})).json()
    await client.patch(f"/accounts/{archived['id']}", json={"is_archived": True})
    for target in [archived["id"], 999999]:
        response = await client.post(f"/accounts/{account_id}/move", json={"target_account_id": target})
        assert response.status_code == 400
        assert await _account_names(client, True) == ["Main Account", "Archived"]
