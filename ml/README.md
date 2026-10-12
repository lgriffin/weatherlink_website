# ml/: your station's own forecast models

This folder turns the station archive into forecasts. It reads the SQLite
database **read-only** and never changes it.

There are two layers:

1. **Numeric models** (LightGBM) make every number: tonight's low and frost
   chance, tomorrow's high, rain chances for the next 6 and 24 hours, and the
   temperature this time tomorrow.
2. **Your Ollama model** is the forecaster's voice. It reads those numbers,
   the usual for the date and similar past evenings, then writes a forecast
   you'd want to read. It never makes up numbers.

## Before you start

The models learn from the raw archive, so harvest it first (from the repo root):

```bash
pnpm db:migrate
pnpm archive:harvest --force   # your full WeatherLink history
pnpm archive:rebuild
```

Then set up Python once (3.10 or newer):

```bash
cd ml
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
```

Every command below runs from `ml/`. It finds the database via
`DATABASE_PATH` in the repo's `.env` (or pass `--db path/to/weather.db`).
Output goes to `ml/out/`, which git ignores.

## 1. Train and score the models

```bash
python -m wxml train
```

Each model is trained on older data and scored on the **last 12 months**,
which it never saw. It is compared with two simple forecasts that are hard to
beat:

- **Climatology**: "a normal day for the date", from your own earlier years.
- **Persistence**: "the same as now" (last night's low, rain if it's raining now).

You'll see lines like:

```
night_min: MAE 1.31, climatology 1.65 (skill 0.208), persistence 1.66 (skill 0.21)
frost_tonight (Oct-Apr only): Brier 0.034, climatology 0.034 (skill 0.007), ...
night_min range: 8% below p10, 13% above p90 (aim 10% each)
rain_next_6h: Brier 0.109, climatology 0.235 (skill 0.535), persistence 0.190 (skill 0.424)
```

How to read them:

- **MAE** is the average miss (°C). **Brier** scores a chance (0 is perfect).
  Lower is better for both.
- **Skill** is how much better than the baseline: 0.2 means 20% smaller
  errors. Above 0 means the model is worth using; below 0 means the simple
  forecast wins.
- **Range**: about 10% of nights should fall below the cold end and 10% above
  the mild end. If not, the range is too narrow or too wide.
- `out/metrics.json` has the details: reliability tables ("when it said 70%,
  did it happen 70% of the time?") and which inputs mattered most.

The roadmap's first milestone is **frost-tonight beating climatology** in the
frost season. With only two or three winters, a frost chance that just matches
climatology is normal. It improves each winter you add.

Frost is rare, so there's no separate yes/no frost model. The night-low model's
past misses turn its forecast into a range and a frost chance. If it says 1.5 °C
and has been 1.5 °C or more too warm on one night in five, the chance of frost
is about 20%.

Outage hours are left out. A night or day counts only when at least 90% of its
hours were recorded.

## 2. Tonight's forecast numbers

```bash
python -m wxml predict          # the brief your Ollama model reads
python -m wxml predict --json   # everything, as JSON
```

## 3. Your own analysis

```bash
python -m wxml export
```

This writes `out/tables/hourly.csv`, with one row per hour and outage hours
flagged, and `out/tables/evenings.csv`, with one row per day at 18:00, the
inputs and what happened next. Open them in a notebook, Excel or DuckDB.

## 4. Your Ollama forecaster

**Step 1: try a stock model first.** This is the baseline your fine-tune has
to beat:

```bash
ollama pull llama3.2:3b
python -m wxml predict --ask llama3.2:3b
```

**Step 2: build the training set.**

```bash
python -m wxml llm-dataset
# optional: polish every draft with a bigger local model (slow)
python -m wxml llm-dataset --rewrite-with qwen2.5:14b
```

This writes `out/llm/train.jsonl` and `valid.jsonl`, with one example per past
evening, plus `review.csv` for reading by hand. Each example pairs the brief
the model would have had at 18:00 with a draft forecast.

- The numbers in each brief come from models that never saw that stretch of
  time, so they're as imperfect as they will be in real use.
- Every number in a draft comes from its brief, so the model learns never to
  invent numbers.
- What actually happened only picks the wording when the brief is borderline.
  For example, a 40% rain chance reads "showers are possible" on a day it
  rained, and "probably staying dry" on a day it didn't.
- The drafts are templates, so read a sample of `review.csv` and edit or
  rewrite them. The model will sound like whatever you train it on.

**Step 3: fine-tune with LoRA.** This needs your own machine; it wasn't run here.

On a Mac (Apple Silicon), with [MLX-LM](https://github.com/ml-explore/mlx-lm):

```bash
pip install mlx-lm
mlx_lm.lora --model meta-llama/Llama-3.2-3B-Instruct --train \
  --data out/llm --iters 600 --batch-size 4 --adapter-path out/adapters
mlx_lm.fuse --model meta-llama/Llama-3.2-3B-Instruct \
  --adapter-path out/adapters --save-path out/fused
```

On an NVIDIA GPU, [Unsloth](https://github.com/unslothai/unsloth) reads the
same JSONL. Save the result as GGUF with `model.save_pretrained_gguf(...)`.

**Step 4: load it into Ollama.**

```bash
python -m wxml modelfile --base ./out/fused         # MLX: fused model folder
python -m wxml modelfile --base ./out/model.gguf    # Unsloth: GGUF file
ollama create station-forecaster -f out/Modelfile
python -m wxml predict --ask station-forecaster
```

If you keep the adapter separate instead, use `--base llama3.2:3b --adapter
./out/adapters`. The adapter must come from exactly that base model.
`ollama/Modelfile.example` shows the result. The system prompt comes from
`wxml/brief.py`, so the Modelfile always matches training.

**Step 5: score it.** On the validation evenings, read the stock and
fine-tuned forecasts side by side without knowing which is which. Check that
it states the right numbers, mentions frost and rain when it should, and says
so when the models and past evenings disagree.

Retrain every few months as the archive grows: rerun `train` and
`llm-dataset`, then fine-tune again.

## 5. What the big weather models say

Your station knows your spot; the big weather models know what is coming in
from the Atlantic. Open-Meteo serves both kinds of forecast for free (credit
"Weather data by Open-Meteo.com"), so no account or key is needed.

```bash
python -m wxml guidance                 # the next 48 hours from four models
python -m wxml guidance-check --days 90 # how each did here, a day ahead
```

The models are ECMWF (the European centre), `ukmo_seamless` (the Met Office,
whose 2 km model covers all of Ireland), `icon_seamless` (the German service)
and KNMI's Harmonie-AROME. Pick others with `--models`, using any Open-Meteo
model id. Not every model gives every value (KNMI's Harmonie has no
sea-level pressure); those stay empty rather than zero. The station's position comes from the database and is sent only to
Open-Meteo, rounded to about 1 km.

`guidance-check` compares what each model said a day ahead with what your
station recorded, hour by hour, over recent days:

- **bias** is the model minus your station. A frost hollow shows up as a warm
  bias on clear nights, and an anemometer below 10 m as a windy one.
- **skill** above 0 means the model beat "the same as this time yesterday".

Those biases are what the next step corrects.

## 6. Teaching the station's models what the big models said (MOS)

```bash
python -m wxml guidance-sync   # their day-ahead forecasts, as issued, since January 2024
python -m wxml train           # now trains every task twice: station only, and with guidance
python -m wxml scores          # the scores as a table
```

`guidance-sync` saves each month to `out/guidance/open-meteo/lead1/YYYY-MM.csv`
(one row per model and hour), and fetches again only what can still change.
Pass `--guidance-dir` to keep them elsewhere, such as the history folder.

`train` then gives each task the models' view of the same windows: tonight's
low, tomorrow's high, the next 24 and 6 hours of rain, cloud and wind tonight,
the temperature this time tomorrow. Each input is the average of the models,
with how far apart they are, so the station's models learn "ECMWF says 3 °C,
which here means 1 °C" and how much to trust it. A `+guidance` model is scored
on the same held-out days against:

- **station only**: the model without guidance. It needs to beat this to be used.
- **raw guidance**: the models' own number, uncorrected ("did our correction beat ECMWF on its own?").
- climatology and persistence, as before.

`predict` uses a `+guidance` model only where it beat the station-only one and
today's guidance covers the window; otherwise it falls back on its own. It
fetches the latest runs, or reads the saved ones for a past `--date`
(`--guidance none` turns it off).

Training uses the forecasts as they were issued about a day ahead, never a
later run of the same hour. Live forecasts get the latest run, which is
fresher, so they should do at least as well as the scores say. Open-Meteo
keeps past runs from January 2024, so the guided models learn from less
history than the station has.

In GitHub Actions, the `ml-train` workflow does all of this on the real archive
every Monday, on demand, and for any change to `ml/wxml`, and shows the table
in the run summary.

## 7. Issuing forecasts and keeping score (the ledger)

```bash
python -m wxml issue --publish site --ask station-forecaster   # make, keep and send tonight's forecast
python -m wxml verify                                          # score past forecasts now the truth is in
```

`issue` runs the saved models (with today's guidance), keeps the whole
forecast in the ledger (`out/ledger/YYYY/YYYY-MM-DD.json`: the numbers, which
models made them, what each weather model said, the brief and the words) and
publishes it. It issues each evening once; `--replace` overrides that.

- `--publish site` posts to the site's ingest API with `SITE_URL` and
  `INGEST_TOKEN`; `--publish DIR` writes `forecast.json` there instead.
  `--with-scores` sends the last training scores too.
- `--ask MODEL` has a local Ollama model write the words. If Ollama is not
  running, the numbers still go out.

`verify` adds what actually happened to every forecast whose night and next day
are known, and writes `scores.json` in the ledger: the issued forecasts' misses
next to each weather model's on the same evenings. Unlike the training scores,
these come from forecasts exactly as they went out.

In GitHub Actions, the hourly site run does all of this once a day, on its
first run after 18:00: it saves new guidance, retrains, issues, verifies and
loads the forecast into the site. Guidance and the ledger live in the
`weather-history` branch (`guidance/`, `forecasts/`). Run the "Publish site"
workflow by hand with "Make the forecast now" ticked to try it before 18:00.
On your own machine, `scripts/spark-evening.sh` does the same with your Ollama
model.

## 8. Neighbours and a second opinion from Met Éireann

```bash
python -m wxml neighbours-sync   # Met Éireann station and Atlantic buoy readings since 2023
```

The weather here mostly arrives from the west, so the guided models also see
what the Atlantic is doing at 18:00: pressure changes over 3 and 12 hours at
the M3, M4 and M6 buoys, Valentia and Belmullet, the pressure difference
between there and here, and between the south and north coasts (how windy
it will be), wind and temperature out west, and rain in the 3 hours before
at the Met Éireann stations. Levels (pressure, wind, temperature) come from
the land stations, and only when all of a group's stations report, since
each site has its own usual level and a buoy dropping out would otherwise
look like a change in the weather. The sites are grouped rather than used one by one,
so a few years of evenings is enough to learn from them.

- Buoys: the Marine Institute's ERDDAP server (`IWBNetwork`), CC BY 4.0.
- Stations: Met Éireann's climate-data hourly files for history (updated about
  monthly) and their observations API for today. Copyright Met Éireann, CC BY 4.0.

Readings go to `out/neighbours/<source>/YYYY-MM.csv` (`--neighbours-dir` for
elsewhere); the site run keeps them in the `weather-history` branch.

`issue` also asks Met Éireann's own point forecast what it expects tonight
and tomorrow, and keeps it next to the other models in the forecast record
(`guidance`). It keeps no archive, so every forecast saves the guidance it used,
as issued, under `guidance/<source>/lead0/`, and `verify` scores Met Éireann
alongside the rest. Their licence asks that a site showing their forecasts
also shows their current warnings, so the site shows their numbers only on
the Forecast page, which carries the warnings.

## Tests

```bash
python -m pytest
```

The tests build a made-up station, where falling pressure brings rain and
clear, calm nights get cold, and check the whole pipeline on it. That covers
no look-ahead in the inputs, outage handling, local-time nights across summer
time, models beating both baselines, and drafts stating only numbers from the
brief. The scores on your real data will be different.

## What's in here

| File | What it does |
| --- | --- |
| `wxml/data.py` | Reads archive observations (ISS and barometer) into an hourly table with outages flagged |
| `wxml/features.py` | Inputs (changes, rolling totals, cloud proxy, time as cycles) and targets |
| `wxml/baselines.py` | Climatology, persistence and the scores |
| `wxml/models.py` | Training, held-out scoring, frost chance and range, saving |
| `wxml/analogs.py` | Similar past evenings |
| `wxml/brief.py` | The brief the language model reads, the draft answers, the system prompt |
| `wxml/llm_dataset.py` | The fine-tuning set |
| `wxml/predict.py` | Runs saved models on the latest data |
| `wxml/ollama.py` | A tiny client for your local Ollama |
| `wxml/forecasting/` | The core (ADR 007): guidance types, the ports, the guidance use cases, and `mos.py` (guidance as model inputs). No I/O |
| `wxml/adapters/` | One module per port adapter: SQLite store, Open-Meteo guidance, guidance files, ledger files, publishers (site API or folder), neighbours (buoys, Met Éireann) and their files, Met Éireann forecast, Ollama narrator |
| `wxml/report.py` | The training scores as a Markdown table |
| `wxml/forecasting/ledger.py` | Issuing a forecast, verifying it, and the ledger's scores |
| `wxml/forecasting/neighbours.py` | Neighbour sites and their grouped inputs |
