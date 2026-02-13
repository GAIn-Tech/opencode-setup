const fs = require('fs');
const { WorkflowStore, WorkflowExecutor } = require('../../src/index.js');

function appendMarker(markerPath, value) {
  fs.appendFileSync(markerPath, `${value}\n`, 'utf8');
}

async function main() {
  const [, , dbPath, runId, markerPath] = process.argv;
  if (!dbPath || !runId || !markerPath) {
    process.exit(2);
  }

  const store = new WorkflowStore(dbPath);
  const executor = new WorkflowExecutor(store);

  const workflow = {
    name: 'durability-crash-test',
    steps: [
      { id: 'step1', type: 'write' },
      { id: 'step2', type: 'write' },
      { id: 'step3', type: 'write' }
    ]
  };

  executor.registerHandler('write', async (step) => {
    appendMarker(markerPath, step.id);
    if (step.id === 'step2') {
      process.exit(42);
    }
    return { [step.id]: true };
  });

  await executor.execute(workflow, {}, runId);
}

main().catch(() => {
  process.exit(1);
});
