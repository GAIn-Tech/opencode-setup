# Hercules CLI Implementation Plan - Option A

## Executive Summary

**Objective**: Build a complete, production-ready CLI for Hercules with all 14 planned commands.  
**Effort**: 2-3 weeks  
**Priority**: P0 (blocks production readiness)  
**Status**: Plan Ready for Execution  

---

## Current State

### ✅ What's Working (Backend)
- All services (VMG, Ledger, Cost Governor) implemented
- TUI components (Inspector, ReplayTUI) functional
- Rich library available
- Typer dependency present

### ❌ What's Broken (CLI)
- No `__main__.py` entrypoint
- No Typer app or command registration
- 0 of 14 commands implemented
- No config loading from CLI
- No kernel bootstrap from CLI

---

## Implementation Plan

### Phase 1: CLI Infrastructure (Week 1)

#### Task 1.1: Create CLI Entrypoint
**File**: `hercules/hercules/__main__.py`

```python
#!/usr/bin/env python3
"""Hercules CLI entrypoint."""

import asyncio
import sys
from pathlib import Path

import typer
from rich.console import Console
from rich.panel import Panel

from hercules import __version__
from hercules.cli.main import create_app


def main() -> None:
    """Entry point for hercules CLI."""
    app = create_app()
    app()


if __name__ == "__main__":
    main()
```

**Acceptance Criteria**:
- [ ] `python -m hercules --version` works
- [ ] `python -m hercules --help` works
- [ ] Entrypoint properly configured in pyproject.toml

---

#### Task 1.2: Create Main Typer App
**File**: `hercules/hercules/cli/main.py`

```python
"""Main CLI application with Typer."""

import typer
from rich.console import Console

from hercules.cli.commands import run, inspect, replay, memory, cost
from hercules.cli.commands import sessions, skills, agent, mcp, chat, gateway

console = Console()


def create_app() -> typer.Typer:
    """Create and configure the Typer CLI app."""
    app = typer.Typer(
        name="hercules",
        help="The standalone AI coding system",
        add_completion=False,
    )
    
    # Core commands
    app.add_typer(run.app, name="run", help="Execute tasks")
    app.add_typer(inspect.app, name="inspect", help="Inspect trajectories")
    app.add_typer(replay.app, name="replay", help="Replay executions")
    
    # Domain commands
    app.add_typer(memory.app, name="memory", help="Memory operations")
    app.add_typer(cost.app, name="cost", help="Cost governance")
    app.add_typer(sessions.app, name="sessions", help="Session management")
    app.add_typer(skills.app, name="skills", help="Skill management")
    app.add_typer(agent.app, name="agent", help="Agent management")
    app.add_typer(mcp.app, name="mcp", help="MCP operations")
    app.add_typer(gateway.app, name="gateway", help="Gateway management")
    
    # Standalone commands
    app.command()(chat.chat_cmd)
    
    return app
```

**Acceptance Criteria**:
- [ ] All 14 commands registered
- [ ] Help text displays for each command
- [ ] Command hierarchy matches plan

---

#### Task 1.3: Create Command Infrastructure
**File**: `hercules/hercules/cli/commands/__init__.py`

```python
"""CLI commands package."""

# Shared imports and utilities
from hercules.cli.utils import get_kernel, load_config, get_console
from hercules.cli.exceptions import CLIError, ConfigError
```

**File**: `hercules/hercules/cli/utils.py`

```python
"""CLI utilities."""

import asyncio
from pathlib import Path
from typing import Optional

from rich.console import Console

from hercules.core.config import load_config as _load_config
from hercules.core.kernel import HerculesKernel


def get_console() -> Console:
    """Get Rich console instance."""
    return Console()


def load_config(config_path: Optional[Path] = None) -> dict:
    """Load configuration."""
    if config_path:
        return _load_config(config_path)
    # Load from default locations
    return _load_config()


def get_kernel(config: dict, strict: bool = True) -> HerculesKernel:
    """Get or create kernel instance."""
    return HerculesKernel(config, strict=strict)
```

**Acceptance Criteria**:
- [ ] Shared utilities available to all commands
- [ ] Config loading integrated
- [ ] Kernel bootstrap integrated

---

### Phase 2: Core Commands (Week 1-2)

#### Task 2.1: Implement `hercules run`
**File**: `hercules/hercules/cli/commands/run.py`

```python
"""Run command for executing tasks."""

import typer
from typing import Optional

from hercules.cli.utils import get_kernel, load_config, get_console
from hercules.core.types import Task, TaskContext

app = typer.Typer()


@app.command()
def run(
    task: str = typer.Argument(..., help="Task description"),
    model: Optional[str] = typer.Option(None, "--model", "-m", help="Model to use"),
    budget: Optional[float] = typer.Option(None, "--budget", "-b", help="Budget limit"),
    save_trace: bool = typer.Option(True, "--save-trace/--no-save-trace", help="Save execution trace"),
) -> None:
    """Execute a task with Hercules."""
    console = get_console()
    
    console.print(f"[bold blue]Hercules[/bold blue] - Executing task")
    console.print(f"Task: {task}")
    if model:
        console.print(f"Model: {model}")
    if budget:
        console.print(f"Budget: ${budget}")
    
    # Load config and bootstrap kernel
    config = load_config()
    kernel = get_kernel(config)
    
    # Execute task
    # TODO: Implement actual execution
    console.print("[yellow]Task execution not yet implemented[/yellow]")


@app.command()
def batch(
    config_file: str = typer.Argument(..., help="Batch config file"),
) -> None:
    """Execute batch of tasks from config file."""
    console = get_console()
    console.print(f"Running batch from: {config_file}")
```

**Acceptance Criteria**:
- [ ] `hercules run "fix auth bug"` works
- [ ] Options for --model, --budget work
- [ ] Task executes through kernel

---

#### Task 2.2: Implement `hercules inspect`
**File**: `hercules/hercules/cli/commands/inspect.py`

```python
"""Inspect command for viewing trajectories."""

import typer
from pathlib import Path

from hercules.cli.inspect import Inspector
from hercules.cli.utils import get_console

app = typer.Typer()


@app.command()
def inspect(
    trace_id: str = typer.Argument(..., help="Trace ID to inspect"),
) -> None:
    """Inspect a trajectory interactively."""
    import asyncio
    
    console = get_console()
    inspector = Inspector(console)
    
    asyncio.run(inspector.inspect(trace_id))
```

**Acceptance Criteria**:
- [ ] `hercules inspect trace-123` works
- [ ] Launches interactive TUI
- [ ] Navigation works (n/p/g/q/h)

---

#### Task 2.3: Implement `hercules replay`
**File**: `hercules/hercules/cli/commands/replay.py`

```python
"""Replay command for re-executing traces."""

import typer
from typing import Optional

from hercules.cli.replay_tui import ReplayTUI
from hercules.cli.utils import get_console, get_kernel, load_config
from hercules.ledger.replay import ReplayEngine

app = typer.Typer()


@app.command()
def replay(
    trace_id: str = typer.Argument(..., help="Trace ID to replay"),
    mode: str = typer.Option("replay", "--mode", help="Replay mode (replay/dry-run)"),
    speed: Optional[float] = typer.Option(None, "--speed", help="Replay speed"),
) -> None:
    """Replay a trace."""
    import asyncio
    
    console = get_console()
    config = load_config()
    kernel = get_kernel(config)
    
    # Get replay engine from kernel
    engine = ReplayEngine(kernel.get_service("ledger"), kernel.get_service("tools"))
    
    tui = ReplayTUI(console, engine)
    asyncio.run(tui.replay(trace_id, mode))


@app.command()
def diff(
    trace_a: str = typer.Argument(..., help="First trace ID"),
    trace_b: str = typer.Argument(..., help="Second trace ID"),
) -> None:
    """Compare two traces."""
    console = get_console()
    console.print(f"Comparing {trace_a} vs {trace_b}")
    # TODO: Implement diff logic
```

**Acceptance Criteria**:
- [ ] `hercules replay trace-123` works
- [ ] Mode and speed options work
- [ ] Diff command works

---

#### Task 2.4: Implement `hercules chat`
**File**: `hercules/hercules/cli/commands/chat.py`

```python
"""Chat command for interactive sessions."""

import typer
from typing import Optional

from hercules.cli.utils import get_console, get_kernel, load_config

app = typer.Typer()


def chat_cmd(
    model: Optional[str] = typer.Option(None, "--model", "-m", help="Model to use"),
    budget: Optional[float] = typer.Option(None, "--budget", "-b", help="Budget limit"),
) -> None:
    """Start interactive chat session."""
    import asyncio
    
    console = get_console()
    config = load_config()
    kernel = get_kernel(config)
    
    console.print("[bold blue]Hercules Chat[/bold blue]")
    console.print(f"Model: {model or config['agent']['model']['name']}")
    console.print(f"Budget: ${budget or config['limits']['max_cost_usd']}")
    console.print()
    console.print("Type 'exit' or 'quit' to exit")
    console.print()
    
    asyncio.run(_chat_loop(kernel))


async def _chat_loop(kernel) -> None:
    """Chat interaction loop."""
    console = get_console()
    
    while True:
        query = console.input("[bold green]hercules>[/bold green] ")
        if query.lower() in ["exit", "quit"]:
            break
        
        # Process query through kernel
        # TODO: Implement actual chat processing
        console.print(f"Processing: {query}")


@app.command()
def query(
    q: str = typer.Argument(..., help="Query to execute"),
) -> None:
    """Execute one-shot query."""
    console = get_console()
    console.print(f"Query: {q}")
    # TODO: Execute and return result
```

**Acceptance Criteria**:
- [ ] `hercules chat` starts interactive session
- [ ] `hercules chat --model claude-sonnet` works
- [ ] `hercules -q "task"` one-shot works

---

### Phase 3: Domain Commands (Week 2)

#### Task 3.1: Implement `hercules memory`
**File**: `hercules/hercules/cli/commands/memory.py`

```python
"""Memory command for VMG operations."""

import typer
from typing import Optional

from hercules.cli.utils import get_console, get_kernel, load_config

app = typer.Typer()


@app.command()
def query(
    pattern: str = typer.Argument(..., help="Search pattern"),
    limit: int = typer.Option(20, "--limit", "-l", help="Max results"),
) -> None:
    """Query memory for facts."""
    import asyncio
    
    console = get_console()
    config = load_config()
    kernel = get_kernel(config)
    
    async def _query():
        memory = kernel.get_service("memory")
        results = await memory.query(pattern, limit)
        
        console.print(f"[bold]Found {len(results)} facts:[/bold]")
        for i, fact in enumerate(results, 1):
            console.print(f"\n{i}. {fact.content}")
            console.print(f"   Confidence: {fact.confidence}")
            console.print(f"   Source: {fact.provenance.source}")
    
    asyncio.run(_query())


@app.command()
def store(
    fact: str = typer.Argument(..., help="Fact to store"),
    confidence: float = typer.Option(0.8, "--confidence", "-c", help="Confidence score"),
) -> None:
    """Store a fact in memory."""
    console = get_console()
    console.print(f"Storing: {fact}")
    # TODO: Implement storage


@app.command()
def causal(
    event: str = typer.Argument(..., help="Event to analyze"),
) -> None:
    """Perform causal analysis."""
    console = get_console()
    console.print(f"Analyzing causes of: {event}")
    # TODO: Implement causal analysis
```

**Acceptance Criteria**:
- [ ] `hercules memory query "auth"` works
- [ ] `hercules memory store "fact"` works
- [ ] `hercules memory causal "build failed"` works

---

#### Task 3.2: Implement `hercules cost`
**File**: `hercules/hercules/cli/commands/cost.py`

```python
"""Cost command for budget and SLO management."""

import typer
from typing import Optional

from hercules.cli.utils import get_console, get_kernel, load_config

app = typer.Typer()


@app.command()
def status(
    session: Optional[str] = typer.Option(None, "--session", help="Session ID"),
) -> None:
    """Check cost/budget status."""
    import asyncio
    
    console = get_console()
    config = load_config()
    kernel = get_kernel(config)
    
    async def _status():
        governor = kernel.get_service("cost")
        # TODO: Get status from cost governor
        console.print("[bold]Cost Status:[/bold]")
        console.print("Session: default")
        console.print("Used: $0.00 / $50.00")
        console.print("Status: HEALTHY")
    
    asyncio.run(_status())


@app.command()
def pause(
    all_sessions: bool = typer.Option(False, "--all", help="Pause all sessions"),
) -> None:
    """Pause spending (emergency stop)."""
    console = get_console()
    
    if all_sessions:
        console.print("[bold red]PAUSING ALL SESSIONS[/bold red]")
    else:
        console.print("[bold yellow]Pausing current session[/bold yellow]")
    
    # TODO: Implement pause


@app.command()
def policy(
    name: str = typer.Argument(..., help="Policy name (minimal/standard/generous)"),
) -> None:
    """Set budget policy."""
    console = get_console()
    console.print(f"Setting policy to: {name}")
    # TODO: Set policy
```

**Acceptance Criteria**:
- [ ] `hercules cost status` shows budget
- [ ] `hercules cost pause` stops spending
- [ ] `hercules cost pause --all` stops all
- [ ] `hercules cost policy standard` sets policy

---

#### Task 3.3: Implement `hercules sessions`
**File**: `hercules/hercules/cli/commands/sessions.py`

```python
"""Sessions command for session management."""

import typer
from typing import Optional

from hercules.cli.utils import get_console, get_kernel, load_config

app = typer.Typer()


@app.command()
def list(
    limit: int = typer.Option(100, "--limit", "-l", help="Max sessions"),
) -> None:
    """List active sessions."""
    import asyncio
    
    console = get_console()
    config = load_config()
    kernel = get_kernel(config)
    
    async def _list():
        session_manager = kernel.get_service("session")
        sessions = await session_manager.list(limit)
        
        console.print(f"[bold]Active Sessions ({len(sessions)}):[/bold]")
        for session in sessions:
            console.print(f"  {session.id}: {session.status}")
    
    asyncio.run(_list())


@app.command()
def resume(
    session_id: str = typer.Argument(..., help="Session ID to resume"),
) -> None:
    """Resume a session."""
    console = get_console()
    console.print(f"Resuming session: {session_id}")
    # TODO: Implement resume


@app.command()
def export(
    session_id: str = typer.Argument(..., help="Session ID to export"),
    output: str = typer.Option(..., "--output", "-o", help="Output file"),
) -> None:
    """Export session data."""
    console = get_console()
    console.print(f"Exporting {session_id} to {output}")
    # TODO: Implement export
```

**Acceptance Criteria**:
- [ ] `hercules sessions list` shows sessions
- [ ] `hercules sessions resume <id>` works
- [ ] `hercules sessions export <id> -o file` works

---

#### Task 3.4: Implement `hercules skills`
**File**: `hercules/hercules/cli/commands/skills.py`

```python
"""Skills command for skill management."""

import typer

from hercules.cli.utils import get_console, get_kernel, load_config

app = typer.Typer()


@app.command()
def list() -> None:
    """List available skills."""
    console = get_console()
    console.print("[bold]Skills:[/bold]")
    console.print("  - architecture-design")
    console.print("  - code-review")
    console.print("  - security-audit")
    # TODO: List actual skills


@app.command()
def create(
    name: str = typer.Argument(..., help="Skill name"),
) -> None:
    """Create a new skill."""
    console = get_console()
    console.print(f"Creating skill: {name}")
    # TODO: Implement skill creation


@app.command()
def audit(
    name: str = typer.Argument(..., help="Skill name to audit"),
) -> None:
    """Audit a skill."""
    console = get_console()
    console.print(f"Auditing skill: {name}")
    # TODO: Implement audit
```

**Acceptance Criteria**:
- [ ] `hercules skills list` shows skills
- [ ] `hercules skills create <name>` works
- [ ] `hercules skills audit <name>` works

---

### Phase 4: Advanced Commands (Week 2-3)

#### Task 4.1: Implement `hercules agent`
**File**: `hercules/hercules/cli/commands/agent.py`

```python
"""Agent command for agent management."""

import typer

from hercules.cli.utils import get_console, get_kernel, load_config

app = typer.Typer()


@app.command()
def list() -> None:
    """List available agents."""
    console = get_console()
    console.print("[bold]Agents:[/bold]")
    console.print("  - default")
    console.print("  - reviewer")
    console.print("  - architect")


@app.command()
def create(
    name: str = typer.Argument(..., help="Agent name"),
) -> None:
    """Create a new agent."""
    console = get_console()
    console.print(f"Creating agent: {name}")


@app.command()
def skills(
    name: str = typer.Argument(..., help="Agent name"),
) -> None:
    """View agent skills."""
    console = get_console()
    console.print(f"Skills for agent {name}:")
```

---

#### Task 4.2: Implement `hercules mcp`
**File**: `hercules/hercules/cli/commands/mcp.py`

```python
"""MCP command for MCP operations."""

import typer
from typing import Optional

from hercules.cli.utils import get_console, get_kernel, load_config

app = typer.Typer()


@app.command()
def serve(
    port: int = typer.Option(8000, "--port", "-p", help="Server port"),
) -> None:
    """Start MCP server."""
    import asyncio
    
    console = get_console()
    config = load_config()
    kernel = get_kernel(config)
    
    async def _serve():
        from hercules.tools.mcp_server import MCPServer
        
        server = MCPServer(kernel)
        console.print(f"Starting MCP server on port {port}")
        await server.start(port)
    
    asyncio.run(_serve())


@app.command()
def add(
    name: str = typer.Argument(..., help="Server name"),
    command: str = typer.Option(..., "--command", help="Server command"),
) -> None:
    """Add MCP server."""
    console = get_console()
    console.print(f"Adding MCP server: {name}")
    console.print(f"Command: {command}")


@app.command()
def tools() -> None:
    """List MCP tools."""
    console = get_console()
    console.print("[bold]MCP Tools:[/bold]")
```

---

#### Task 4.3: Implement `hercules gateway`
**File**: `hercules/hercules/cli/commands/gateway.py`

```python
"""Gateway command for multi-platform integration."""

import typer

from hercules.cli.utils import get_console

app = typer.Typer()


@app.command()
def start(
    platform: str = typer.Argument(..., help="Platform (telegram/discord/slack)"),
) -> None:
    """Start gateway for platform."""
    console = get_console()
    console.print(f"Starting {platform} gateway...")
    console.print("[yellow]Gateway not yet implemented[/yellow]")


@app.command()
def status() -> None:
    """Check gateway status."""
    console = get_console()
    console.print("Gateway Status: Not running")
```

---

## Implementation Schedule

### Week 1: Infrastructure + Core
- **Day 1-2**: Tasks 1.1-1.3 (Entrypoint, Typer app, utilities)
- **Day 3-4**: Tasks 2.1-2.2 (run, inspect)
- **Day 5-7**: Tasks 2.3-2.4 (replay, chat)

### Week 2: Domain Commands
- **Day 8-9**: Task 3.1 (memory)
- **Day 10-11**: Task 3.2 (cost)
- **Day 12-13**: Task 3.3 (sessions)
- **Day 14**: Task 3.4 (skills)

### Week 3: Advanced + Polish
- **Day 15-16**: Tasks 4.1-4.2 (agent, mcp)
- **Day 17**: Task 4.3 (gateway)
- **Day 18-19**: Integration testing, bug fixes
- **Day 20-21**: Documentation, examples

---

## Testing Strategy

### Unit Tests
```python
# tests/unit/cli/test_run.py
def test_run_command():
    result = runner.invoke(app, ["run", "test task"])
    assert result.exit_code == 0
```

### Integration Tests
```python
# tests/integration/cli/test_e2e.py
async def test_full_workflow():
    # Create kernel
    # Execute task via CLI
    # Verify output
```

---

## Success Criteria

- [ ] All 14 commands implemented
- [ ] `hercules --help` shows all commands
- [ ] Each command has `--help`
- [ ] Commands integrate with kernel/services
- [ ] TUIs (inspect, replay) launch properly
- [ ] Interactive chat mode works
- [ ] Error handling is user-friendly
- [ ] All tests pass

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Typer learning curve | Low | Low | Good documentation |
| Async complexity | Medium | Medium | Use asyncio.run() wrapper |
| Service wiring issues | Medium | High | Test incrementally |
| TUI integration | Low | Medium | Classes already exist |

---

**Plan Version**: 1.0  
**Status**: Ready for Execution  
**Next Step**: Begin Task 1.1 (Create __main__.py)
