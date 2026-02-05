#!/usr/bin/env python3
"""
Push Dataset to Hugging Face Hub

Uploads a local dataset bundle to Hugging Face Hub.
Requires: huggingface_hub library

Usage:
    python push_dataset.py --bundle-dir=./runs/hf_export --repo=2ndmynd/signals_v1_private
"""

import argparse
import json
import os
import sys
from pathlib import Path

try:
    from huggingface_hub import HfApi, create_repo
except ImportError:
    print("ERROR: huggingface_hub not installed. Run: pip install huggingface_hub", file=sys.stderr)
    sys.exit(1)


def push_dataset(bundle_dir: str, repo: str, token: str, private: bool, commit_message: str):
    """Push dataset bundle to HF Hub."""
    
    bundle_path = Path(bundle_dir)
    dataset_path = bundle_path / "dataset.jsonl"
    info_path = bundle_path / "dataset_info.json"
    
    if not dataset_path.exists():
        print(f"ERROR: dataset.jsonl not found in {bundle_dir}", file=sys.stderr)
        sys.exit(1)
    
    if not info_path.exists():
        print(f"ERROR: dataset_info.json not found in {bundle_dir}", file=sys.stderr)
        sys.exit(1)
    
    # Load info
    with open(info_path, "r") as f:
        info = json.load(f)
    
    print(f"[HF Push] Bundle: {bundle_dir}")
    print(f"[HF Push] Repo: {repo}")
    print(f"[HF Push] Rows: {info['total_rows']}")
    print(f"[HF Push] Schema: {info['schema_version']} (hash={info['schema_hash']})")
    
    # Initialize API
    api = HfApi(token=token)
    
    # Create repo if needed
    try:
        create_repo(repo, repo_type="dataset", private=private, exist_ok=True, token=token)
        print(f"[HF Push] Repo exists/created: {repo}")
    except Exception as e:
        print(f"ERROR: Failed to create repo: {e}", file=sys.stderr)
        sys.exit(1)
    
    # Upload files
    try:
        # Upload main dataset
        dataset_result = api.upload_file(
            path_or_fileobj=str(dataset_path),
            path_in_repo="dataset.jsonl",
            repo_id=repo,
            repo_type="dataset",
            commit_message=commit_message,
            token=token,
        )
        print(f"[HF Push] Uploaded dataset.jsonl")
        
        # Upload info
        info_result = api.upload_file(
            path_or_fileobj=str(info_path),
            path_in_repo="dataset_info.json",
            repo_id=repo,
            repo_type="dataset",
            commit_message=commit_message,
            token=token,
        )
        print(f"[HF Push] Uploaded dataset_info.json")
        
        # Upload splits if present
        splits_dir = bundle_path / "splits"
        if splits_dir.exists():
            for split_file in splits_dir.glob("*.jsonl"):
                split_result = api.upload_file(
                    path_or_fileobj=str(split_file),
                    path_in_repo=f"splits/{split_file.name}",
                    repo_id=repo,
                    repo_type="dataset",
                    commit_message=f"{commit_message} (split={split_file.stem})",
                    token=token,
                )
                print(f"[HF Push] Uploaded splits/{split_file.name}")
        
        # Extract revision from result
        # HF API returns a CommitInfo object with commit_url
        revision = dataset_result.split("/")[-1] if dataset_result else "unknown"
        print(f"revision:{revision}")
        
        print("[HF Push] ✓ Push complete")
        
    except Exception as e:
        print(f"ERROR: Upload failed: {e}", file=sys.stderr)
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Push dataset to Hugging Face Hub")
    parser.add_argument("--bundle-dir", required=True, help="Path to bundle directory")
    parser.add_argument("--repo", required=True, help="HF repo (owner/name)")
    parser.add_argument("--commit-message", default="Update signals_v1 dataset", help="Commit message")
    parser.add_argument("--private", action="store_true", help="Make repo private")
    
    args = parser.parse_args()
    
    # Get token from environment
    token = os.environ.get("HF_TOKEN")
    if not token:
        print("ERROR: HF_TOKEN environment variable not set", file=sys.stderr)
        sys.exit(1)
    
    push_dataset(
        bundle_dir=args.bundle_dir,
        repo=args.repo,
        token=token,
        private=args.private,
        commit_message=args.commit_message,
    )


if __name__ == "__main__":
    main()
