# Build the Car guide catalog

**Objective:** refresh the Car guide data (`src/data/catalog/`): every make, model and year sold in the US since 2000, with sourced labels. Free, no key, no quota.

**Tool:** `tools/build_cars.py` (stages run in order; each reads the previous stage's output)

```
.venv\Scripts\python -I tools/build_cars.py download epa labels merge
```

| Stage | What it does | Output |
| --- | --- | --- |
| `download` | EPA `vehicles.csv.zip` (about 2 MB) into `.tmp/cars/raw/epa/`, with date and SHA-256 in `.tmp/cars/raw/meta.json` | raw file |
| `epa` | Groups EPA's tested versions into make / model / year: body and size class, drive, engines, fuel type, EPA yearly fuel cost range, MPG range | `.tmp/cars/work/epa.json` |
| `labels` | For each row of `tools/cars/labels.csv`, reads the opening of the Wikipedia article and keeps the label only if that text says "luxury"/"premium" or "sports car" (and similar). Cached in `.tmp/cars/raw/wikipedia/` | `.tmp/cars/work/labels.json` |
| `merge` | Writes `src/data/catalog/index.json` and `makes/<make>.json` | committed data |

Then: `npm test` (catalog tests), `npm run build`, look at a few pages, commit.

## When to run

- When EPA adds a model year (the file updates through the year; check `lastModified` in `meta.json`).
- After editing `tools/cars/*.csv`.

## Name rules (the part that needs care)

EPA's `baseModel` sometimes groups separate vehicles, and some years list trims as models.

- `tools/cars/epa_splits.csv`: splits a base model by the full model name (Range Rover → Range Rover / Sport / Velar / Evoque; BMW "M" → M2…M8; Porsche 718 → Cayman / Boxster). First matching row wins.
- `tools/cars/epa_aliases.csv`: renames or merges (Mazda "3" → Mazda3; Porsche "Carrera 4 S Cabriolet" and 30 other 2003–2012 911 trims → 911).
- Matching ignores capitals (EPA spells "Turbo 2 911 GT2" both ways).
- Makes spelled two ways ("MINI"/"Mini") use the most common spelling.

To find new problems after a refresh, list each base model's distinct model words (see the probe in the 2026-11-10 change log in docs/PLAN.md) and look for real vehicle names among the trim words.

## Labels

- `luxury` rows are per make; `sporty` rows per model; `sporty-make` (Ferrari, Lamborghini, McLaren, Lotus, Bugatti) labels the maker's cars but not its SUVs.
- A rejected row prints with the article's opening, so you can see why (Alfa Romeo, Polestar and Lucid aren't called luxury in their openings, so they stay unlabelled).
- Wikipedia rate-limits fast requests (HTTP 429): the stage waits 1 s between new fetches and backs off on 429.

## Known limits

- Heavy-duty pickups and vans (F-250 and up) aren't in EPA data.
- EPA has no horsepower, price or reliability. Owner complaints, recalls and crash ratings come in the next releases (docs/PLAN.md).
