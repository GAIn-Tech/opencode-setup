# Unified CLI with Rich UI and Multi-Provider Support

## Goal
Create a single-entry CLI with rich UI (like Hermes/SWE-agent) supporting multiple AI providers.

## Requirements

### Single Command Entry
- `hercules` - Launch interactive TUI
- `hercules [task]` - Quick execution mode
- Rich terminal UI with panels, progress bars, live updates

### Provider Support
1. **ChatGPT/Codex** (OpenAI)
2. **NVIDIA** (NGC/NIM)
3. **OpenRouter**
4. **OllamaCloud**

### UI Features (like Hermes/SWE-agent)
- Split-pane layout
- File browser panel
- Chat/terminal panel
- Status/progress panel
- Command palette
- Syntax highlighting
- Diff viewer
- Live streaming output

## Phase 1: Core TUI Framework

### Task 1.1: Create Unified Entry Point
**File**: `hercules/hercules/cli/tui.py` (new)

**Features**:
- Textual-based TUI framework
- Split screen layout
- Event-driven architecture
- Keyboard shortcuts

**Estimated Time**: 30 minutes

---

### Task 1.2: Create Layout Components
**File**: `hercules/hercules/cli/components/` (new directory)

**Components**:
- `file_browser.py` - Tree view of files
- `chat_panel.py` - Scrollable chat history
- `terminal_panel.py` - Command execution output
- `status_bar.py` - Progress, cost, status
- `command_palette.py` - Quick actions
- `diff_viewer.py` - Side-by-side diffs

**Estimated Time**: 45 minutes

---

### Task 1.3: Create Main TUI App
**File**: `hercules/hercules/cli/tui_app.py` (new)

**Features**:
- Main application class
- Screen management
- State management
- Theme support

**Estimated Time**: 25 minutes

---

## Phase 2: Provider Configuration

### Task 2.1: Create Provider Base Classes
**File**: `hercules/hercules/providers/base.py` (new)

**Features**:
- Abstract provider interface
- Authentication handling
- Model discovery
- Cost tracking

**Estimated Time**: 20 minutes

---

### Task 2.2: Implement OpenAI Provider
**File**: `hercules/hercules/providers/openai.py` (new)

**Features**:
- ChatGPT/GPT-4 support
- Codex support
- API key management
- Model listing

**Estimated Time**: 20 minutes

---

### Task 2.3: Implement NVIDIA Provider
**File**: `hercules/hercules/providers/nvidia.py` (new)

**Features**:
- NGC integration
- NIM models
- API key management

**Estimated Time**: 20 minutes

---

### Task 2.4: Implement OpenRouter Provider
**File**: `hercules/hercules/providers/openrouter.py` (new)

**Features**:
- Multi-model routing
- API key management
- Model discovery

**Estimated Time**: 20 minutes

---

### Task 2.5: Implement OllamaCloud Provider
**File**: `hercules/hercules/providers/ollama.py` (new)

**Features**:
- Local model support
- Cloud sync
- Model management

**Estimated Time**: 20 minutes

---

## Phase 3: Setup Wizards

### Task 3.1: Create Provider Setup Wizard
**File**: `hercules/hercules/cli/setup.py` (new)

**Features**:
- Interactive provider selection
- API key prompts
- Configuration validation
- Test connection

**Estimated Time**: 30 minutes

---

### Task 3.2: Create Provider Selector Widget
**File**: `hercules/hercules/cli/components/provider_selector.py` (new)

**Features**:
- List available providers
- Show provider status
- Quick switch

**Estimated Time**: 15 minutes

---

## Phase 4: Enhanced Features

### Task 4.1: Create Live Streaming Output
**File**: `hercules/hercules/cli/components/streaming_output.py` (new)

**Features**:
- Real-time token streaming
- Markdown rendering
- Syntax highlighting
- Scrollback buffer

**Estimated Time**: 25 minutes

---

### Task 4.2: Create Diff Viewer Component
**File**: `hercules/hercules/cli/components/diff_viewer.py` (new)

**Features**:
- Side-by-side diff
- Syntax highlighting
- Accept/reject buttons
- Line numbers

**Estimated Time**: 20 minutes

---

### Task 4.3: Create Command Palette
**File**: `hercules/hercules/cli/components/command_palette.py` (new)

**Features**:
- Quick commands (Ctrl+Shift+P)
- Fuzzy search
- Action shortcuts
- Recent commands

**Estimated Time**: 20 minutes

---

## Phase 5: Integration

### Task 5.1: Update Main CLI Entry
**File**: `hercules/hercules/__main__.py` (update)

**Features**:
- Detect if TTY
- Launch TUI if interactive
- Execute command if args provided

**Estimated Time**: 15 minutes

---

### Task 5.2: Update CLI Commands
**File**: `hercules/hercules/cli/commands/run.py` (update)

**Features**:
- Integrate with TUI
- Stream output to panel
- Show progress in status bar

**Estimated Time**: 15 minutes

---

### Task 5.3: Create Config Management
**File**: `hercules/hercules/cli/config_manager.py` (new)

**Features**:
- Save/load provider configs
- Encrypt API keys
- Environment variable support
- Profile switching

**Estimated Time**: 20 minutes

---

## Phase 6: Testing

### Task 6.1: Create TUI Tests
**File**: `hercules/tests/unit/test_tui.py` (new)

**Features**:
- Component tests
- Integration tests
- Mock providers

**Estimated Time**: 25 minutes

---

### Task 6.2: Create Provider Tests
**File**: `hercules/tests/unit/test_providers.py` (new)

**Features**:
- Mock API responses
- Authentication tests
- Error handling

**Estimated Time**: 20 minutes

---

## Summary

| Phase | Tasks | Est. Time |
|-------|-------|-----------|
| 1 - TUI Framework | 3 tasks | 100 min |
| 2 - Providers | 5 tasks | 100 min |
| 3 - Setup Wizards | 2 tasks | 45 min |
| 4 - Enhanced Features | 3 tasks | 65 min |
| 5 - Integration | 3 tasks | 50 min |
| 6 - Testing | 2 tasks | 45 min |
| **Total** | **18 tasks** | **~7 hours** |

## Usage After Completion

```bash
# Launch interactive TUI
hercules

# Or with task
hercules "Refactor auth module"

# Setup providers
hercules setup

# Quick provider switch
hercules provider openai
```

## Features Delivered

✅ Single command entry (`hercules`)
✅ Rich TUI with split panels
✅ File browser
✅ Chat/terminal panels
✅ Command palette
✅ Diff viewer
✅ Live streaming output
✅ 4 provider support
✅ Setup wizards
✅ Provider switching
✅ Configuration management
