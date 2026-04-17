# RedAI TUI

Keyboard reference for the interactive terminal UI launched by `redai` (or `bun run redai` from a checkout).

## Keyboard Shortcuts

### Top level

| Key | Action |
| --- | --- |
| `Tab` / `←` `→` | switch between Scans and Environments |
| `↑` / `↓` | move selection |
| `N` | create a new scan (Scans tab) or environment (Environments tab) |
| `Enter` | open the selected scan |
| `S` | open setup for the selected environment |
| `R` | resume the selected scan (when resumable) or mark an environment ready during setup |
| `C` | cancel the active scan |
| `D` | delete the selected scan or environment |
| `O` | re-open environment setup (during the environment-setup view) |
| `q` / `Ctrl+C` | quit |

### Forms (new scan / new environment)

| Key | Action |
| --- | --- |
| `↑` / `↓` | select a field |
| `←` / `→` or `Tab` | change choices and numeric values |
| `Backspace` | delete text from text fields |
| `Enter` | create or start |
| `Esc` | cancel |

### Run detail

| Key | Action |
| --- | --- |
| `Tab` / `←` `→` | cycle Overview, Report, Findings, Units |
| `↑` / `↓` | scroll, or move list selection on Findings / Units |
| `PageUp` / `PageDown` | page through long content on Overview and Report |
| `Enter` | open a finding's detail (on the Findings tab) |
| `Esc` | back to the scan list |

### Finding detail

| Key | Action |
| --- | --- |
| `Tab` / `←` `→` | switch Details ↔ Validation |
| `↑` / `↓` | scroll |
| `PageUp` / `PageDown` | page |
| `Esc` | back to the run detail view |

When a scan completes, the Overview tab shows the report paths (`~/.redai/runs/<runId>/report.md` and `.html`) and the Report tab renders the Markdown in-terminal.

## Architecture

Built with [Ink](https://github.com/vadimdemedes/ink) and React.

- `app.tsx` — top-level layout, view routing, and keyboard handling.
- `screens/` — tab screens (Scans, Environments, Run detail, Finding detail, forms).
- `components/` — shared Ink components (TabBar, CommandBar, list/preview layout).
- `state/` — React hooks backing runtime state.
- `main.tsx` — entry point launched by `bun run redai`.
