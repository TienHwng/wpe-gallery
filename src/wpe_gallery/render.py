"""Build the self-contained gallery page from workshop item details."""

import html
import re
from importlib import resources
from string import Template

from .links import ITEM_URL

RES_RE = re.compile(r"(\d+) x (\d+)")
KINDS = {"Scene", "Video", "Web", "Application"}
HIDDEN_TAGS = {"Wallpaper", "Approved", "Everyone", "Preset", "Other resolution", "Dynamic resolution"}
SENSITIVE_TAGS = {"Mature", "Questionable"}


def card_html(n: int, f: dict) -> str:
    fid = f["publishedfileid"]
    raw_title = f.get("title") or "(riêng tư/đã xóa)"
    title = html.escape(raw_title)
    tags = [t.get("tag", "") for t in f.get("tags") or []]
    kind = next((t for t in tags if t in KINDS), "")
    res = next((f"{m[1]}×{m[2]}" for t in tags if (m := RES_RE.search(t))), "")
    labels = [t for t in tags if t and t not in KINDS and t not in HIDDEN_TAGS and not RES_RE.search(t)]
    searchable = html.escape(f"{raw_title.lower()} {fid} {' '.join(tags).lower()}")
    img = f.get("preview_url")
    sensitive = bool(SENSITIVE_TAGS.intersection(tags))
    classes = "card sensitive" if sensitive else "card"
    if img:
        pic = f'<img loading="lazy" decoding="async" alt="" src="{html.escape(img)}">'
        pin = f'<button class="pin" type="button" aria-label="Giữ {title}"></button>'
        extra = (
            f' data-img="{html.escape(img)}" data-kind="{html.escape(kind)}" data-res="{res}"'
            f' data-size="{int(f.get("file_size") or 0)}" data-subs="{int(f.get("subscriptions") or 0)}"'
            f' data-time="{int(f.get("time_created") or 0)}" data-tags="{html.escape("|".join(labels))}"'
        )
        if sensitive:
            extra += ' data-sensitive="1"'
    else:
        pic = f'<div class="na">Riêng tư hoặc đã xóa<br>ID {fid}</div>'
        pin = ""
        extra = ""
    return (
        f'<article class="{classes}" data-t="{searchable}" data-id="{fid}" data-n="{n}" data-title="{title}"{extra}>'
        f'<a href="{ITEM_URL.format(fid)}" target="_blank" rel="noopener">{pic}<p>#{n} {title}</p></a>{pin}</article>'
    )


def read_asset(name: str) -> str:
    return resources.files(__package__).joinpath("web", name).read_text(encoding="utf-8").strip()


def render(items: list[dict]) -> str:
    """Return one HTML page with the CSS, JS, and item cards inlined."""
    return Template(read_asset("gallery.html")).substitute(
        count=len(items),
        styles=read_asset("gallery.css"),
        cards="".join(card_html(n, f) for n, f in enumerate(items, 1)),
        script=read_asset("gallery.js"),
    )
