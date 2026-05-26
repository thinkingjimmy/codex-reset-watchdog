from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from dotenv import dotenv_values, load_dotenv


def _set_env_if_blank(name: str, value: str | None) -> None:
    if value is None:
        return
    value = str(value).strip()
    if value and not os.getenv(name, "").strip():
        os.environ[name] = value


def _load_env_file_if_present(path: str | Path | None) -> None:
    if not path:
        return
    candidate = Path(str(path)).expanduser()
    if not candidate.exists() or not candidate.is_file():
        return
    for key, value in dotenv_values(candidate).items():
        _set_env_if_blank(str(key), value)


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _load_runtime_environment() -> None:
    """Load .env first, then optional legacy secret files."""
    root = _repo_root()

    load_dotenv(root / ".env", override=False)
    load_dotenv(override=False)

    secret_env_candidates = [
        os.getenv("CODEX_RESET_WATCH_SECRETS_FILE"),
        os.getenv("TWITTERAPI_IO_SECRETS_FILE"),
        root / ".secrets.env",
        root / "secrets.env",
        root / "secrets" / "secrets.env",
        Path.home() / ".config" / "codex-reset-watch" / "secrets.env",
    ]
    for candidate in secret_env_candidates:
        _load_env_file_if_present(candidate)


def _read_first_nonempty_line(path: str | Path | None) -> str:
    if not path:
        return ""
    candidate = Path(str(path)).expanduser()
    if not candidate.exists() or not candidate.is_file():
        return ""
    try:
        for line in candidate.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                return line
    except OSError:
        return ""
    return ""


_load_runtime_environment()


def env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None or value == "":
        return default
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


def env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None or value == "":
        return default
    try:
        return int(value.strip())
    except ValueError as exc:
        raise ValueError(f"{name} must be an integer, got {value!r}") from exc


def env_csv(name: str, default: list[str]) -> list[str]:
    value = os.getenv(name)
    if not value:
        return default
    return [item.strip().lower() for item in value.split(",") if item.strip()]


def require_api_key() -> str:
    """Return the TwitterAPI.io key from .env/env or an optional key file."""
    placeholder_values = {
        "",
        "REPLACE_WITH_YOUR_TWITTERAPI_IO_KEY",
        "YOUR_TWITTERAPI_IO_KEY",
        "PASTE_YOUR_TWITTERAPI_IO_KEY_HERE",
    }
    api_key = os.getenv("TWITTERAPI_IO_KEY", "").strip()
    if api_key and api_key not in placeholder_values:
        return api_key

    root = _repo_root()
    key_file_candidates = [
        os.getenv("TWITTERAPI_IO_KEY_FILE"),
        root / "secrets" / "twitterapi_io_key",
        root / ".twitterapi_io_key",
        Path.home() / ".config" / "codex-reset-watch" / "twitterapi_io_key",
    ]
    for candidate in key_file_candidates:
        api_key = _read_first_nonempty_line(candidate)
        if api_key:
            return api_key

    raise RuntimeError(
        "TwitterAPI.io API key is required. Copy .env.example to .env and "
        "replace TWITTERAPI_IO_KEY=PASTE_YOUR_TWITTERAPI_IO_KEY_HERE with your real key."
    )


def twitterapi_headers() -> dict[str, str]:
    return {"X-API-Key": require_api_key(), "Content-Type": "application/json"}


def pretty_json(obj: Any) -> str:
    return json.dumps(obj, indent=2, ensure_ascii=False, sort_keys=True)
