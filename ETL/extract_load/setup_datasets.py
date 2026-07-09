"""
One-time Phase 1 setup: creates the three BigQuery datasets PerpScope uses.

Run this AFTER you have a GCP project + service account key ready, and after
filling in ETL/.env (copy from .env.example) with your project ID and the
path to your downloaded key:
    python -m extract.setup_datasets

Safe to re-run (exists_ok=True) -- won't error or duplicate if datasets already exist.
"""
from __future__ import annotations

from google.cloud import bigquery

from . import env  # noqa: F401  -- loads ETL/.env as a side effect, must run first

DATASETS = ["perpscope_raw", "perpscope_staging", "perpscope_marts"]
LOCATION = "US"  # keeps us inside the BigQuery free tier


def main() -> None:
    client = bigquery.Client()  # picks up GOOGLE_APPLICATION_CREDENTIALS automatically
    print(f"Project: {client.project}")

    for name in DATASETS:
        ds_ref = bigquery.Dataset(f"{client.project}.{name}")
        ds_ref.location = LOCATION
        ds = client.create_dataset(ds_ref, exists_ok=True)
        print(f"  ready: {ds.dataset_id}  (location={ds.location})")

    print("\nDone. Verify with:")
    print(f"  bq ls --project_id={client.project}")
    print("or in the console: https://console.cloud.google.com/bigquery")


if __name__ == "__main__":
    main()
