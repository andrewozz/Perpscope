"""
Loads local dev credentials so scripts can just `from . import env` instead
of every developer manually exporting env vars.

Looks for .env in ETL/secrets/.env first (keeps it next to the downloaded key
file), falling back to ETL/.env. GOOGLE_APPLICATION_CREDENTIALS is resolved
relative to wherever the .env file was actually found, so a relative path
like "./my-key.json" works no matter which of the two locations you use.

In CI (GitHub Actions, Phase 5), neither .env exists -- the workflow sets
GOOGLE_APPLICATION_CREDENTIALS / GCP_PROJECT directly as job env vars from
GitHub Secrets instead. load_dotenv() is a no-op if the file isn't found, so
this module is safe to import in both environments.
"""
import os
from pathlib import Path

from dotenv import load_dotenv

_ETL_DIR = Path(__file__).resolve().parent.parent
_ENV_CANDIDATES = [_ETL_DIR / "secrets" / ".env", _ETL_DIR / ".env"]

_loaded_from = None
for _candidate in _ENV_CANDIDATES:
    if _candidate.exists():
        load_dotenv(_candidate)
        _loaded_from = _candidate
        break

# GOOGLE_APPLICATION_CREDENTIALS in .env is written as a relative path (e.g.
# "./my-key.json"). Resolve it relative to whichever .env file was loaded,
# so scripts work the same regardless of the current working directory.
_creds = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
if _creds and not os.path.isabs(_creds) and _loaded_from is not None:
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(
        (_loaded_from.parent / _creds).resolve()
    )
