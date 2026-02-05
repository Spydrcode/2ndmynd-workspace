#!/usr/bin/env python3
"""
Local Embeddings Generator

Generates 384-d embeddings using sentence-transformers.
Model: all-MiniLM-L6-v2

Usage:
    python local_embed.py --text="example text" --output=embedding.json
    python local_embed.py --batch_file=texts.jsonl --output=embeddings.jsonl

Input (batch mode):
    {"id": "001", "text": "example"}
    {"id": "002", "text": "another example"}

Output:
    {"id": "001", "embedding": [0.123, -0.456, ...]}
"""

import argparse
import json
import sys
from typing import List, Dict, Any

try:
    from sentence_transformers import SentenceTransformer
except ImportError:
    print("ERROR: sentence-transformers not installed. Run: pip install sentence-transformers", file=sys.stderr)
    sys.exit(1)

# Default model
DEFAULT_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
EXPECTED_DIM = 384


def load_model(model_name: str) -> SentenceTransformer:
    """Load sentence-transformers model."""
    print(f"[Local Embed] Loading model: {model_name}", file=sys.stderr)
    model = SentenceTransformer(model_name)
    print(f"[Local Embed] Model loaded (dim={EXPECTED_DIM})", file=sys.stderr)
    return model


def embed_single(text: str, model: SentenceTransformer) -> List[float]:
    """Embed a single text."""
    embedding = model.encode(text, convert_to_tensor=False, show_progress_bar=False)
    return embedding.tolist()


def embed_batch(items: List[Dict[str, Any]], model: SentenceTransformer) -> List[Dict[str, Any]]:
    """Embed a batch of texts."""
    texts = [item["text"] for item in items]
    embeddings = model.encode(texts, convert_to_tensor=False, show_progress_bar=True, batch_size=32)
    
    results = []
    for idx, item in enumerate(items):
        results.append({
            "id": item["id"],
            "embedding": embeddings[idx].tolist(),
        })
    
    return results


def main():
    parser = argparse.ArgumentParser(description="Generate local embeddings")
    parser.add_argument("--text", help="Single text to embed")
    parser.add_argument("--batch_file", help="JSONL file with batch items")
    parser.add_argument("--output", help="Output file (JSON or JSONL)")
    parser.add_argument("--model", default=DEFAULT_MODEL, help="Model name")
    
    args = parser.parse_args()
    
    if not args.text and not args.batch_file:
        print("ERROR: Must provide either --text or --batch_file", file=sys.stderr)
        sys.exit(1)
    
    # Load model
    model = load_model(args.model)
    
    if args.text:
        # Single text mode
        embedding = embed_single(args.text, model)
        result = {"embedding": embedding, "dim": len(embedding)}
        
        if args.output:
            with open(args.output, "w") as f:
                json.dump(result, f)
        else:
            print(json.dumps(result))
    
    elif args.batch_file:
        # Batch mode
        items = []
        with open(args.batch_file, "r") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                items.append(json.loads(line))
        
        print(f"[Local Embed] Processing {len(items)} items...", file=sys.stderr)
        
        results = embed_batch(items, model)
        
        if args.output:
            with open(args.output, "w") as f:
                for result in results:
                    f.write(json.dumps(result) + "\n")
        else:
            for result in results:
                print(json.dumps(result))
        
        print(f"[Local Embed] ✓ Generated {len(results)} embeddings", file=sys.stderr)


if __name__ == "__main__":
    main()
