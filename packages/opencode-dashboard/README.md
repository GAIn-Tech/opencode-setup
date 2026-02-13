# OpenCode Dashboard

A read-only monitoring interface for OpenCode workflows.

## Features

- **Live Monitoring**: Real-time view of active workflow runs.
- **Workflow Tree**: Visual representation of step execution and nesting.
- **Evidence Viewer**: Inspect audit events, inputs, results, and logs.
- **Multi-Source Support**: Read from SQLite state stores and filesystem logs.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS
- **Data**: better-sqlite3
- **Icons**: Lucide React

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run in development mode:
   ```bash
   npm run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Configuration

The dashboard reads the SQLite database path from environment variables:
- `SQLITE_DB_PATH`: Path to the `sisyphus.db` file (defaults to `.sisyphus/state/sisyphus.db`).
