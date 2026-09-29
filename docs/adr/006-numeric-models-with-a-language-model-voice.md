# ADR 006: Numeric Models With a Language Model Voice

## Status
Accepted

## Context
The goal is local forecasts from the station's own history, written by an Ollama model the owner trains. Language models read context and write well, but are unreliable at arithmetic over long series and will state numbers confidently whether or not they are right. The station has data since 2023: a few thousand evenings, a few dozen frost nights.

## Decision
- Small gradient-boosted models (LightGBM) in a Python `ml/` folder make every forecast number. They read the SQLite database read-only and are scored on the most recent 12 months against climatology and persistence.
- Frost chance and the night-low range come from the night-low model's out-of-sample misses rather than a separate yes/no model, because frost nights are too few to train one.
- The language model receives a brief (current readings, model numbers, normals, similar past evenings) and writes the forecast. Its training examples state only numbers from the brief; the real outcome only picks wording where the brief is borderline.
- The system prompt lives in one place (`ml/wxml/brief.py`) and is written into both the training set and the Modelfile.

## Consequences
- Forecast numbers are testable and scored like any other model; the language model can be swapped or retrained without touching them.
- Python sits beside the pnpm workspace rather than inside it. Forecasts will reach the TypeScript side through a new port, keeping the domain free of ML dependencies.
- Draft training answers are templated and need human review before fine-tuning.
