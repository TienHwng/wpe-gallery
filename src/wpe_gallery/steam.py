"""Fetch workshop item details from the Steam Web API, with a local cache."""

import json
import time
from pathlib import Path

import requests

API = "https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/"
BATCH = 100
CACHE_TTL_SECONDS = 7 * 24 * 60 * 60
# Result 1 means found and 9 means private or removed. Anything else is a temporary failure.
CACHEABLE_RESULTS = {1, 9}


def load_cache(path: Path, now: float) -> dict[str, dict]:
    """Return unexpired cache entries. A missing or damaged cache counts as empty."""
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    if not isinstance(raw, dict):
        return {}
    fresh = {}
    for fid, entry in raw.items():
        if not isinstance(entry, dict) or "data" not in entry:
            continue
        fetched_at = entry.get("fetched_at")
        if isinstance(fetched_at, (int, float)) and now - fetched_at < CACHE_TTL_SECONDS:
            fresh[fid] = entry
    return fresh


def save_cache(path: Path, cache: dict[str, dict]) -> None:
    """Write the cache atomically. Failing to save must not stop the gallery from being built."""
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        temp = path.with_suffix(".tmp")
        temp.write_text(json.dumps(cache), encoding="utf-8")
        temp.replace(path)
    except OSError as e:
        print(f"  warning: could not save cache: {e}")


def fetch_details(ids: list[str], cache_path: Path, refresh: bool = False) -> list[dict]:
    """Return details for ids in order, calling Steam only for items missing from the cache."""
    now = time.time()
    cache = load_cache(cache_path, now)
    missing = list(ids) if refresh else [i for i in ids if i not in cache]
    print(f"  cache: {len(ids) - len(missing)} reused, {len(missing)} to fetch")
    this_run: dict[str, dict] = {}
    with requests.Session() as s:
        for start in range(0, len(missing), BATCH):
            chunk = missing[start : start + BATCH]
            data = {"itemcount": len(chunk)}
            data |= {f"publishedfileids[{i}]": x for i, x in enumerate(chunk)}
            r = s.post(API, data=data, timeout=30)
            r.raise_for_status()
            for item in r.json()["response"]["publishedfiledetails"]:
                fid = item["publishedfileid"]
                this_run[fid] = item
                if item.get("result") in CACHEABLE_RESULTS:
                    cache[fid] = {"fetched_at": now, "data": item}
            # Saved after every batch so a failure partway through keeps the earlier batches.
            save_cache(cache_path, cache)
            print(f"  fetched {min(start + BATCH, len(missing))}/{len(missing)}")
    out = []
    for fid in ids:
        if fid in this_run:
            out.append(this_run[fid])
        elif fid in cache:
            out.append(cache[fid]["data"])
    return out
