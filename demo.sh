#!/bin/bash
# Live demonstration of Agent Swarm with tmux

set -e

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         Agent Swarm - Live Demo with Tmux                    ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "This demo shows how Agent Swarm enables multiple AI groups to"
echo "collaborate on tasks with real-time messaging via tmux."
echo ""

# Clean up
rm -rf .agent_swarm
tmux kill-session -t agent_swarm_TD 2>/dev/null || true
tmux kill-session -t agent_swarm_GroupA 2>/dev/null || true
tmux kill-session -t agent_swarm_GroupB 2>/dev/null || true
tmux kill-session -t agent_swarm_GroupC 2>/dev/null || true

# Create project: Web Application
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Project: Build a Web Application"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "Step 1: Tech Director creates task breakdown"
echo "────────────────────────────────────────────"
python3 agent_swarm.py td create-task DB "Database-Setup" "Create PostgreSQL schema and tables"
python3 agent_swarm.py td create-task BE "Backend-API" "Implement REST API with authentication" --deps DB
python3 agent_swarm.py td create-task FE "Frontend-UI" "Build React frontend" --deps BE
python3 agent_swarm.py td create-task TEST "Testing" "Write integration tests" --deps FE
python3 agent_swarm.py td create-task DOC "Documentation" "Write API documentation" --deps BE
echo ""

echo "Step 2: View initial task list"
echo "────────────────────────────────────────────"
python3 agent_swarm.py td list-tasks
echo ""

echo "Step 3: TD assigns tasks to specialized groups"
echo "────────────────────────────────────────────"
python3 agent_swarm.py td assign-task DB GroupA
python3 agent_swarm.py td assign-task BE GroupB
python3 agent_swarm.py td assign-task FE GroupC
python3 agent_swarm.py td assign-task TEST GroupA
python3 agent_swarm.py td assign-task DOC GroupB
echo ""

echo "Step 4: Check task status (some should be blocked)"
echo "────────────────────────────────────────────"
python3 agent_swarm.py td list-tasks
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "👥 Groups start working"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "GroupA: Check assigned tasks"
echo "────────────────────────────────────────────"
python3 agent_swarm.py group GroupA my-tasks
echo ""

echo "GroupA: Start working on Database Setup"
echo "────────────────────────────────────────────"
python3 agent_swarm.py group GroupA report-progress DB "Created database schema - 30%"
sleep 1
python3 agent_swarm.py group GroupA report-progress DB "Added indexes and constraints - 70%"
sleep 1
python3 agent_swarm.py group GroupA report-progress DB "Database setup complete - 100%"
sleep 1
python3 agent_swarm.py group GroupA complete-task DB
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔓 Task Unblocking in Action"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "Check status: BE should now be unblocked"
echo "────────────────────────────────────────────"
python3 agent_swarm.py td list-tasks --status in_progress
echo ""

echo "GroupB: Check messages (should show unblock notification)"
echo "────────────────────────────────────────────"
python3 agent_swarm.py group GroupB read-messages
echo ""

echo "GroupB: Work on Backend API"
echo "────────────────────────────────────────────"
python3 agent_swarm.py group GroupB report-progress BE "Implemented user authentication"
sleep 1
python3 agent_swarm.py group GroupB report-progress BE "Added CRUD endpoints"
sleep 1
python3 agent_swarm.py group GroupB complete-task BE
echo ""

echo "GroupB: Work on Documentation (now unblocked)"
echo "────────────────────────────────────────────"
python3 agent_swarm.py group GroupB report-progress DOC "Documented all API endpoints"
sleep 1
python3 agent_swarm.py group GroupB complete-task DOC
echo ""

echo "GroupC: Check messages and work on Frontend"
echo "────────────────────────────────────────────"
python3 agent_swarm.py group GroupC read-messages
python3 agent_swarm.py group GroupC report-progress FE "Created React components"
sleep 1
python3 agent_swarm.py group GroupC report-progress FE "Integrated with backend API"
sleep 1
python3 agent_swarm.py group GroupC complete-task FE
echo ""

echo "GroupA: Work on Testing (now unblocked)"
echo "────────────────────────────────────────────"
python3 agent_swarm.py group GroupA report-progress TEST "Writing integration tests"
sleep 1
python3 agent_swarm.py group GroupA complete-task TEST
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Final Status"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "All completed tasks:"
echo "────────────────────────────────────────────"
python3 agent_swarm.py td list-tasks --status completed
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📝 Activity Logs"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "GroupA Activity:"
echo "────────────────────────────────────────────"
python3 agent_swarm.py td monitor-logs GroupA
echo ""

echo "GroupB Activity:"
echo "────────────────────────────────────────────"
python3 agent_swarm.py td monitor-logs GroupB
echo ""

echo "GroupC Activity:"
echo "────────────────────────────────────────────"
python3 agent_swarm.py td monitor-logs GroupC
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Demo Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Agent Swarm successfully coordinated 3 groups to complete"
echo "5 tasks with dependency management and real-time messaging!"
echo ""
