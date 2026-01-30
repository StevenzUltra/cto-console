# filling_tool
For Codex/Claude Code/Gemini Cooperation

## Agent Swarm - Multi-AI CLI Collaboration Tool

Agent Swarm is a CLI tool that enables multiple AI assistants to work together on the same project through a role-based task management system.

### Quick Start

```bash
# Create tasks
python3 agent_swarm.py td create-task T1 "Setup Database" "Create schema"

# Assign to groups
python3 agent_swarm.py td assign-task T1 GroupA

# Groups work on tasks
python3 agent_swarm.py group GroupA my-tasks
python3 agent_swarm.py group GroupA complete-task T1
```

### Features

- **Role-based system**: Tech Director (TD) manages tasks, Groups execute them
- **Task dependencies**: Automatic dependency blocking and unblocking
- **Real-time messaging**: Message injection via tmux send-keys
- **Progress tracking**: Comprehensive logging system

### Documentation

- [Full Documentation](AGENT_SWARM_README.md) - Complete usage guide
- [Example Workflow](example_workflow.sh) - Basic workflow example
- [Live Demo](demo.sh) - Comprehensive demonstration
- [Tests](test_agent_swarm.sh) - Integration tests

### Try It

```bash
# Run the example workflow
./example_workflow.sh

# Run the live demo
./demo.sh

# Run tests
./test_agent_swarm.sh
```
