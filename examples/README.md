# Examples

## `run_downloaded_model.py`

Runs inference against a model you downloaded from the dashboard
(`GET /api/models/download/{job_id}`).

```bash
pip install torch transformers

python examples/run_downloaded_model.py 3f1c4e2a-….zip "An absolute triumph of a film."
```

It unpacks the archive to a temporary directory, reads `config.json` to work
out which pipeline task the model was trained for, and runs your text through
it. Pass `--task` to override the inferred task.

## Calling the API directly

```bash
# Queue a model
JOB=$(curl -sS -X POST localhost:8000/api/models/create \
  -H 'Content-Type: application/json' \
  -d '{"name":"demo","prompt":"classify movie reviews as positive or negative"}' \
  | python -c 'import json,sys; print(json.load(sys.stdin)["job_id"])')

# Follow the training log until it closes
curl -N "localhost:8000/api/logs/$JOB"

# Inference once it is complete
curl -sS -X POST "localhost:8000/api/models/$JOB/predict" \
  -H 'Content-Type: application/json' \
  -d '{"text":"An absolute triumph of a film."}'

# Download the checkpoint
curl -sS -o model.zip "localhost:8000/api/models/download/$JOB"
```

## Running a cube

```bash
curl -sS -X POST localhost:8000/api/cubes/run \
  -H 'Content-Type: application/json' \
  -d '{"cube_id":"sentinel","input":{"action":"get_rules"}}'
```

`GET /api/cubes` lists every cube, and each cube's `run()` in
`backend/app/cubes/<id>.py` is the authority on its input shape.
