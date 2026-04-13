# Project Agents And Skills

## Custom Agents

- Project-specific agents live in `./.opencode/agents`.
- Keep agent files in OpenCode markdown format with YAML frontmatter (`description`, `mode`, optional `tools`).
- Use `mode: subagent` for specialist agents intended for delegation.

## Project Skills

- Project-specific skills remain in `./.agents/skills`.
- Before implementing or answering, check whether any project skill applies and load it with the `skill` tool.
- Prefer project-local skills over generic guidance when both apply.

## Skill Discovery Rules

- Treat skill checks as mandatory: if there is a plausible match, invoke the skill first.
- For Nostr-related work, use `nostr-specialist`.
- For frontend/UI work, use `frontend-design`, `tailwind-css-patterns`, `tailwind-v4-shadcn`, or `shadcn` as relevant.
- For testing work, use `vitest` or `playwright-best-practices` as relevant.

## Validation

- After changing agents, verify discovery with `opencode agent list`.
- After changing skills, verify discovery with `opencode debug skill`.
