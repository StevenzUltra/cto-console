#!/bin/bash
# Integration test for Agent Swarm

set -e

echo "=== Agent Swarm Integration Test ==="
echo ""

# Clean up
rm -rf .agent_swarm
echo "✓ Cleaned up state"

# Test 1: Task creation
echo -e "\nTest 1: Task Creation"
python3 agent_swarm.py td create-task T1 "Task1" "Description1"
python3 agent_swarm.py td create-task T2 "Task2" "Description2" --deps T1
echo "✓ Tasks created"

# Test 2: Task listing
echo -e "\nTest 2: Task Listing"
OUTPUT=$(python3 agent_swarm.py td list-tasks)
if echo "$OUTPUT" | grep -q "T1: Task1"; then
    echo "✓ Task listing works"
else
    echo "✗ Task listing failed"
    exit 1
fi

# Test 3: Task assignment
echo -e "\nTest 3: Task Assignment"
python3 agent_swarm.py td assign-task T1 GroupA
python3 agent_swarm.py td assign-task T2 GroupB
echo "✓ Tasks assigned"

# Test 4: Group can see their tasks
echo -e "\nTest 4: Group Task Visibility"
OUTPUT=$(python3 agent_swarm.py group GroupA my-tasks)
if echo "$OUTPUT" | grep -q "T1: Task1"; then
    echo "✓ Group can see their tasks"
else
    echo "✗ Group task visibility failed"
    exit 1
fi

# Test 5: Progress reporting
echo -e "\nTest 5: Progress Reporting"
python3 agent_swarm.py group GroupA report-progress T1 "Working on it"
if [ -f ".agent_swarm/GroupA.log" ]; then
    echo "✓ Progress logged"
else
    echo "✗ Progress logging failed"
    exit 1
fi

# Test 6: Task completion and unblocking
echo -e "\nTest 6: Task Completion and Unblocking"
python3 agent_swarm.py group GroupA complete-task T1
OUTPUT=$(python3 agent_swarm.py td list-tasks)
if echo "$OUTPUT" | grep -q "T2: Task2 \[in_progress\]"; then
    echo "✓ Task unblocking works"
else
    echo "✗ Task unblocking failed"
    echo "$OUTPUT"
    exit 1
fi

# Test 7: Messaging
echo -e "\nTest 7: Messaging"
python3 agent_swarm.py td send-message GroupB "Test message"
OUTPUT=$(python3 agent_swarm.py group GroupB read-messages)
if echo "$OUTPUT" | grep -q "Test message"; then
    echo "✓ Messaging works"
else
    echo "✗ Messaging failed"
    exit 1
fi

# Test 8: Log monitoring
echo -e "\nTest 8: Log Monitoring"
OUTPUT=$(python3 agent_swarm.py td monitor-logs GroupA)
if echo "$OUTPUT" | grep -q "Completed task T1"; then
    echo "✓ Log monitoring works"
else
    echo "✗ Log monitoring failed"
    exit 1
fi

# Test 9: Status filtering
echo -e "\nTest 9: Status Filtering"
OUTPUT=$(python3 agent_swarm.py td list-tasks --status completed)
if echo "$OUTPUT" | grep -q "T1" && ! echo "$OUTPUT" | grep -q "T2"; then
    echo "✓ Status filtering works"
else
    echo "✗ Status filtering failed"
    exit 1
fi

# Test 10: Multiple dependencies
echo -e "\nTest 10: Multiple Dependencies"
python3 agent_swarm.py td create-task T3 "Task3" "Description3"
python3 agent_swarm.py group GroupB complete-task T2
python3 agent_swarm.py td create-task T4 "Task4" "Depends on T2 and T3" --deps T2,T3
python3 agent_swarm.py td assign-task T4 GroupC
OUTPUT=$(python3 agent_swarm.py td list-tasks)
if echo "$OUTPUT" | grep -q "T4.*\[blocked\]"; then
    echo "✓ Multiple dependencies work (task blocked)"
else
    echo "✗ Multiple dependencies failed"
    exit 1
fi

# Complete T3 and verify T4 unblocks
python3 agent_swarm.py td assign-task T3 GroupA
python3 agent_swarm.py group GroupA complete-task T3
OUTPUT=$(python3 agent_swarm.py td list-tasks)
if echo "$OUTPUT" | grep -q "T4.*\[in_progress\]"; then
    echo "✓ Task unblocks when all dependencies complete"
else
    echo "✗ Multiple dependency unblocking failed"
    exit 1
fi

echo -e "\n=== All tests passed! ==="
