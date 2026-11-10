"""Command-line entry point for wpe-gallery."""

import argparse
import sys
import webbrowser
from pathlib import Path

import requests

from .links import ITEM_URL, collect_ids
from .render import render
from .steam import fetch_details

OUTPUT_DIR = Path("output")
CACHE_FILE = OUTPUT_DIR / "cache" / "steam_details.json"


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def run(a: argparse.Namespace) -> None:
    ids, dups = collect_ids(a.files)
    if not ids:
        sys.exit("Không tìm thấy link Workshop nào trong các file đã cho.")
    print(f"{len(ids)} unique IDs, {len(dups)} duplicated")
    for fid, where in dups.items():
        print(f"  dup {fid}: {', '.join(where)}")

    if a.links_out:
        write_text(a.links_out, "\n".join(ITEM_URL.format(i) for i in ids) + "\n")
        print(f"deduped links -> {a.links_out}")

    items = fetch_details(ids, CACHE_FILE, refresh=a.refresh)
    write_text(a.out, render(items))
    print(f"gallery -> {a.out.resolve()}")
    if not a.no_open:
        webbrowser.open(a.out.resolve().as_uri())


def main() -> None:
    p = argparse.ArgumentParser(description="Preview many Wallpaper Engine workshop links at once.")
    p.add_argument("files", nargs="+", type=Path, help="text files containing workshop links")
    p.add_argument("-o", "--out", type=Path, default=OUTPUT_DIR / "gallery.html")
    p.add_argument("--links-out", type=Path, help="also write deduplicated links to this file")
    p.add_argument("--no-open", action="store_true", help="don't open the browser")
    p.add_argument("--refresh", action="store_true", help="ignore cached Steam details and fetch them again")
    a = p.parse_args()

    try:
        run(a)
    # RequestException is a subclass of OSError, and its JSON error is also a ValueError, so it goes first.
    except requests.RequestException as e:
        sys.exit(f"Không lấy được dữ liệu từ Steam. Hãy kiểm tra mạng rồi chạy lại.\nChi tiết: {e}")
    except ValueError as e:
        sys.exit(str(e))
    except OSError as e:
        sys.exit(f"Không đọc hoặc ghi được file {e.filename}: {e.strerror}")
    except KeyError:
        sys.exit("Steam trả về dữ liệu không đúng định dạng. Hãy thử lại sau ít phút.")
