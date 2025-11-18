# Reasoning Validation Site (DataPipe / OSF)

Static GitHub Pages site to acquire human validation for *reasoning-signature inference*.

## Flow
1. **Welcome** → 2. **Generate ID** → 3. **Experiment (50 examples)** → 4. **Thanks**
- For each example: show text + extracted *claims/inferences/conclusions*.
- Collect: 7-point Likert for overall extraction + 4-class label per conclusion.
- Saves each response directly to **OSF** using **DataPipe**.

## Configure DataPipe (OSF)
1. Create a DataPipe experiment connected to your OSF project (per DataPipe docs).
2. Copy the **Experiment ID**.
3. Open `docs/assets/app.js` and set:
   ```js
   const DATAPIPE_EXPERIMENT_ID = "YOUR_EXPERIMENT_ID";
   ```

## GitHub Pages
- This repo serves from `docs/`.
- GitHub Actions workflow included (`.github/workflows/pages.yml`).

## Examples
- Put your 50 items in `docs/assets/examples.json` following the included schema.

## Data saved
Each submission (per example) is saved to OSF as:
```
{participant_id}/{timestamp_ms}_{example_id}.json
```

Payload shape:
```json
{
  "participant_id": "uuidv4",
  "example_id": "ex001",
  "likert_1to7": 5,
  "conclusion_labels": [{"conclusion_id":"c1","label":"Strongly Supported"}],
  "comment": "",
  "ts_client": "ISO-8601",
  "user_agent": "...",
  "version": "v1"
}
```

## Local Dev
Open `docs/index.html` with a local web server.
