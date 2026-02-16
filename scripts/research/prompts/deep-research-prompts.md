# ChatGPT Deep Research Prompts

These prompts are designed for use with ChatGPT Deep Research to enrich our exercise library data.

---

## Prompt 1: Exercise Enrichment (Batch)

Use this prompt to enrich a batch of exercises with descriptions, form cues, and tips.

```
I'm building an exercise database for a cable machine fitness app. For each exercise listed below, please provide:

1. **Description** (2-3 sentences): What the exercise is, what muscle groups it targets, and why it's effective.
2. **Instructions** (3-6 numbered steps): Step-by-step execution instructions.
3. **Form Cues** (3-5 bullet points): Key cues a coach would give for proper form.
4. **Common Mistakes** (2-4 bullet points): Most common form errors and how to avoid them.
5. **Tips** (1-3 bullet points): Pro tips for getting more out of the exercise.

Focus on:
- Cable machine and cable-equivalent versions of exercises where applicable
- Practical, actionable coaching cues (not generic advice)
- Common mistakes that could lead to injury or reduced effectiveness

Format the response as a JSON array where each exercise has:
{
  "exerciseId": "<slug_id>",
  "description": "...",
  "instructions": ["Step 1...", "Step 2..."],
  "formCues": ["Cue 1...", "Cue 2..."],
  "commonMistakes": ["Mistake 1...", "Mistake 2..."],
  "tips": ["Tip 1...", "Tip 2..."]
}

Exercises to enrich:
[PASTE EXERCISE LIST HERE - format: id, name, equipment, muscle groups]
```

---

## Prompt 2: VBT Data Research

Use this prompt to find velocity-based training data for specific exercises.

```
I'm building a velocity-based training (VBT) system for cable machines. For each exercise below, please research and provide:

1. **Minimum Velocity Threshold (MVT)**: The velocity at which a 1RM attempt would be performed (m/s)
2. **Typical Velocity Ranges**: Expected mean concentric velocities at various intensities (%1RM)
3. **Load-Velocity Relationship**: If published research exists, provide data points mapping %1RM to mean concentric velocity

Cite sources where possible. Common VBT velocity ranges for reference:
- Squat: 0.30-0.35 m/s MVT
- Bench Press: 0.15-0.20 m/s MVT  
- Deadlift: 0.15-0.20 m/s MVT
- Overhead Press: 0.20-0.25 m/s MVT

Focus on:
- Peer-reviewed research when available
- Practical values used by VBT coaches and practitioners
- Cable-specific data if any exists

Format as JSON:
{
  "exerciseId": "<slug_id>",
  "mvt": <number>,
  "loadVelocityProfile": [
    { "percentRM": 40, "velocity": 1.2 },
    { "percentRM": 60, "velocity": 0.8 },
    ...
  ],
  "sources": ["Author et al., Year, Journal"],
  "notes": "Any caveats or limitations"
}

Exercises:
[PASTE EXERCISE LIST HERE]
```

---

## Prompt 3: Equipment Mapping

Use this prompt to identify which exercises can be done with cables and how to set them up.

```
I have a cable machine with adjustable pulley height (floor to overhead) and various attachments (straight bar, EZ bar, rope, D-handle, ankle strap, V-bar).

For each exercise below, determine:
1. Can it be effectively performed with a cable machine? (yes/no/partial)
2. If yes, what is the optimal cable setup?
   - Pulley position: high / mid / low / floor
   - Recommended attachment
   - Any modifications needed compared to the original version
3. How does the cable version compare to the original? (pros/cons)

Format as JSON:
{
  "exerciseId": "<slug_id>",
  "cableCompatible": true/false,
  "cableSetup": {
    "pulleyPosition": "high|mid|low|floor",
    "attachment": "...",
    "modifications": "...",
    "prosVsOriginal": ["..."],
    "consVsOriginal": ["..."]
  }
}

Exercises:
[PASTE EXERCISE LIST HERE]
```

---

## Prompt 4: Exercise Discovery

Use this prompt to discover exercises we might be missing.

```
I'm building a comprehensive cable machine exercise library. Currently we have exercises covering these muscle groups and movement patterns:

[PASTE CURRENT COVERAGE SUMMARY]

Please suggest:
1. **Missing exercises**: Cable exercises that target under-represented muscle groups
2. **Unique cable exercises**: Exercises that are specifically designed for cable machines (not adaptations of other exercises)
3. **Advanced variations**: Cable variations of common exercises that provide unique benefits

For each suggestion, provide:
- Name
- Primary muscle groups
- Equipment setup (pulley position, attachment)
- Brief description of why this exercise is valuable
- Movement pattern category (push/pull/hinge/squat/lunge/rotation/isolation)
```

---

## Usage Instructions

### How to Use These Prompts

1. **Run the analysis pipeline** first: `npx tsx scripts/analyze/index.ts`
2. **Open the filtered exercise list**: `data/exercises/filtered/prioritized-exercises.json`
3. **Copy exercise data** into the prompt template
4. **Submit to ChatGPT Deep Research** and wait for results
5. **Save results** to `data/exercises/research/deep-research-results.json`
6. **Run the processing pipeline**: `npx tsx scripts/process/index.ts`

### Batch Sizes

- **Exercise Enrichment**: 20-30 exercises per prompt for best quality
- **VBT Data**: 10-15 exercises per prompt (requires more research per exercise)
- **Equipment Mapping**: 30-50 exercises per prompt
- **Exercise Discovery**: One prompt, with full coverage summary

### Saving Results

Save Deep Research results as JSON in `data/exercises/research/`:

```
data/exercises/research/
├── deep-research-results.json   # Combined enrichment data (used by processing pipeline)
├── vbt-research.json           # VBT-specific data
├── cable-mapping.json          # Cable compatibility data
└── exercise-discovery.json     # New exercise suggestions
```

The processing pipeline (`scripts/process/index.ts`) automatically picks up `deep-research-results.json`.
