#!/usr/bin/env python3
"""One-shot VK repost for seeded news ids. Run inside the api container:

  docker compose exec -T api python scripts/repost_news_vk.py n32 n33
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlmodel import Session

from app.db import engine, init_db
from app.models import NewsItem
from app.news import _item_to_dict
from app.vk_crosspost import try_crosspost_news


def main(ids: list[str]) -> int:
    init_db()
    ok_all = True
    with Session(engine) as session:
        for news_id in ids:
            item = session.get(NewsItem, news_id)
            if item is None:
                print(f"{news_id}: NOT FOUND")
                ok_all = False
                continue
            result = try_crosspost_news(_item_to_dict(item))
            print(f"{news_id}: {result}")
            if not (result or {}).get("ok"):
                ok_all = False
    return 0 if ok_all else 1


if __name__ == "__main__":
    news_ids = sys.argv[1:] or ["n32", "n33"]
    raise SystemExit(main(news_ids))
