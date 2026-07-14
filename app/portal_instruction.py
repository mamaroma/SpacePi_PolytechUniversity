"""Преобразование markdown-инструкций в структуру для портала (без сырого md)."""
from __future__ import annotations

import re
from typing import Any

_EMOJI_RE = re.compile(
    "["
    "\U0001F300-\U0001FAFF"
    "\u2600-\u27BF"
    "\u2705\u274C\u26A0\uFE0F"
    "]+",
    flags=re.UNICODE,
)
_LINK_RE = re.compile(r"\[([^\]]+)\]\([^)]+\)")
_BOLD_RE = re.compile(r"\*\*([^*]+)\*\*")
_CODE_RE = re.compile(r"`([^`]+)`")


def _clean_inline(text: str) -> str:
    text = _EMOJI_RE.sub("", text)
    text = _LINK_RE.sub(r"\1", text)
    text = _BOLD_RE.sub(r"\1", text)
    text = _CODE_RE.sub(r"\1", text)
    text = text.replace("—", " — ").replace("  ", " ")
    return text.strip()


def _is_table_sep(line: str) -> bool:
    s = line.strip()
    return bool(s) and set(s.replace("|", "").replace(":", "").replace("-", "").strip()) == set()


def _parse_table_row(line: str) -> list[str]:
    parts = [p.strip() for p in line.strip().strip("|").split("|")]
    return [_clean_inline(p) for p in parts]


def markdown_to_portal_document(md: str) -> dict[str, Any]:
    lines = (md or "").replace("\r\n", "\n").split("\n")
    blocks: list[dict[str, Any]] = []
    i = 0
    title = ""

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if not stripped:
            i += 1
            continue

        if stripped in ("---", "***", "___"):
            i += 1
            continue

        if stripped.startswith("```"):
            i += 1
            code_lines = []
            while i < len(lines) and not lines[i].strip().startswith("```"):
                code_lines.append(lines[i].rstrip())
                i += 1
            if i < len(lines):
                i += 1
            if code_lines:
                blocks.append({"type": "code", "text": "\n".join(code_lines).strip()})
            continue

        if stripped.startswith("# ") and not stripped.startswith("## "):
            title = _clean_inline(stripped[2:])
            i += 1
            continue

        if stripped.startswith("## "):
            blocks.append({"type": "heading", "level": 2, "text": _clean_inline(stripped[3:])})
            i += 1
            continue

        if stripped.startswith("### "):
            blocks.append({"type": "heading", "level": 3, "text": _clean_inline(stripped[4:])})
            i += 1
            continue

        if stripped.startswith("> "):
            blocks.append({"type": "note", "text": _clean_inline(stripped[2:])})
            i += 1
            continue

        if "|" in stripped and i + 1 < len(lines) and _is_table_sep(lines[i + 1]):
            headers = _parse_table_row(stripped)
            i += 2
            rows = []
            while i < len(lines):
                row_line = lines[i].strip()
                if not row_line or "|" not in row_line:
                    break
                rows.append(_parse_table_row(row_line))
                i += 1
            blocks.append({"type": "table", "headers": headers, "rows": rows})
            continue

        if stripped.startswith("- ") or stripped.startswith("* "):
            items = []
            while i < len(lines):
                s = lines[i].strip()
                if s.startswith("- ") or s.startswith("* "):
                    items.append(_clean_inline(s[2:]))
                    i += 1
                else:
                    break
            blocks.append({"type": "list", "items": items})
            continue

        if re.match(r"^\d+\.\s", stripped):
            items = []
            while i < len(lines):
                s = lines[i].strip()
                m = re.match(r"^\d+\.\s+(.*)", s)
                if m:
                    items.append(_clean_inline(m.group(1)))
                    i += 1
                else:
                    break
            blocks.append({"type": "olist", "items": items})
            continue

        para_lines = [stripped]
        i += 1
        while i < len(lines):
            nxt = lines[i].strip()
            if (
                not nxt
                or nxt.startswith("#")
                or nxt.startswith("```")
                or nxt.startswith("> ")
                or nxt.startswith("- ")
                or nxt.startswith("* ")
                or re.match(r"^\d+\.\s", nxt)
                or (nxt.startswith("|") and "|" in nxt)
            ):
                break
            para_lines.append(nxt)
            i += 1
        blocks.append({"type": "paragraph", "text": _clean_inline(" ".join(para_lines))})

    return {"title": title, "blocks": blocks}
