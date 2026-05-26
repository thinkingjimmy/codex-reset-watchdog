from __future__ import annotations

import re
from collections.abc import Iterable


def normalize_text(text: str) -> str:
    text = text or ""
    return re.sub(r"\s+", " ", text.replace("’", "'").replace("‘", "'").replace("`", "'")).strip().lower()


def term_hits(text: str, terms: Iterable[str]) -> list[str]:
    hits: list[str] = []
    for term in terms:
        normalized = normalize_text(term)
        if normalized and normalized in text:
            hits.append(term)
    return list(dict.fromkeys(hits))


def phrase_hits(text: str, terms: Iterable[str]) -> list[str]:
    """Match reply phrases with word boundaries to avoid yes->yesterday noise."""
    hits: list[str] = []
    normalized_text = normalize_text(text)
    for term in terms:
        normalized = normalize_text(term)
        if not normalized:
            continue
        pattern = r"(?<![\w@])" + re.escape(normalized).replace(r"\ ", r"\s+") + r"(?![\w])"
        if re.search(pattern, normalized_text, flags=re.IGNORECASE):
            hits.append(term)
    return list(dict.fromkeys(hits))


def regex_hits(text: str, patterns: Iterable[str]) -> list[str]:
    hits: list[str] = []
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            hits.append(match.group(0))
    return list(dict.fromkeys(hits))
