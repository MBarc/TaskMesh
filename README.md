<p align="center">
  <img src="client/public/taskmesh-logo.svg" alt="TaskMesh" width="400" />
</p>

<h3 align="center">All Your Work. One Place.</h3>

<p align="center">
  Your to-do list shouldn't live in five different places. TaskMesh brings together work from your email, meetings, project boards, and ITSM tools onto a single board you can actually manage.
</p>

<p align="center">
  <a href="https://taskmesh.co">Website</a> &middot;
  <a href="https://github.com/MBarc/TaskMesh/releases/latest">Download</a> &middot;
  <a href="#getting-started">Getting Started</a> &middot;
  <a href="#contributing">Contributing</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-Elastic_License_2.0-6366f1" alt="License" />
  <img src="https://img.shields.io/github/v/release/MBarc/TaskMesh?color=6366f1" alt="Latest Release" />
</p>

---

## The problem

Most people have their work scattered across three or four different places. Tasks in a project tracker. Requests in your inbox. Action items from that meeting last Tuesday, somewhere in your notes. A follow-up someone pinged you about in chat.

You end up spending half your day switching between tabs to figure out what to work on next.

## What TaskMesh does

TaskMesh pulls tasks from each of those systems onto one board. You can see everything in one place, and when you update something on the board, it syncs back to the source. One tab, open all day, and you always know what's on your plate.

---

## Features

- **Unified task board** — Customizable columns: text, dropdowns, dates, checkboxes, multi-select, and more. Add what matters, skip what doesn't.
- **AI task extraction** — Paste meeting notes or drop in a recording. TaskMesh transcribes it, finds the action items, and adds them to your board.
- **Connectors** — Pull items in and push updates out. Built-in connectors for Azure DevOps, ServiceNow, Outlook, and Gmail.
- **Connector SDK** — Connectors are plugins. If you need to hook into something not covered, build your own.
- **Wiki** — A built-in Markdown editor with AI-assisted drafting and reusable templates. Good for runbooks, SOPs, and anything you keep rewriting from scratch.
- **Documentation generation** — Export clean `.md` files ready for any AI agent framework, RAG pipeline, or knowledge base.
- **Auto-updates** — Checks for updates in the background. Apply them in one click from Settings → Updates.
- **Theming** — Ships with light and dark mode. Build a fully custom theme with CSS variables.
- **REST API** — Full API with key-based auth and Swagger docs at `/api/docs`.

---

## Getting started

### Option 1 — Windows installer (recommended)

Download `TaskMesh-Setup.exe` from the [latest release](https://github.com/MBarc/TaskMesh/releases/latest) and run it. Node.js, the database, and all services are bundled and managed automatically. No prerequisites needed.

### Option 2 — Docker Compose

**Prerequisites:** [Docker Desktop](https://www.docker.com/)

```bash
git clone https://github.com/MBarc/TaskMesh.git
cd TaskMesh/application
cp .env.example .env
docker compose -f docker/docker-compose.yml up -d
```

Open [http://localhost:3000](http://localhost:3000).

---

## Configuration

Copy `.env.example` to `.env` and edit as needed. Key variables:

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | — |
| `PORT` | Server port | `4000` |
| `AI_SERVICE_URL` | Python AI service endpoint | `http://ai-service:8000` |
| `OLLAMA_HOST` | Ollama LLM host | `http://ollama:11434` |
| `OLLAMA_MODEL` | LLM model to use | `qwen2.5:3b` |
| `WHISPER_MODEL` | Transcription model size | `tiny` |
| `DOCUMENTATION_PATH` | Path for saved documents | — |
| `POSTHOG_API_KEY` | PostHog key for telemetry (optional) | — |

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Backend | Node.js + Express + TypeScript |
| AI service | Python + FastAPI + Whisper + Ollama |
| Database | PostgreSQL (Docker) / SQLite (installer) |
| ORM | Prisma |

---

## Project structure

```
application/
├── server/           # Node.js + Express API
│   ├── src/routes/   # API route handlers
│   ├── src/connectors/ # Connector plugins + SDK
│   └── prisma/       # Database schema
├── client/           # React frontend
├── ai-service/       # Python service (transcription + extraction)
├── docker/           # Docker Compose files
├── installer/        # Windows + Linux installers
└── sample/           # Sample themes and documentation templates
```

---

## Connectors

TaskMesh uses a plugin-based connector system. Built-in connectors:

| Connector | Pull | Push |
|---|---|---|
| Azure DevOps | Work items | Status updates, comments |
| ServiceNow | Incidents, requests | Status updates |
| Outlook | Emails as tasks | Replies |
| Gmail | Emails as tasks | Replies |

More connectors are available in the [TaskMesh Marketplace](https://taskmesh.co/marketplace).

---

## Contributing

The best way to contribute is by **building new connectors**. TaskMesh is designed to be the hub that ties work platforms together, and adding support for more services makes it more useful for everyone.

Some ideas: Jira, GitHub Issues, Linear, Trello, Slack, Monday.com, Asana, Zendesk.

To get started, look at the example connector in `server/src/connectors/example-connector/` — it has a `manifest.json` that declares the connector's capabilities and a `handlers.ts` that implements them. The full SDK type definitions are in `server/src/connectors/framework/types.ts`.

If you want to discuss a connector idea before building it, open an issue.

---

## License

TaskMesh is licensed under the [Elastic License 2.0](LICENSE).

You can self-host it, modify it, and build on it freely. You may not offer it as a hosted or managed service to third parties.
