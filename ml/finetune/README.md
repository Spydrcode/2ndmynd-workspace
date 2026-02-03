# Fine-tuning (Behavior + Structure)

This workflow fine-tunes on **Gold + Growth** only, with an immutable holdout set for evaluation.

## Prepare
```
npm run ml:finetune:prepare
```
Outputs:
- `ml/finetune/train.jsonl`
- `ml/finetune/eval_holdout.jsonl`

## Train
```
npm run ml:finetune:train
```
Creates an OpenAI fine-tune job and records the job id in the model registry.

## Status
```
npm run ml:finetune:status -- --job_id <job_id>
```

## Promote
```
npm run ml:finetune:promote -- --job_id <job_id>
```
Runs eval gates and updates the registry (champion or rejected).
