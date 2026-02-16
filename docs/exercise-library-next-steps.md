# Exercise Library: Next Steps

Status as of 2026-01-29. Based on the initial Phase 0 analysis run against live APIs.

---

## Review Checklist

### 1. Analysis Report Output

The pipeline ran successfully and produced real data:

- **852 total exercises** (10 from ExerciseDB, 842 from WGER)
- **0 direct cable exercises** in either API — WGER doesn't have "cable" as an equipment type, and ExerciseDB only returned 10 exercises due to an API issue
- **365 exercises (43%)** flagged as cable-adaptable via heuristic rules
- **500 exercises** made it through the final filter

Review the filtered list at `data/exercises/filtered/prioritized-exercises.json` — skim the top entries to sanity-check the ranking.

### 2. ExerciseDB Data Gap

ExerciseDB only returned 10 exercises. Their API at `exercisedb-api.vercel.app` returned a 400 on the paginated request and fell back to a default endpoint. Options:

- Check if ExerciseDB now requires an API key
- Try a different ExerciseDB fork (several exist on GitHub)
- Rely on WGER as the primary structured source and use Deep Research for enrichment

### 3. Equipment Mapping Gaps

WGER's equipment set is limited — no "cable" equipment type exists. Current distribution: `none/bodyweight` (37%), `dumbbell` (25%), `barbell` (13%), `bench` (8%), `pull-up bar` (4%), `sz-bar` (3%), `kettlebell` (3%).

The `sz-bar`, `bench`, `incline bench`, and `pull-up bar` are currently categorized as "other" — consider refining mappings in `scripts/analyze/analyzers/equipment-analyzer.ts`.

### 4. Muscle Group Normalization

WGER uses specific anatomical names (e.g., "Obliquus externus abdominis", "Brachialis", "Serratus anterior") that don't all map cleanly to the simplified muscle groups in the mobile app.

Review `scripts/collect/normalizers/muscle-group-mapper.ts` to verify mappings match expectations.

### 5. Cable Equivalence Heuristics

The rules in `scripts/analyze/analyzers/cable-equivalence.ts` are keyword-based. Some exercises may be incorrectly flagged. Spot-check a few results from the filtered list.

### 6. Public API Design

Review `src/exercises/types.ts` and `src/exercises/catalog.ts` for the public API. Key design: `setCatalog()` for manual loading vs `loadCatalog()` for the generated JSON file.

---

## Recommended Next Steps (in order)

### Step 1: Review and Commit

The git diff shows 4 modified tracked files + 3 new directories (`data/`, `scripts/`, `src/exercises/`). Review the implementation and commit when satisfied.

### Step 2: Use ChatGPT Deep Research

The prompts in `scripts/research/prompts/deep-research-prompts.md` are ready to use. Highest-value prompts:

- **Prompt 3: Equipment Mapping** — Ask Deep Research to classify which of the top 200 exercises can be done with cables and how. This would dramatically improve cable-equivalence data compared to the keyword heuristics.
- **Prompt 1: Exercise Enrichment** — Add descriptions, form cues, and coaching tips in batches of 20-30 exercises.
- **Prompt 2: VBT Data Research** — Find velocity-based training data for compound exercises.

Workflow:
1. Run `npm run exercises:research -- --generate-prompts` to generate batch prompts
2. Submit to ChatGPT Deep Research
3. Save results to `data/exercises/research/deep-research-results.json`
4. Run `npm run exercises:process` to apply

### Step 3: Fix ExerciseDB Collection

Investigate the ExerciseDB API or find an alternative endpoint to get the full 1300+ exercises with GIFs and step-by-step instructions. This would add media and instructions that WGER mostly lacks.

### Step 4: Run the Full Pipeline End-to-End

Once data sources are stable:

```bash
npm run exercises:pipeline
```

This runs: analyze → collect → process → export, producing the final catalog at `src/exercises/data/catalog.json`.

### Step 5: Tune Filter Criteria

Experiment with filter options to get the right exercise count and composition:

```bash
npm run exercises:analyze -- --cable-only        # Only cable-compatible exercises
npm run exercises:analyze -- --max=300            # Cap at 300 exercises
npm run exercises:analyze -- --min-score=25       # Higher popularity threshold
```

---

## Pipeline Commands Reference

```bash
# Full pipeline (analyze → collect → process → export)
npm run exercises:pipeline

# Individual steps
npm run exercises:analyze          # Phase 0: explore APIs, filter by popularity/equipment
npm run exercises:collect          # Phase 1: collect full details for filtered exercises
npm run exercises:process          # Phase 2: deduplicate, enrich, score quality
npm run exercises:export           # Phase 3: export to src/exercises/data/catalog.json

# Deep Research (optional enrichment)
npm run exercises:research -- --generate-prompts   # Generate prompts for ChatGPT
npm run exercises:research -- --process-results    # Validate results
```
