#!/bin/bash
# Test tmux integration

echo "=== Testing Tmux Integration ==="
echo ""

# Clean up
rm -rf .agent_swarm
tmux kill-session -t agent_swarm_GroupA 2>/dev/null || true
tmux kill-session -t agent_swarm_GroupB 2>/dev/null || true

# Create tmux sessions for groups
echo "Creating tmux sessions..."
tmux new-session -d -s agent_swarm_GroupA
tmux new-session -d -s agent_swarm_GroupB

# Create tasks
python3 agent_swarm.py td create-task T1 "Task1" "First task"
python3 agent_swarm.py td create-task T2 "Task2" "Second task" --deps T1

# Assign tasks
python3 agent_swarm.py td assign-task T1 GroupA
python3 agent_swarm.py td assign-task T2 GroupB

# Send a message via tmux
python3 agent_swarm.py td send-message GroupA "Please start working on T1"

# Check if message was sent to tmux session
echo -e "\nChecking tmux session output..."
sleep 1
tmux capture-pane -t agent_swarm_GroupA -p | tail -5

# Complete task and see if notification is sent
python3 agent_swarm.py group GroupA complete-task T1

echo -e "\nChecking GroupB tmux session for unblock notification..."
sleep 1
tmux capture-pane -t agent_swarm_GroupB -p | tail -5

# Clean up
tmux kill-session -t agent_swarm_GroupA 2>/dev/null || true
tmux kill-session -t agent_swarm_GroupB 2>/dev/null || true

echo -e "\n✓ Tmux integration test completed"
echo "Note: Messages appear as comments in tmux sessions using 'tmux send-keys'"
