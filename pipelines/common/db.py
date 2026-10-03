import os
from contextlib import contextmanager

import psycopg
from dotenv import load_dotenv

load_dotenv()


@contextmanager
def get_conn():
    url = os.environ["DATABASE_URL"]
    with psycopg.connect(url, autocommit=False) as conn:
        yield conn


def start_run(conn, source_id: str) -> int:
    with conn.cursor() as cur:
        cur.execute(
            "insert into gov.ingestion_runs (source_id) values (%s) returning run_id",
            (source_id,),
        )
        run_id = cur.fetchone()[0]
    conn.commit()
    return run_id


def end_run(conn, run_id: int, source_id: str, statut: str, nb_lignes: int, message: str = "") -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            update gov.ingestion_runs
               set ended_at = now(), statut = %s, nb_lignes = %s, message = %s
             where run_id = %s
            """,
            (statut, nb_lignes, message, run_id),
        )
        if statut == "succes":
            cur.execute(
                """
                update gov.sources
                   set derniere_ingestion = now(), nb_lignes_derniere = %s
                 where source_id = %s
                """,
                (nb_lignes, source_id),
            )
    conn.commit()
