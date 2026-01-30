#!/usr/bin/env python3
"""
Agent Swarm - Multi-AI CLI collaboration tool

A tool that enables multiple AI assistants to work together on the same project.
Implements a role-based system with TD (Tech Director) managing tasks and Groups executing them.
"""

import json
import os
import sys
import time
import subprocess
import re
from datetime import datetime
from enum import Enum
from typing import List, Optional, Dict
from dataclasses import dataclass, asdict


class TaskStatus(Enum):
    """Task status enumeration"""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    BLOCKED = "blocked"


@dataclass
class Task:
    """Represents a task in the system"""
    id: str
    title: str
    description: str
    assigned_to: Optional[str] = None
    status: TaskStatus = TaskStatus.PENDING
    dependencies: List[str] = None
    created_at: str = None
    completed_at: Optional[str] = None
    
    def __post_init__(self):
        if self.dependencies is None:
            self.dependencies = []
        if self.created_at is None:
            self.created_at = datetime.now().isoformat()
    
    def to_dict(self):
        """Convert task to dictionary"""
        data = asdict(self)
        data['status'] = self.status.value
        return data
    
    @classmethod
    def from_dict(cls, data):
        """Create task from dictionary"""
        data = data.copy()
        data['status'] = TaskStatus(data['status'])
        return cls(**data)


def validate_id(id_str: str, name: str = "ID") -> bool:
    """Validate that an ID contains only safe characters"""
    if not id_str:
        print(f"Error: {name} cannot be empty")
        return False
    if not re.match(r'^[a-zA-Z0-9_-]+$', id_str):
        print(f"Error: {name} '{id_str}' contains invalid characters. Use only letters, numbers, underscores, and hyphens.")
        return False
    return True


@dataclass
class Message:
    """Represents a message in the system"""
    from_agent: str
    to_agent: str
    content: str
    timestamp: str = None
    
    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.now().isoformat()
    
    def to_dict(self):
        """Convert message to dictionary"""
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data):
        """Create message from dictionary"""
        return cls(**data)


class StateManager:
    """Manages the state of tasks and messages"""
    
    def __init__(self, state_dir=".agent_swarm"):
        self.state_dir = state_dir
        self.tasks_file = os.path.join(state_dir, "tasks.json")
        self.messages_file = os.path.join(state_dir, "messages.json")
        self.groups_file = os.path.join(state_dir, "groups.json")
        self._ensure_state_dir()
    
    def _ensure_state_dir(self):
        """Ensure state directory exists"""
        os.makedirs(self.state_dir, exist_ok=True)
    
    def save_tasks(self, tasks: Dict[str, Task]):
        """Save tasks to file"""
        try:
            with open(self.tasks_file, 'w') as f:
                json.dump({k: v.to_dict() for k, v in tasks.items()}, f, indent=2)
        except (IOError, OSError) as e:
            print(f"Error saving tasks: {e}")
            raise
    
    def load_tasks(self) -> Dict[str, Task]:
        """Load tasks from file"""
        if not os.path.exists(self.tasks_file):
            return {}
        try:
            with open(self.tasks_file, 'r') as f:
                data = json.load(f)
                return {k: Task.from_dict(v) for k, v in data.items()}
        except json.JSONDecodeError as e:
            print(f"Error: Corrupted tasks file. {e}")
            return {}
        except (IOError, OSError) as e:
            print(f"Error loading tasks: {e}")
            return {}
    
    def save_messages(self, messages: List[Message]):
        """Save messages to file"""
        try:
            with open(self.messages_file, 'w') as f:
                json.dump([m.to_dict() for m in messages], f, indent=2)
        except (IOError, OSError) as e:
            print(f"Error saving messages: {e}")
            raise
    
    def load_messages(self) -> List[Message]:
        """Load messages from file"""
        if not os.path.exists(self.messages_file):
            return []
        try:
            with open(self.messages_file, 'r') as f:
                data = json.load(f)
                return [Message.from_dict(m) for m in data]
        except json.JSONDecodeError as e:
            print(f"Error: Corrupted messages file. {e}")
            return []
        except (IOError, OSError) as e:
            print(f"Error loading messages: {e}")
            return []
    
    def append_message(self, message: Message):
        """Append a message to the message log"""
        messages = self.load_messages()
        messages.append(message)
        self.save_messages(messages)
    
    def save_groups(self, groups: Dict[str, dict]):
        """Save group information"""
        try:
            with open(self.groups_file, 'w') as f:
                json.dump(groups, f, indent=2)
        except (IOError, OSError) as e:
            print(f"Error saving groups: {e}")
            raise
    
    def load_groups(self) -> Dict[str, dict]:
        """Load group information"""
        if not os.path.exists(self.groups_file):
            return {}
        try:
            with open(self.groups_file, 'r') as f:
                return json.load(f)
        except json.JSONDecodeError as e:
            print(f"Error: Corrupted groups file. {e}")
            return {}
        except (IOError, OSError) as e:
            print(f"Error loading groups: {e}")
            return {}
    
    def get_log_file(self, agent_name: str) -> str:
        """Get log file path for an agent"""
        return os.path.join(self.state_dir, f"{agent_name}.log")
    
    def append_log(self, agent_name: str, message: str):
        """Append a log message for an agent"""
        log_file = self.get_log_file(agent_name)
        timestamp = datetime.now().isoformat()
        with open(log_file, 'a') as f:
            f.write(f"[{timestamp}] {message}\n")


class TmuxManager:
    """Manages tmux sessions and messaging"""
    
    @staticmethod
    def check_tmux_available() -> bool:
        """Check if tmux is available"""
        try:
            subprocess.run(['tmux', '-V'], capture_output=True, check=True)
            return True
        except (subprocess.CalledProcessError, FileNotFoundError):
            return False
    
    @staticmethod
    def get_session_name(agent_name: str) -> str:
        """Get tmux session name for an agent"""
        return f"agent_swarm_{agent_name}"
    
    @staticmethod
    def session_exists(session_name: str) -> bool:
        """Check if a tmux session exists"""
        try:
            result = subprocess.run(
                ['tmux', 'has-session', '-t', session_name],
                capture_output=True
            )
            return result.returncode == 0
        except FileNotFoundError:
            return False
    
    @staticmethod
    def send_message(session_name: str, message: str):
        """Send a message to a tmux session"""
        try:
            # Send the message as a comment (won't be executed)
            subprocess.run(
                ['tmux', 'send-keys', '-t', session_name, f"# MESSAGE: {message}", 'Enter'],
                check=True
            )
        except subprocess.CalledProcessError as e:
            print(f"Warning: Failed to send message to {session_name}: {e}")


class TechDirector:
    """Tech Director - manages tasks and coordinates groups"""
    
    def __init__(self, state_dir=".agent_swarm"):
        self.state = StateManager(state_dir)
        self.tmux = TmuxManager()
        self.agent_name = "TD"
        self.tasks = self.state.load_tasks()
    
    def create_task(self, task_id: str, title: str, description: str, dependencies: List[str] = None):
        """Create a new task"""
        # Validate task ID
        if not validate_id(task_id, "Task ID"):
            return False
        
        if task_id in self.tasks:
            print(f"Error: Task {task_id} already exists")
            return False
        
        # Validate dependencies
        if dependencies:
            for dep_id in dependencies:
                if dep_id not in self.tasks:
                    print(f"Error: Dependency {dep_id} does not exist")
                    return False
        
        task = Task(
            id=task_id,
            title=title,
            description=description,
            dependencies=dependencies or []
        )
        self.tasks[task_id] = task
        self.state.save_tasks(self.tasks)
        self.state.append_log("TD", f"Created task {task_id}: {title}")
        print(f"Task {task_id} created successfully")
        return True
    
    def assign_task(self, task_id: str, group_name: str):
        """Assign a task to a group"""
        # Validate group name
        if not validate_id(group_name, "Group name"):
            return False
        
        if task_id not in self.tasks:
            print(f"Error: Task {task_id} does not exist")
            return False
        
        task = self.tasks[task_id]
        task.assigned_to = group_name
        
        # Check if dependencies are completed
        if not self._check_dependencies(task):
            task.status = TaskStatus.BLOCKED
            self.state.save_tasks(self.tasks)
            self.state.append_log("TD", f"Assigned task {task_id} to {group_name} (blocked by dependencies)")
            print(f"Task {task_id} assigned to {group_name} (blocked by dependencies)")
            return True
        
        task.status = TaskStatus.IN_PROGRESS
        self.state.save_tasks(self.tasks)
        
        # Send message to group
        message = Message(
            from_agent="TD",
            to_agent=group_name,
            content=f"Assigned task {task_id}: {task.title}"
        )
        self.state.append_message(message)
        self.state.append_log("TD", f"Assigned task {task_id} to {group_name}")
        
        # Send via tmux if available
        session_name = self.tmux.get_session_name(group_name)
        if self.tmux.session_exists(session_name):
            self.tmux.send_message(session_name, f"New task assigned: {task_id} - {task.title}")
        
        print(f"Task {task_id} assigned to {group_name}")
        return True
    
    def complete_task(self, task_id: str):
        """Mark a task as completed"""
        if task_id not in self.tasks:
            print(f"Error: Task {task_id} does not exist")
            return False
        
        task = self.tasks[task_id]
        
        # Validate task state
        if task.status == TaskStatus.COMPLETED:
            print(f"Warning: Task {task_id} is already completed")
            return True
        
        if task.status == TaskStatus.BLOCKED:
            print(f"Error: Cannot complete task {task_id} - it is blocked by dependencies")
            return False
        
        task.status = TaskStatus.COMPLETED
        task.completed_at = datetime.now().isoformat()
        self.state.save_tasks(self.tasks)
        self.state.append_log("TD", f"Completed task {task_id}")
        
        # Unblock dependent tasks
        self._unblock_dependent_tasks(task_id)
        
        print(f"Task {task_id} marked as completed")
        return True
    
    def _check_dependencies(self, task: Task) -> bool:
        """Check if all dependencies are completed"""
        for dep_id in task.dependencies:
            if dep_id not in self.tasks:
                return False
            if self.tasks[dep_id].status != TaskStatus.COMPLETED:
                return False
        return True
    
    def _unblock_dependent_tasks(self, task_id: str):
        """Unblock tasks that depend on the completed task"""
        for tid, task in self.tasks.items():
            if task_id in task.dependencies and task.status == TaskStatus.BLOCKED:
                if self._check_dependencies(task):
                    task.status = TaskStatus.IN_PROGRESS
                    self.state.append_log("TD", f"Unblocked task {tid}")
                    
                    # Send message to group that task is unblocked
                    if task.assigned_to:
                        message = Message(
                            from_agent="TD",
                            to_agent=task.assigned_to,
                            content=f"Task {tid} is now unblocked and ready to work on"
                        )
                        self.state.append_message(message)
                        
                        # Send via tmux if available
                        session_name = self.tmux.get_session_name(task.assigned_to)
                        if self.tmux.session_exists(session_name):
                            self.tmux.send_message(session_name, f"Task {tid} is now unblocked!")
        self.state.save_tasks(self.tasks)
    
    def list_tasks(self, status_filter: Optional[str] = None):
        """List all tasks or filter by status"""
        if not self.tasks:
            print("No tasks found")
            return
        
        print("\n=== Tasks ===")
        for task_id, task in sorted(self.tasks.items()):
            if status_filter and task.status.value != status_filter:
                continue
            
            deps_str = f" [deps: {', '.join(task.dependencies)}]" if task.dependencies else ""
            assigned_str = f" -> {task.assigned_to}" if task.assigned_to else ""
            print(f"{task_id}: {task.title} [{task.status.value}]{assigned_str}{deps_str}")
        print()
    
    def monitor_logs(self, group_name: Optional[str] = None):
        """Monitor logs from groups"""
        if group_name:
            log_file = self.state.get_log_file(group_name)
            if os.path.exists(log_file):
                with open(log_file, 'r') as f:
                    print(f"\n=== {group_name} Logs ===")
                    print(f.read())
            else:
                print(f"No logs found for {group_name}")
        else:
            # Show all logs
            groups = self.state.load_groups()
            for gname in groups.keys():
                self.monitor_logs(gname)
    
    def send_message(self, to_agent: str, content: str):
        """Send a message to a group"""
        message = Message(
            from_agent="TD",
            to_agent=to_agent,
            content=content
        )
        self.state.append_message(message)
        self.state.append_log("TD", f"Sent message to {to_agent}: {content}")
        
        # Send via tmux if available
        session_name = self.tmux.get_session_name(to_agent)
        if self.tmux.session_exists(session_name):
            self.tmux.send_message(session_name, content)
        
        print(f"Message sent to {to_agent}")


class Group:
    """Group - executes tasks assigned by TD"""
    
    def __init__(self, name: str, state_dir=".agent_swarm"):
        # Validate group name
        if not validate_id(name, "Group name"):
            raise ValueError(f"Invalid group name: {name}")
        
        self.name = name
        self.state = StateManager(state_dir)
        self.tmux = TmuxManager()
        
        # Register group
        groups = self.state.load_groups()
        if name not in groups:
            groups[name] = {
                "name": name,
                "created_at": datetime.now().isoformat()
            }
            self.state.save_groups(groups)
    
    def my_tasks(self):
        """Show tasks assigned to this group"""
        tasks = self.state.load_tasks()
        my_tasks = {tid: t for tid, t in tasks.items() if t.assigned_to == self.name}
        
        if not my_tasks:
            print(f"No tasks assigned to {self.name}")
            return
        
        print(f"\n=== Tasks for {self.name} ===")
        for task_id, task in sorted(my_tasks.items()):
            print(f"{task_id}: {task.title} [{task.status.value}]")
            print(f"  Description: {task.description}")
        print()
    
    def report_progress(self, task_id: str, progress_message: str):
        """Report progress on a task"""
        tasks = self.state.load_tasks()
        if task_id not in tasks:
            print(f"Error: Task {task_id} does not exist")
            return False
        
        task = tasks[task_id]
        if task.assigned_to != self.name:
            print(f"Error: Task {task_id} is not assigned to {self.name}")
            return False
        
        # Log progress
        self.state.append_log(self.name, f"Progress on {task_id}: {progress_message}")
        
        # Send message to TD
        message = Message(
            from_agent=self.name,
            to_agent="TD",
            content=f"Progress on {task_id}: {progress_message}"
        )
        self.state.append_message(message)
        
        # Send via tmux if available
        session_name = self.tmux.get_session_name("TD")
        if self.tmux.session_exists(session_name):
            self.tmux.send_message(session_name, f"{self.name} reports: {progress_message}")
        
        print(f"Progress reported for task {task_id}")
        return True
    
    def complete_task(self, task_id: str):
        """Mark a task as completed"""
        tasks = self.state.load_tasks()
        if task_id not in tasks:
            print(f"Error: Task {task_id} does not exist")
            return False
        
        task = tasks[task_id]
        if task.assigned_to != self.name:
            print(f"Error: Task {task_id} is not assigned to {self.name}")
            return False
        
        # Validate task state
        if task.status == TaskStatus.COMPLETED:
            print(f"Warning: Task {task_id} is already completed")
            return True
        
        if task.status == TaskStatus.BLOCKED:
            print(f"Error: Cannot complete task {task_id} - it is blocked by dependencies")
            return False
        
        task.status = TaskStatus.COMPLETED
        task.completed_at = datetime.now().isoformat()
        
        # Unblock dependent tasks
        self._unblock_dependent_tasks(task_id, tasks)
        
        self.state.save_tasks(tasks)
        
        # Log completion
        self.state.append_log(self.name, f"Completed task {task_id}")
        
        # Send message to TD
        message = Message(
            from_agent=self.name,
            to_agent="TD",
            content=f"Task {task_id} completed"
        )
        self.state.append_message(message)
        
        # Send via tmux if available
        session_name = self.tmux.get_session_name("TD")
        if self.tmux.session_exists(session_name):
            self.tmux.send_message(session_name, f"{self.name} completed task: {task_id}")
        
        print(f"Task {task_id} marked as completed")
        return True
    
    def _check_dependencies(self, task: Task, tasks: Dict[str, Task]) -> bool:
        """Check if all dependencies are completed"""
        for dep_id in task.dependencies:
            if dep_id not in tasks:
                return False
            if tasks[dep_id].status != TaskStatus.COMPLETED:
                return False
        return True
    
    def _unblock_dependent_tasks(self, task_id: str, tasks: Dict[str, Task]):
        """Unblock tasks that depend on the completed task"""
        for tid, task in tasks.items():
            if task_id in task.dependencies and task.status == TaskStatus.BLOCKED:
                if self._check_dependencies(task, tasks):
                    task.status = TaskStatus.IN_PROGRESS
                    self.state.append_log(self.name, f"Unblocked task {tid}")
                    
                    # Send message to assigned group that task is unblocked
                    if task.assigned_to:
                        message = Message(
                            from_agent=self.name,
                            to_agent=task.assigned_to,
                            content=f"Task {tid} is now unblocked and ready to work on (dependency {task_id} completed)"
                        )
                        self.state.append_message(message)
                        
                        # Send via tmux if available
                        session_name = self.tmux.get_session_name(task.assigned_to)
                        if self.tmux.session_exists(session_name):
                            self.tmux.send_message(session_name, f"Task {tid} is now unblocked!")

    
    def read_messages(self):
        """Read messages for this group"""
        messages = self.state.load_messages()
        my_messages = [m for m in messages if m.to_agent == self.name]
        
        if not my_messages:
            print(f"No messages for {self.name}")
            return
        
        print(f"\n=== Messages for {self.name} ===")
        for msg in my_messages[-10:]:  # Show last 10 messages
            print(f"[{msg.timestamp}] From {msg.from_agent}: {msg.content}")
        print()


def main():
    """Main entry point"""
    if len(sys.argv) < 2:
        print("Usage: agent_swarm.py <command> [args...]")
        print("\nTech Director Commands:")
        print("  td create-task <id> <title> <description> [--deps dep1,dep2,...]")
        print("  td assign-task <id> <group>")
        print("  td complete-task <id>")
        print("  td list-tasks [--status <status>]")
        print("  td monitor-logs [<group>]")
        print("  td send-message <group> <message>")
        print("\nGroup Commands:")
        print("  group <name> my-tasks")
        print("  group <name> report-progress <task-id> <message>")
        print("  group <name> complete-task <task-id>")
        print("  group <name> read-messages")
        return 1
    
    command = sys.argv[1]
    
    if command == "td":
        # Tech Director commands
        if len(sys.argv) < 3:
            print("Error: TD command required")
            return 1
        
        td = TechDirector()
        td_command = sys.argv[2]
        
        if td_command == "create-task":
            if len(sys.argv) < 6:
                print("Error: create-task requires <id> <title> <description>")
                return 1
            task_id = sys.argv[3]
            title = sys.argv[4]
            description = sys.argv[5]
            dependencies = []
            if len(sys.argv) > 6 and sys.argv[6] == "--deps":
                dependencies = sys.argv[7].split(',') if len(sys.argv) > 7 else []
            td.create_task(task_id, title, description, dependencies)
        
        elif td_command == "assign-task":
            if len(sys.argv) < 5:
                print("Error: assign-task requires <id> <group>")
                return 1
            td.assign_task(sys.argv[3], sys.argv[4])
        
        elif td_command == "complete-task":
            if len(sys.argv) < 4:
                print("Error: complete-task requires <id>")
                return 1
            td.complete_task(sys.argv[3])
        
        elif td_command == "list-tasks":
            status_filter = None
            if len(sys.argv) > 3 and sys.argv[3] == "--status":
                status_filter = sys.argv[4] if len(sys.argv) > 4 else None
            td.list_tasks(status_filter)
        
        elif td_command == "monitor-logs":
            group = sys.argv[3] if len(sys.argv) > 3 else None
            td.monitor_logs(group)
        
        elif td_command == "send-message":
            if len(sys.argv) < 5:
                print("Error: send-message requires <group> <message>")
                return 1
            to_agent = sys.argv[3]
            message = ' '.join(sys.argv[4:])
            td.send_message(to_agent, message)
        
        else:
            print(f"Error: Unknown TD command: {td_command}")
            return 1
    
    elif command == "group":
        # Group commands
        if len(sys.argv) < 4:
            print("Error: group command requires <name> <action>")
            return 1
        
        group_name = sys.argv[2]
        group_command = sys.argv[3]
        group = Group(group_name)
        
        if group_command == "my-tasks":
            group.my_tasks()
        
        elif group_command == "report-progress":
            if len(sys.argv) < 6:
                print("Error: report-progress requires <task-id> <message>")
                return 1
            task_id = sys.argv[4]
            message = ' '.join(sys.argv[5:])
            group.report_progress(task_id, message)
        
        elif group_command == "complete-task":
            if len(sys.argv) < 5:
                print("Error: complete-task requires <task-id>")
                return 1
            group.complete_task(sys.argv[4])
        
        elif group_command == "read-messages":
            group.read_messages()
        
        else:
            print(f"Error: Unknown group command: {group_command}")
            return 1
    
    else:
        print(f"Error: Unknown command: {command}")
        return 1
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
