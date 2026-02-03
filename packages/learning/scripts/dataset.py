import json


def load_examples(jsonl_path):
    examples = []
    with open(jsonl_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            examples.append(json.loads(line))
    return examples


def filter_examples(examples, source=None):
    if not source:
        return examples
    return [ex for ex in examples if ex.get("source") == source]
