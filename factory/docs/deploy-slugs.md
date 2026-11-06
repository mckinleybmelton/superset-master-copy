# Hosted deploy slugs

Deploy each peer with a stable slug matching its folder name:

```bash
cd factory
./scripts/deploy-factory.sh          # dry-run
./scripts/deploy-factory.sh --apply  # human-run; save alias token
```

| Slug | Role |
| --- | --- |
| `orchestrator` | Grok Bot (Slack) |
| `product` | PRD / backlog |
| `design` | UX |
| `architect` | Architecture |
| `implementer` | Code + PR |
| `reviewer` | Review packet |

Peer MCP uses `defineConnection({ agent: "<slug>" })`. After deploy, connect GitHub under Deployed Agents connectors and mint prod Slack with `slack create --env prod` on the orchestrator.

**Do not** run the first `--apply` deploy from an unattended agent session if you need to capture the one-time alias token yourself.
