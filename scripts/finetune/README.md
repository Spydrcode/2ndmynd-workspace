Finetune recovery runbook

Commands

 - Download the uploaded file:
```
node scripts/finetune/download_file.mjs <file-id>
```

 - Validate the downloaded file strictly:
```
node scripts/finetune/validate_train_jsonl.mjs
```

 - Attempt automated repairs:
```
node scripts/finetune/repair_train_jsonl.mjs
```

 - Create a fine-tune job from the best clean file (repaired preferred):
```
node scripts/finetune/create_job_v2.mjs
```

 - Tail the new job until it completes or loops:
```
node scripts/finetune/tail_job.mjs <NEW_JOB_ID>
```

Why training can validate but still crash

- The file may be valid JSONL, but the assistant message content can include non-JSON artifacts (markdown fences, stray links, trailing HTML) that only surface when the training loop attempts to parse or use them.
- Invisible control characters (non-printables) inside assistant outputs can break binary parsers used during training.
- The repair script conservatively extracts the first JSON object and ensures required keys exist.

Notes

- Avoid markdown fences, inline links, and any non-JSON prefix/suffix in `assistant.content`.
- If automated repair drops many lines, inspect `tmp/train_v2_quarantined.jsonl` and edit problematic examples manually.
