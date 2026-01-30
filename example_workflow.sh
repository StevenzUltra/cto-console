#!/bin/bash
# Example workflow demonstrating Agent Swarm

echo "=== Agent Swarm Example Workflow ==="
echo ""

# Clean up any existing state
rm -rf .agent_swarm
echo "Cleaned up existing state"
echo ""

echo "1. Tech Director creates tasks with dependencies"
python3 agent_swarm.py td create-task T1 "Setup-Database" "Create PostgreSQL schema and tables"
python3 agent_swarm.py td create-task T2 "Add-Models" "Create ORM models for database" --deps T1
python3 agent_swarm.py td create-task T3 "Add-API" "Create REST API endpoints" --deps T2
python3 agent_swarm.py td create-task T4 "Add-Tests" "Write unit tests for API" --deps T3
echo ""

echo "2. List all tasks"
python3 agent_swarm.py td list-tasks
echo ""

echo "3. TD assigns tasks to groups"
python3 agent_swarm.py td assign-task T1 GroupA
python3 agent_swarm.py td assign-task T2 GroupB
python3 agent_swarm.py td assign-task T3 GroupC
echo ""

echo "4. Check task status (T2 and T3 should be blocked)"
python3 agent_swarm.py td list-tasks
echo ""

echo "5. GroupA checks their tasks"
python3 agent_swarm.py group GroupA my-tasks
echo ""

echo "6. GroupA reports progress on T1"
python3 agent_swarm.py group GroupA report-progress T1 "Created database schema - 50% complete"
echo ""

echo "7. GroupA completes T1"
python3 agent_swarm.py group GroupA complete-task T1
echo ""

echo "8. Check task status (T2 should now be unblocked)"
python3 agent_swarm.py td list-tasks
echo ""

echo "9. GroupB checks their tasks"
python3 agent_swarm.py group GroupB my-tasks
echo ""

echo "10. GroupB works on T2"
python3 agent_swarm.py group GroupB report-progress T2 "Creating ORM models"
python3 agent_swarm.py group GroupB complete-task T2
echo ""

echo "11. Check task status (T3 should now be unblocked)"
python3 agent_swarm.py td list-tasks
echo ""

echo "12. TD monitors logs"
python3 agent_swarm.py td monitor-logs GroupA
echo ""

echo "13. TD sends message to GroupC"
python3 agent_swarm.py td send-message GroupC "Please start working on T3 as soon as T2 is complete"
echo ""

echo "14. GroupC reads messages"
python3 agent_swarm.py group GroupC read-messages
echo ""

echo "15. GroupC completes T3"
python3 agent_swarm.py group GroupC complete-task T3
echo ""

echo "16. Final task status"
python3 agent_swarm.py td list-tasks
echo ""

echo "=== Example workflow completed ==="
