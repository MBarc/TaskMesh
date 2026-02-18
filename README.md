<p align="center">
  <img src="client/public/taskmesh-logo.svg" alt="TaskMesh" width="400" />
</p>

<h3 align="center">All Your Work. One Place.</h3>

<p align="center">
  The self-hosted command center that pulls scattered work into a single board, gets it done, and pushes completions back to every source system.
</p>

<p align="center">
  <a href="#getting-started">Get Started</a> &middot;
  <a href="#features">Features</a> &middot;
  <a href="#turn-your-work-into-ai-ready-knowledge">AI-Ready Docs</a> &middot;
  <a href="#contributing">Contributing</a>
</p>

---

## The Problem

Your work lives in a dozen different places: Azure DevOps boards, ServiceNow queues, email inboxes, meeting recordings, and chat threads. Every platform has its own dashboard, its own notifications, and its own workflow. You spend more time switching between tools than actually getting things done. And when the work is done, all that hard-won knowledge stays trapped in tickets and threads where nobody will ever find it again.

## The Solution

TaskMesh brings all of it together. Import tasks from Azure DevOps, ServiceNow, Outlook, Gmail, or even a recorded meeting. Work through them on a single board. When you're done, push completions back to the source. Then take it a step further: generate structured Markdown documentation from your workflows and use it to train AI agents on any platform. Your team's operational knowledge becomes a living, reusable asset instead of a forgotten ticket.

## Features

### Unified Task Board
Create multiple boards with custom columns, drag-and-drop organization, and flexible column types including text, dates, dropdowns, and multi-select fields. Everything you need to triage, prioritize, and execute.

### ITSM Connectors
Pull work items from **Azure DevOps** and **ServiceNow** directly into your board. Push completed work back to the originating platform with a single click. Two-way sync keeps everything in lockstep.

### Email Monitoring
Connect your **Outlook** or **Gmail** account and TaskMesh continuously polls for new emails, identifies actionable items, and surfaces them as tasks on your board.

### AI-Powered Task Extraction
Paste meeting notes or upload audio/video recordings and let a local LLM (powered by **Ollama** and **Whisper**) extract action items automatically. Filter by assignee to pull only the tasks that matter to you.

### AI-Generated Fields
When pushing work items to Azure DevOps, TaskMesh can auto-generate descriptions, acceptance criteria, and repro steps so your tickets ship ready to go.

### Documentation Generation
Create polished **Markdown documentation** with a built-in dual-pane editor, reusable templates, variable substitution, and AI-assisted writing. Draft auto-saves keep your work safe, and every document is stored as a clean `.md` file ready for export.

### Theming
Multiple built-in themes with dark and light mode support to match your preference.

---

## Turn Your Work into AI-Ready Knowledge

Most teams have years of operational knowledge locked inside completed tickets, runbooks, and one-off notes that no one can find. TaskMesh changes that.

With the built-in documentation system, you can:

- **Write structured Markdown docs** directly from your task context, with a live preview editor and AI-assisted writing tools
- **Use templates and variables** to standardize documentation across your team (runbooks, incident response plans, onboarding guides, architecture overviews, and more)
- **Export clean `.md` files** that plug directly into any AI agent framework, RAG pipeline, or knowledge base

The result: your team's real-world processes, decisions, and expertise become training data for AI agents on **any provider**. Whether you're building with OpenAI, Anthropic, Google, or an open-source stack, TaskMesh gives you the structured knowledge layer that makes your agents actually useful.

**Stop letting institutional knowledge disappear when a ticket gets closed. Start turning it into your competitive advantage.**

---

## Getting Started

### Prerequisites

- [Docker](https://www.docker.com/) and Docker Compose

### Run from GitHub Container Registry

Pull and run the pre-built containers directly. No need to clone the repository.

1. **Create a project directory and download the required files:**

   ```bash
   mkdir taskmesh && cd taskmesh
   curl -O https://raw.githubusercontent.com/MBarc/TaskMesh/main/docker-compose.yml
   curl -O https://raw.githubusercontent.com/MBarc/TaskMesh/main/.env.example
   ```

2. **Create your environment file:**

   ```bash
   cp .env.example .env
   ```

3. **Start all services:**

   ```bash
   docker-compose up -d
   ```

4. **Open the app:**

   - Frontend: http://localhost:3000
   - Backend API: http://localhost:4000

5. **To stop the app:**

   ```bash
   docker-compose down
   ```

### Run from Source

```bash
git clone https://github.com/MBarc/TaskMesh.git
cd TaskMesh
cp .env.example .env
docker-compose up -d
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:4000

## Environment Variables

See [`.env.example`](.env.example) for all configuration options including database credentials, AI model selection, and service URLs.

## Contributing

Contributions are welcome! The best way to contribute to TaskMesh is by **building new integrations and connectors**. The app is designed to be the central hub that ties different work platforms together, and adding support for more services makes it more useful for everyone.

Some connector ideas:

- **Jira**: Push/pull issues
- **GitHub Issues**: Sync tasks with GitHub
- **Trello**: Import cards from Trello boards
- **Linear**: Push tasks to Linear projects
- **Slack**: Extract action items from Slack messages
- **Microsoft To Do / Planner**: Sync with Microsoft's task tools

To get started, look at the existing connectors in `server/src/routes/` (e.g., `ado.ts` for Azure DevOps, `snow.ts` for ServiceNow) and their corresponding client components in `client/src/components/` for the pattern to follow.

If you have questions or want to discuss a connector idea before building it, open an issue.
