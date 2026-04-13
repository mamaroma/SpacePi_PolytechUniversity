import psycopg2
from . import conn_credentials
import traceback


def commit(query: str, data: tuple = None) -> None:
    conn = psycopg2.connect(**conn_credentials)
    try:
        cur = conn.cursor()
        cur.execute(query, data)
        conn.commit()
    except Exception:
        print(traceback.format_exc())
    finally:
        cur.close()
        conn.close()


def fetchone(query: str, data: tuple = None) -> tuple:
    conn = psycopg2.connect(**conn_credentials)
    try:
        cur = conn.cursor()
        cur.execute(query, data)
        res = cur.fetchone()
    except Exception:
        print(traceback.format_exc())
    finally:
        cur.close()
        conn.close()
    return res


def fetchall(query: str, data: tuple = None) -> list[tuple]:
    conn = psycopg2.connect(**conn_credentials)
    try:
        cur = conn.cursor()
        cur.execute(query, data)
        res = cur.fetchall()
    except Exception:
        print(traceback.format_exc())
    finally:
        cur.close()
        conn.close()
    return res


def commit_and_fetchone(query: str, data: tuple = None) -> tuple:
    conn = psycopg2.connect(**conn_credentials)
    res = None
    try:
        cur = conn.cursor()
        cur.execute(query, data)
        res = cur.fetchone()
        conn.commit()
    except Exception:
        print(traceback.format_exc())
    finally:
        cur.close()
        conn.close()
    return res