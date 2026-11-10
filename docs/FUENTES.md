# Fuentes y verificación del contenido

Contenido contrastado con la documentación oficial de Claude Code el **9 de noviembre de 2026**. Claude Code cambia con frecuencia: revisa estas páginas antes de cada edición del temario.

| Página oficial | Qué se ha contrastado | Dónde se usa |
|---|---|---|
| [CLI reference](https://code.claude.com/docs/en/cli-reference) | `claude`, `claude "query"`, `-p`, `-c`, `-r`, `-n`, `--permission-mode`, `--model`, `--allowedTools`, `--output-format`, `--max-turns`, `--add-dir`, `--bare` | M1, M2, M6, simulador |
| [Commands](https://code.claude.com/docs/en/commands) | `/init`, `/memory`, `/context`, `/compact`, `/clear`, `/btw`, `/plan`, `/rewind`, `/resume`, `/mcp`, `/agents`, `/skills`, `/permissions`, `/hooks`, `/doctor`, `/status`, `/usage` | M1–M6, simulador |
| [Memory](https://code.claude.com/docs/en/memory) | Ámbitos de CLAUDE.md (usuario, proyecto, local), carga de directorios superiores y subcarpetas, imports `@` (máx. 4 saltos), `.claude/rules/`, < 200 líneas, auto memoria, CLAUDE.md como contexto (no bloqueo) | M2 |
| [Common workflows](https://code.claude.com/docs/en/common-workflows) | Modo plan, `--continue`/`--resume`, worktrees (`--worktree`), referencias `@`, tuberías con `-p` | M2, M5, M6 |
| [Permission modes](https://code.claude.com/docs/en/permission-modes) | Seis modos, ciclo Shift+Tab, `dontAsk` fuera del ciclo, bypass solo en entornos aislados, deny bloquea en todos los modos, Ctrl+G para editar el plan | M2, M4 |
| [Settings](https://code.claude.com/docs/en/settings) | Archivos de settings, precedencia (gestionado > línea de comandos > local > proyecto > usuario), listas que se combinan, JSON estricto, allow local no supera ask de proyecto | M4 |
| [Checkpointing](https://code.claude.com/docs/en/checkpointing) | `/rewind` y Esc Esc; no rastrea cambios de Bash; no sustituye a Git | M1, M2 |
| [Skills](https://code.claude.com/docs/en/skills) | Ubicaciones y prioridad, campos del frontmatter, `disable-model-invocation`, `user-invocable`, `allowed-tools`, `$ARGUMENTS`/`$N`, `ARGUMENTS:` automático, `` !`cmd` ``, archivos de apoyo y carga progresiva, < 500 líneas | M3 |
| [MCP](https://code.claude.com/docs/en/mcp) | `claude mcp add` (http, stdio con `--`, sse obsoleto), `--env`, `--header`, ámbitos local/project/user y dónde se guardan, precedencia, `.mcp.json`, `${VAR}` y `${VAR:-def}`, entrada con url sin type rechazada, `/mcp` y OAuth, advertencia de confianza e inyección | M4 |
| [Subagents](https://code.claude.com/docs/en/sub-agents) | Contexto propio, ubicaciones y prioridad, campos (`name`, `description` obligatorios; `tools`, `model`, …), integrados Explore/Plan/general-purpose, formas de invocar, anidamiento (3 niveles), buenas prácticas | M5 |
| [Hooks guide](https://code.claude.com/docs/en/hooks-guide) | Eventos, estructura JSON, `matcher`, código de salida 2 bloquea, 0 no aprueba | M6 |
| [Run programmatically](https://code.claude.com/docs/en/headless) | `-p`, `--output-format json` (`result`, `session_id`), `--bare` para CI, `--allowedTools` con `Bash(git diff *)` y el espacio antes de `*`, `dontAsk` | M6 |
| [GitHub Actions](https://code.claude.com/docs/en/github-actions) | `anthropics/claude-code-action@v1`, `@claude`, `/install-github-app`, `ANTHROPIC_API_KEY` / `CLAUDE_CODE_OAUTH_TOKEN` como secretos, `--max-turns` en `claude_args` | M6, proyecto final |
| [Desktop](https://code.claude.com/docs/en/desktop) | Pestaña Code, revisión visual de diffs con comentarios, sesiones en paralelo con worktree, entornos local/nube/SSH, selector de modos, `dontAsk` solo en la CLI | M1 |

## Qué se puede delegar en Claude (y qué dice la documentación)

| Tarea | Qué dice la documentación oficial |
|---|---|
| Crear o ampliar CLAUDE.md | `/init` genera un CLAUDE.md inicial; también se puede pedir «add this to CLAUDE.md»; `/memory` permite editarlo a mano (Memory) |
| Hooks | «You can also ask Claude to write the hook for you by describing what you want» (Hooks guide) |
| Subagentes | `/agents` recuerda pedirle a Claude que cree o gestione subagentes, o editar `.claude/agents/` (Commands) |
| Ajustes rotos | Un `Settings Error` ofrece corregir el archivo con ayuda de Claude; `/doctor` ofrece arreglos tras confirmar (Settings, Skills) |
| Skills | La guía oficial las crea **a mano** como ejemplo didáctico. No afirma que Claude las cree por sí solo, pero son archivos de texto del proyecto que Claude puede escribir; en la academia se plantea como «pídeselo y revisa» |

## Decisiones de prudencia

- El **Claude simulado** de los ejercicios no usa IA: aplica respuestas predefinidas en el temario cuando la petición contiene lo necesario. Sirve para practicar a pedir con claridad y a revisar.
- El simulador reproduce la **forma** de los comandos (flags, ámbitos, archivos que se escriben) pero no su salida exacta. Todas sus respuestas indican que son una simulación.
- `/context` muestra una **estimación didáctica** con una ventana de ejemplo de 200k tokens; la real depende del modelo.
- `/agents`: en versiones recientes muestra un recordatorio para crear subagentes pidiéndoselo a Claude o editando `.claude/agents/`; en versiones antiguas abría un asistente.
- Los ejemplos de URLs MCP usan dominios `ejemplo.com` y todos los datos financieros son ficticios.
