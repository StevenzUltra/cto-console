# Agent Swarm - Multi-AI CLI Collaboration Tool

Agent Swarm is a CLI tool that enables multiple AI assistants to work together on the same project through a role-based task management system.

## Features

- **Role-based system**: Tech Director (TD) manages tasks, Groups (A/B/C...) execute tasks
- **Task management**: Create, assign, and complete tasks with dependency blocking
- **Real-time messaging**: Auto-inject messages between TD and groups via tmux send-keys
- **Progress logging**: Groups report progress, TD monitors via logs

## Installation

```bash
chmod +x agent_swarm.py
# Or use: python3 agent_swarm.py
```

## Architecture

### Tech Director (TD)
- Creates and manages tasks
- Assigns tasks to groups
- Monitors progress via logs
- Sends messages to groups

### Groups (A, B, C, ...)
- Receive task assignments
- Report progress on tasks
- Complete tasks
- Read messages from TD

## Usage

### Tech Director Commands

#### Create a Task
```bash
python3 agent_swarm.py td create-task <id> <title> <description>
```

Example:
```bash
python3 agent_swarm.py td create-task T1 "Setup Database" "Create PostgreSQL schema"
```

#### Create a Task with Dependencies
```bash
python3 agent_swarm.py td create-task <id> <title> <description> --deps <dep1,dep2,...>
```

Example:
```bash
python3 agent_swarm.py td create-task T2 "Add Models" "Create ORM models" --deps T1
```

#### Assign a Task to a Group
```bash
python3 agent_swarm.py td assign-task <id> <group>
```

Example:
```bash
python3 agent_swarm.py td assign-task T1 GroupA
```

#### List All Tasks
```bash
python3 agent_swarm.py td list-tasks
```

#### List Tasks by Status
```bash
python3 agent_swarm.py td list-tasks --status <status>
```

Example:
```bash
python3 agent_swarm.py td list-tasks --status pending
python3 agent_swarm.py td list-tasks --status in_progress
python3 agent_swarm.py td list-tasks --status completed
```

#### Monitor Logs
```bash
# Monitor all logs
python3 agent_swarm.py td monitor-logs

# Monitor specific group
python3 agent_swarm.py td monitor-logs GroupA
```

#### Send Message to Group
```bash
python3 agent_swarm.py td send-message <group> <message>
```

Example:
```bash
python3 agent_swarm.py td send-message GroupA "Please prioritize T1"
```

### Group Commands

#### View My Tasks
```bash
python3 agent_swarm.py group <name> my-tasks
```

Example:
```bash
python3 agent_swarm.py group GroupA my-tasks
```

#### Report Progress
```bash
python3 agent_swarm.py group <name> report-progress <task-id> <message>
```

Example:
```bash
python3 agent_swarm.py group GroupA report-progress T1 "Database schema 50% complete"
```

#### Complete a Task
```bash
python3 agent_swarm.py group <name> complete-task <task-id>
```

Example:
```bash
python3 agent_swarm.py group GroupA complete-task T1
```

#### Read Messages
```bash
python3 agent_swarm.py group <name> read-messages
```

Example:
```bash
python3 agent_swarm.py group GroupA read-messages
```

## Workflow Example

Here's a complete workflow demonstrating the Agent Swarm system:

### 1. TD Creates Tasks with Dependencies

```bash
# Create foundation tasks
python3 agent_swarm.py td create-task T1 "Setup Database" "Create PostgreSQL schema"
python3 agent_swarm.py td create-task T2 "Add Models" "Create ORM models" --deps T1
python3 agent_swarm.py td create-task T3 "Add API" "Create REST API endpoints" --deps T2
python3 agent_swarm.py td create-task T4 "Add Tests" "Write unit tests" --deps T3

# View all tasks
python3 agent_swarm.py td list-tasks
```

### 2. TD Assigns Tasks to Groups

```bash
# T1 has no dependencies, can be assigned immediately
python3 agent_swarm.py td assign-task T1 GroupA

# T2 depends on T1, will be blocked if T1 is not complete
python3 agent_swarm.py td assign-task T2 GroupB
```

### 3. Groups Work on Tasks

```bash
# GroupA checks their tasks
python3 agent_swarm.py group GroupA my-tasks

# GroupA reports progress
python3 agent_swarm.py group GroupA report-progress T1 "Created database schema"

# GroupA completes the task
python3 agent_swarm.py group GroupA complete-task T1
```

### 4. TD Monitors Progress

```bash
# Check all tasks
python3 agent_swarm.py td list-tasks

# Monitor GroupA logs
python3 agent_swarm.py td monitor-logs GroupA

# Check for blocked tasks
python3 agent_swarm.py td list-tasks --status blocked
```

### 5. Dependent Tasks Automatically Unblock

When GroupA completes T1, T2 (which was assigned to GroupB) automatically changes from "blocked" to "in_progress":

```bash
# GroupB can now work on T2
python3 agent_swarm.py group GroupB my-tasks
python3 agent_swarm.py group GroupB report-progress T2 "Created ORM models"
python3 agent_swarm.py group GroupB complete-task T2
```

## Tmux Integration

For real-time messaging, Agent Swarm integrates with tmux. When groups are running in tmux sessions:

### 1. Start Groups in Tmux Sessions

```bash
# Create a tmux session for GroupA
tmux new-session -s agent_swarm_GroupA

# In the tmux session, monitor messages
tail -f .agent_swarm/GroupA.log
```

### 2. TD Sends Messages

When TD sends a message or assigns a task to a group with an active tmux session, the message is automatically injected into that session:

```bash
python3 agent_swarm.py td send-message GroupA "Please prioritize T1"
# This will appear in the agent_swarm_GroupA tmux session
```

## State Management

All state is stored in the `.agent_swarm` directory:

- `tasks.json` - All tasks and their status
- `messages.json` - All messages between agents
- `groups.json` - Registered groups
- `<agent>.log` - Log files for each agent

## Task States

- **pending**: Task is created but not yet assigned or has incomplete dependencies
- **in_progress**: Task is assigned and being worked on
- **completed**: Task is finished
- **blocked**: Task is assigned but has incomplete dependencies

## Dependency Management

Tasks can have dependencies on other tasks. A task with dependencies:

1. Cannot be started until all dependencies are completed
2. Automatically changes from "blocked" to "in_progress" when dependencies complete
3. Dependencies are checked when assigning tasks

Example:
```bash
# T2 depends on T1
python3 agent_swarm.py td create-task T2 "Second Task" "Depends on T1" --deps T1

# Assigning T2 before T1 is complete will result in BLOCKED status
python3 agent_swarm.py td assign-task T2 GroupB  # Status: blocked

# When T1 completes, T2 automatically becomes in_progress
python3 agent_swarm.py group GroupA complete-task T1  # T2 is now unblocked
```

## Best Practices

1. **Use descriptive task IDs**: Use a consistent naming scheme like T1, T2, etc.
2. **Set dependencies early**: Define task dependencies when creating tasks
3. **Monitor logs regularly**: Check logs to track group progress
4. **Use tmux for real-time collaboration**: Run groups in tmux sessions for instant messaging
5. **Report progress frequently**: Groups should report progress to keep TD informed

## Limitations

- Task IDs must be unique
- Dependencies must exist before creating a task that depends on them
- Groups cannot modify tasks they are not assigned to
- Tmux integration requires tmux to be installed and sessions to be named correctly

## Troubleshooting

### Messages not appearing in tmux
- Ensure tmux session is named correctly: `agent_swarm_<GroupName>`
- Check if tmux is installed: `tmux -V`

### Tasks stuck in blocked state
- Verify all dependencies are completed: `python3 agent_swarm.py td list-tasks`
- Check dependency chain for circular dependencies

### Cannot assign task
- Ensure task exists: `python3 agent_swarm.py td list-tasks`
- Check if dependencies are completed
