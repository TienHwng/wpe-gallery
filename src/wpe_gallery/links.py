"""Find Steam Workshop item IDs in free-form text files."""

import re
from pathlib import Path

ITEM_URL = "https://steamcommunity.com/sharedfiles/filedetails/?id={}"
ID_RE = re.compile(r"[?&]id=(\d+)")


def collect_ids(files: list[Path]) -> tuple[list[str], dict[str, list[str]]]:
    """Return unique IDs (first-seen order) and a map of duplicated IDs -> sources."""
    seen: dict[str, list[str]] = {}
    for f in files:
        try:
            text = f.read_text(encoding="utf-8")
        except UnicodeDecodeError as e:
            raise ValueError(f"File {f} không phải UTF-8. Hãy lưu lại file với mã hóa UTF-8 rồi chạy lại.") from e
        for lineno, line in enumerate(text.splitlines(), 1):
            for fid in ID_RE.findall(line):
                seen.setdefault(fid, []).append(f"{f.name}:{lineno}")
    dups = {k: v for k, v in seen.items() if len(v) > 1}
    return list(seen), dups
