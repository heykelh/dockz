"""Ingestion Géorisques (installations classées, Île-de-France) vers bronze + profilage des rubriques."""
import json
import sys
import time

import requests

from pipelines.common.db import end_run, get_conn, start_run

API_URL = "https://georisques.gouv.fr/api/v1/installations_classees"
SOURCE_ID = "georisques_icpe"
DEPARTEMENTS_IDF = ["75", "77", "78", "91", "92", "93", "94", "95"]
PAGE_SIZE = 100
PAUSE_S = 0.3
BATCH = 1000

session = requests.Session()


def fetch_page(dep: str, page: int) -> dict:
    params = {"departement": dep, "page": page, "page_size": PAGE_SIZE}
    for tentative in range(6):
        try:
            r = session.get(API_URL, params=params, timeout=60)
        except (requests.ConnectionError, requests.Timeout):
            time.sleep(3 * (tentative + 1))
            continue
        if r.status_code == 429 or r.status_code >= 500:
            time.sleep(3 * (tentative + 1))
            continue
        r.raise_for_status()
        return r.json()
    raise RuntimeError(f"Échec répété pour le département {dep} page {page}")


def collect() -> dict[str, dict]:
    rows: dict[str, dict] = {}
    for dep in DEPARTEMENTS_IDF:
        page = 1
        while True:
            data = fetch_page(dep, page)
            for inst in data.get("data") or []:
                code = inst.get("codeAIOT")
                if code:
                    rows[code] = inst
            total_pages = data.get("total_pages", 1) or 1
            if page >= total_pages:
                break
            page += 1
            time.sleep(PAUSE_S)
        print(f"{dep} : {total_pages} page(s), {len(rows)} installations cumulées")
    return rows


def load_bronze(conn, run_id: int, rows: dict[str, dict]) -> None:
    items = list(rows.items())
    with conn.cursor() as cur:
        for i in range(0, len(items), BATCH):
            cur.executemany(
                """
                insert into bronze.georisques_installations (code_aiot, payload, run_id)
                values (%s, %s::jsonb, %s)
                on conflict (code_aiot) do update
                   set payload = excluded.payload, run_id = excluded.run_id, ingere_le = now()
                """,
                [(code, json.dumps(p, ensure_ascii=False), run_id) for code, p in items[i:i + BATCH]],
            )
            conn.commit()


def profile(conn) -> None:
    with conn.cursor() as cur:
        print("\n=== Installations par régime ===")
        cur.execute(
            """
            select payload->>'regime', count(*),
                   count(*) filter (where jsonb_array_length(coalesce(payload->'rubriques', '[]'::jsonb)) > 0)
            from bronze.georisques_installations
            group by 1 order by 2 desc
            """
        )
        print("(régime, installations, dont avec rubriques renseignées)")
        for row in cur.fetchall():
            print(row)

        print("\n=== Exemples de rubriques ===")
        cur.execute(
            """
            select payload->>'raisonSociale', payload->'rubriques'
            from bronze.georisques_installations
            where jsonb_array_length(coalesce(payload->'rubriques', '[]'::jsonb)) > 0
            limit 3
            """
        )
        for nom, rub in cur.fetchall():
            print(f"\n{nom}\n{json.dumps(rub, ensure_ascii=False, indent=2)[:1500]}")

        print("\n=== Installations citant la rubrique 1510 (recherche texte) ===")
        cur.execute(
            """
            select payload->>'regime', count(*)
            from bronze.georisques_installations
            where (payload->'rubriques')::text like '%1510%'
            group by 1 order by 2 desc
            """
        )
        for row in cur.fetchall():
            print(row)


def main() -> int:
    with get_conn() as conn:
        run_id = start_run(conn, SOURCE_ID)
    try:
        rows = collect()
        with get_conn() as conn:
            load_bronze(conn, run_id, rows)
            end_run(conn, run_id, SOURCE_ID, "succes", len(rows), f"{len(rows)} installations en bronze")
            print(f"\nOK : {len(rows)} installations en bronze (run {run_id})")
            profile(conn)
        return 0
    except Exception as exc:
        print(f"ECHEC : {exc}")
        try:
            with get_conn() as conn:
                end_run(conn, run_id, SOURCE_ID, "echec", 0, str(exc)[:500])
        except Exception:
            pass
        return 1


if __name__ == "__main__":
    sys.exit(main())
