# opencode-model-benchmark

Model benchmarking pipeline for OpenCode. Runs HumanEval, MBPP, and SWE-bench evaluations to compare model performance.

## Features

- **Benchmark Runner**: Execute standardized benchmarks against any model
- **Model Comparator**: Side-by-side comparison of model results
- **Hierarchy Placer**: Rank models into performance tiers
- **Document Updater**: Auto-update benchmark results documentation
- **Pyodide Sandbox**: Safe Python execution for code evaluation

## Usage

```javascript
import { ModelBenchmarkRunner, ModelComparator } from 'opencode-model-benchmark';

const runner = new ModelBenchmarkRunner();
const results = await runner.run('claude-sonnet-4-5', ['humaneval', 'mbpp']);

const comparator = new ModelComparator();
const comparison = comparator.compare(resultsA, resultsB);
```

## Components

| Export | Description |
|--------|-------------|
| `ModelBenchmarkRunner` | Runs benchmarks against models |
| `ModelComparator` | Compares results between models |
| `HierarchyPlacer` | Places models into performance tiers |
| `DocumentUpdater` | Updates benchmark documentation |
| `BENCHMARKS` | Available benchmark definitions |
| `HIERARCHY_LEVELS` | Tier level constants |

## Scripts

```bash
bun run benchmark   # Run benchmarks
```

## License

MIT
