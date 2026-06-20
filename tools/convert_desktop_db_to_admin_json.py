#!/usr/bin/env python3
"""
Convert a Trini-D desktop software SQLite database into a JSON file that can be
imported into the Trini-D web admin dashboard.

Usage:
  python convert_desktop_db_to_admin_json.py trini_d_print_database.sqlite3 TriniD_Admin_Import.json

Typical desktop database location on Windows:
  C:\\Users\\<YourName>\\AppData\\Roaming\\Trini_D_3D_Printing\\trini_d_print_database.sqlite3
"""

import json
import sqlite3
import sys
from datetime import datetime
from pathlib import Path


def now_stamp():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def num(value):
    try:
        if value is None or value == "":
            return 0.0
        return float(value)
    except Exception:
        return 0.0


def rows(conn, table):
    exists = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,)
    ).fetchone()
    if not exists:
        return []
    cur = conn.execute(f"SELECT * FROM {table} ORDER BY id ASC")
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


def convert(input_db: Path):
    out = {
        "itemRecords": [],
        "orders": [],
        "quotes": [],
        "budget": [],
        "customGroups": [],
        "customRecords": [],
    }
    with sqlite3.connect(str(input_db)) as conn:
        for r in rows(conn, "print_records"):
            price = num(r.get("price"))
            cost = num(r.get("total_cost"))
            out["itemRecords"].append({
                "id": f"DESKTOP-ITEM-{r.get('id')}",
                "desktopId": r.get("id"),
                "createdAt": r.get("created_at") or now_stamp(),
                "orderId": r.get("order_id") or "",
                "customer": r.get("customer_name") or "",
                "model": r.get("model_name") or "",
                "datePrinted": r.get("date_printed") or "",
                "status": r.get("status") or "",
                "printTimeMinutes": num(r.get("print_time_minutes")),
                "lengthM": num(r.get("length_m")),
                "weightG": num(r.get("weight_g")),
                "electricityCost": num(r.get("electricity_cost")),
                "filamentCost": num(r.get("filament_cost")),
                "machineDepreciation": num(r.get("machine_depreciation")),
                "totalCost": cost,
                "price": price,
                "profit": price - cost,
                "notes": "Imported from desktop SQLite database",
            })

        for r in rows(conn, "order_records"):
            out["orders"].append({
                "id": f"DESKTOP-ORDER-{r.get('id')}",
                "desktopId": r.get("id"),
                "createdAt": r.get("created_at") or now_stamp(),
                "orderId": r.get("order_id") or "",
                "customer": r.get("customer_name") or "",
                "model": r.get("model_name") or "",
                "datePrinted": r.get("date_printed") or "",
                "price": num(r.get("price")),
                "paidStatus": r.get("paid_status") or "",
                "paidMethod": r.get("paid_method") or "",
                "advancePayment": num(r.get("advance_payment")),
                "totalCost": num(r.get("total_cost")),
                "profitMargin": num(r.get("profit_margin")),
                "profit": num(r.get("profit")),
                "items": [],
                "notes": "Imported from desktop SQLite database",
            })

        for r in rows(conn, "budget_records"):
            out["budget"].append({
                "id": f"DESKTOP-BUDGET-{r.get('id')}",
                "desktopId": r.get("id"),
                "createdAt": r.get("created_at") or now_stamp(),
                "entryDate": r.get("entry_date") or "",
                "entryType": r.get("entry_type") or "",
                "category": r.get("category") or "",
                "description": r.get("description") or "",
                "amount": num(r.get("amount")),
                "method": r.get("payment_method") or "",
                "reference": r.get("reference") or "",
                "notes": r.get("notes") or "",
                "source": r.get("source") or "Manual",
                "sourceTable": r.get("source_table") or "",
                "sourceId": r.get("source_id") or 0,
            })

        for r in rows(conn, "custom_groups"):
            out["customGroups"].append({
                "id": f"DESKTOP-GROUP-{r.get('id')}",
                "desktopId": r.get("id"),
                "createdAt": r.get("created_at") or now_stamp(),
                "name": r.get("name") or f"Desktop Group {r.get('id')}",
            })

        for r in rows(conn, "custom_records"):
            out["customRecords"].append({
                "id": f"DESKTOP-CUSTOM-{r.get('id')}",
                "desktopId": r.get("id"),
                "createdAt": r.get("created_at") or now_stamp(),
                "groupId": f"DESKTOP-GROUP-{r.get('group_id')}",
                "sourceItemId": f"DESKTOP-ITEM-{r.get('source_item_id')}" if r.get("source_item_id") else "",
                "orderId": r.get("order_id") or "",
                "customer": r.get("customer_name") or "",
                "model": r.get("model_name") or "",
                "datePrinted": r.get("date_printed") or "",
                "status": r.get("status") or "",
                "printTimeMinutes": num(r.get("print_time_minutes")),
                "lengthM": num(r.get("length_m")),
                "weightG": num(r.get("weight_g")),
                "electricityCost": num(r.get("electricity_cost")),
                "filamentCost": num(r.get("filament_cost")),
                "machineDepreciation": num(r.get("machine_depreciation")),
                "totalCost": num(r.get("total_cost")),
                "price": num(r.get("price")),
                "notes": r.get("notes") or "Imported from desktop SQLite database",
            })

    # Newest first, matching the web dashboard display style.
    for key in out:
        out[key] = list(reversed(out[key]))
    return out


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    input_db = Path(sys.argv[1]).expanduser().resolve()
    output_json = Path(sys.argv[2]).expanduser().resolve() if len(sys.argv) >= 3 else input_db.with_suffix(".admin-import.json")
    if not input_db.exists():
        raise FileNotFoundError(input_db)
    data = convert(input_db)
    output_json.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Converted: {input_db}")
    print(f"Saved:     {output_json}")
    print(f"Items: {len(data['itemRecords'])}, Orders: {len(data['orders'])}, Budget: {len(data['budget'])}, Custom: {len(data['customRecords'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
