/**
 * Agent Swarm - Project Management Module
 * Manages project config, tasks, logs, and messages
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SWARM_BASE = path.join(process.env.HOME, '.agent-swarm', 'projects');

class Project {
    constructor(projectName) {
        this.name = projectName;
        this.dir = path.join(SWARM_BASE, projectName);
        this.configFile = path.join(this.dir, 'config.json');
        this.tasksFile = path.join(this.dir, 'tasks.json');
        this.logsDir = path.join(this.dir, 'logs');
        this.inboxDir = path.join(this.dir, 'inbox');
    }

    /** Initialize project */
    init(tdSession = null) {
        fs.mkdirSync(this.dir, { recursive: true });
        fs.mkdirSync(this.logsDir, { recursive: true });
        fs.mkdirSync(this.inboxDir, { recursive: true });

        const config = {
            name: this.name,
            createdAt: new Date().toISOString(),
            td: tdSession,
            groups: [],
            taskVersion: 0
        };
        this.saveConfig(config);
        this.saveTasks([]);
        return config;
    }

    exists() {
        return fs.existsSync(this.configFile);
    }

    // ===== Config =====
    getConfig() {
        try {
            return JSON.parse(fs.readFileSync(this.configFile, 'utf-8'));
        } catch { return null; }
    }

    saveConfig(config) {
        fs.writeFileSync(this.configFile, JSON.stringify(config, null, 2));
    }

    registerGroup(groupId, tmuxSession) {
        const config = this.getConfig();
        config.groups = config.groups.filter(g => g.id !== groupId);
        config.groups.push({
            id: groupId,
            session: tmuxSession,
            joinedAt: new Date().toISOString(),
            status: 'active'
        });
        this.saveConfig(config);

        // Create log and inbox files
        const logFile = path.join(this.logsDir, `${groupId}.log`);
        const inboxFile = path.join(this.inboxDir, `${groupId}.msg`);
        if (!fs.existsSync(logFile)) fs.writeFileSync(logFile, '');
        if (!fs.existsSync(inboxFile)) fs.writeFileSync(inboxFile, '');

        return config;
    }

    getGroups() {
        return this.getConfig()?.groups || [];
    }

    // ===== Tasks =====
    getTasks() {
        try {
            return JSON.parse(fs.readFileSync(this.tasksFile, 'utf-8'));
        } catch { return []; }
    }

    saveTasks(tasks) {
        fs.writeFileSync(this.tasksFile, JSON.stringify(tasks, null, 2));
        const config = this.getConfig();
        config.taskVersion = (config.taskVersion || 0) + 1;
        this.saveConfig(config);
    }

    createTask(task) {
        const tasks = this.getTasks();
        const newTask = {
            id: Date.now(),
            title: task.title,
            description: task.description || '',
            assignee: task.assignee,
            status: 'pending',
            blocks: [],      // Task IDs that this task blocks
            blockedBy: [],   // Task IDs that block this task
            createdAt: new Date().toISOString(),
            completedAt: null
        };
        tasks.push(newTask);
        this.saveTasks(tasks);

        if (task.assignee) {
            this.notifyGroup(task.assignee, { type: 'new_task', task: newTask });
        }
        return newTask;
    }

    /**
     * Add task dependency relationship
     * @param {number} blockerId - Blocker task ID
     * @param {number} blockedId - Blocked task ID
     */
    addBlockRelation(blockerId, blockedId) {
        const tasks = this.getTasks();
        const blocker = tasks.find(t => t.id === blockerId);
        const blocked = tasks.find(t => t.id === blockedId);

        if (!blocker || !blocked) {
            return { error: 'Task not found' };
        }
        if (blockerId === blockedId) {
            return { error: 'Task cannot block itself' };
        }

        // Check for circular dependency
        if (this._hasCircularDep(tasks, blockedId, blockerId)) {
            return { error: 'Circular dependency detected' };
        }

        // Initialize arrays
        blocker.blocks = blocker.blocks || [];
        blocked.blockedBy = blocked.blockedBy || [];

        // Add relationship (avoid duplicates)
        if (!blocker.blocks.includes(blockedId)) {
            blocker.blocks.push(blockedId);
        }
        if (!blocked.blockedBy.includes(blockerId)) {
            blocked.blockedBy.push(blockerId);
        }

        this.saveTasks(tasks);
        return { success: true, blocker, blocked };
    }

    /**
     * Remove task dependency relationship
     */
    removeBlockRelation(blockerId, blockedId) {
        const tasks = this.getTasks();
        const blocker = tasks.find(t => t.id === blockerId);
        const blocked = tasks.find(t => t.id === blockedId);

        if (!blocker || !blocked) {
            return { error: 'Task not found' };
        }

        blocker.blocks = (blocker.blocks || []).filter(id => id !== blockedId);
        blocked.blockedBy = (blocked.blockedBy || []).filter(id => id !== blockerId);

        this.saveTasks(tasks);
        return { success: true };
    }

    /**
     * Check for circular dependency (DFS)
     */
    _hasCircularDep(tasks, startId, targetId, visited = new Set()) {
        if (startId === targetId) return true;
        if (visited.has(startId)) return false;

        visited.add(startId);
        const task = tasks.find(t => t.id === startId);
        if (!task || !task.blocks) return false;

        for (const blockedId of task.blocks) {
            if (this._hasCircularDep(tasks, blockedId, targetId, visited)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Get incomplete blockers for a task
     */
    getBlockers(taskId) {
        const tasks = this.getTasks();
        const task = tasks.find(t => t.id === taskId);
        if (!task || !task.blockedBy) return [];

        return task.blockedBy
            .map(id => tasks.find(t => t.id === id))
            .filter(t => t && t.status !== 'completed');
    }

    /**
     * Check if task can be started
     */
    canStartTask(taskId) {
        return this.getBlockers(taskId).length === 0;
    }

    updateTask(taskId, updates) {
        const tasks = this.getTasks();
        const index = tasks.findIndex(t => t.id === taskId);
        if (index === -1) return null;

        tasks[index] = { ...tasks[index], ...updates };
        if (updates.status === 'completed') {
            tasks[index].completedAt = new Date().toISOString();
        }
        this.saveTasks(tasks);

        // 任务内容改变时通知
        if (updates.title || updates.description) {
            const assignee = tasks[index].assignee;
            if (assignee) {
                this.notifyGroup(assignee, { type: 'task_updated', task: tasks[index] });
            }
        }
        return tasks[index];
    }

    completeTask(taskId, groupId) {
        const tasks = this.getTasks();
        const task = tasks.find(t => t.id === taskId);
        // TD can operate all tasks, other roles can only operate tasks assigned to them
        if (!task || (groupId !== 'TD' && task.assignee !== groupId)) {
            return { error: 'No permission to operate this task' };
        }

        // Check if blocked
        const blockers = this.getBlockers(taskId);
        if (blockers.length > 0) {
            const blockerTitles = blockers.map(t => `#${this._getTaskIndex(t.id)} ${t.title}`).join(', ');
            return { error: `Task is blocked, complete first: ${blockerTitles}` };
        }

        return this.updateTask(taskId, { status: 'completed' });
    }

    /**
     * Get task display index in list (1-based)
     */
    _getTaskIndex(taskId) {
        const tasks = this.getTasks();
        const index = tasks.findIndex(t => t.id === taskId);
        return index >= 0 ? index + 1 : 0;
    }

    uncompleteTask(taskId, groupId) {
        const task = this.getTasks().find(t => t.id === taskId);
        // TD can operate all tasks, other roles can only operate tasks assigned to them
        if (!task || (groupId !== 'TD' && task.assignee !== groupId)) {
            return { error: 'No permission to operate this task' };
        }
        return this.updateTask(taskId, { status: 'pending', completedAt: null });
    }

    getTasksForGroup(groupId) {
        return this.getTasks().filter(t => t.assignee === groupId);
    }

    deleteTask(taskId) {
        const tasks = this.getTasks().filter(t => t.id !== taskId);
        this.saveTasks(tasks);
    }

    // ===== Logs =====
    writeLog(groupId, content) {
        const logFile = path.join(this.logsDir, `${groupId}.log`);
        const timestamp = new Date().toISOString();
        const entry = `[${timestamp}] ${content}\n`;
        fs.appendFileSync(logFile, entry);
        return { success: true, timestamp };
    }

    readLogs(groupId = null, lines = 50) {
        if (groupId) {
            const logFile = path.join(this.logsDir, `${groupId}.log`);
            try {
                const content = fs.readFileSync(logFile, 'utf-8');
                return content.split('\n').filter(Boolean).slice(-lines);
            } catch { return []; }
        } else {
            const logs = {};
            for (const group of this.getGroups()) {
                logs[group.id] = this.readLogs(group.id, lines);
            }
            return logs;
        }
    }

    getLogFile(groupId) {
        return path.join(this.logsDir, `${groupId}.log`);
    }

    /** Clear all logs */
    clearAllLogs() {
        const files = fs.readdirSync(this.logsDir).filter(f => f.endsWith('.log'));
        for (const file of files) {
            fs.writeFileSync(path.join(this.logsDir, file), '');
        }
        return files.length;
    }

    // ===== Messages =====
    notifyGroup(groupId, message) {
        const group = this.getGroups().find(g => g.id === groupId);
        if (group?.session) {
            this.injectToSession(group.session, message);
        }
    }

    sendMessage(fromRole, toGroupId, content) {
        this.notifyGroup(toGroupId, { type: 'message', from: fromRole, content });
        return { success: true };
    }

    broadcast(fromRole, content) {
        const groups = this.getGroups();
        for (const group of groups) {
            this.sendMessage(fromRole, group.id, content);
        }
        return { success: true, notified: groups.map(g => g.id) };
    }

    injectToSession(sessionName, message) {
        let text = '';
        switch (message.type) {
            case 'new_task':
                text = `\n[New Task #${message.task.id}] ${message.task.title}\n${message.task.description || 'No description'}\n`;
                break;
            case 'task_updated':
                text = `\n[Task Updated #${message.task.id}] ${message.task.title}\n${message.task.description || 'No description'}\n`;
                break;
            case 'message':
                text = `\n[From ${message.from}] ${message.content}\n`;
                break;
            case 'log':
                text = `\n[${message.from} Log] ${message.content}\n`;
                break;
            default:
                text = `\n${JSON.stringify(message)}\n`;
        }

        try {
            // Note: This is a local tool, input comes from trusted source
            const escaped = text.replace(/'/g, "'\\''").replace(/\n/g, '\\n');
            execSync(`tmux send-keys -t '${sessionName}' $'${escaped}' Enter`, { stdio: 'ignore' });
        } catch { /* Session may not exist */ }
    }

    // ===== Status =====
    getStatus() {
        const config = this.getConfig();
        const tasks = this.getTasks();
        const groups = this.getGroups();

        return {
            project: this.name,
            td: config?.td,
            taskVersion: config?.taskVersion || 0,
            groups: groups.map(g => ({
                id: g.id,
                status: g.status,
                taskCount: tasks.filter(t => t.assignee === g.id).length,
                completedCount: tasks.filter(t => t.assignee === g.id && t.status === 'completed').length
            })),
            totalTasks: tasks.length,
            completedTasks: tasks.filter(t => t.status === 'completed').length
        };
    }
}

// Utility functions
function getCurrentProject() {
    const name = process.env.SWARM_PROJECT;
    if (!name) throw new Error('SWARM_PROJECT not set');
    return new Project(name);
}

function getCurrentRole() {
    const role = process.env.SWARM_ROLE;
    if (!role) throw new Error('SWARM_ROLE not set');
    return role;
}

function listProjects() {
    try {
        return fs.readdirSync(SWARM_BASE).filter(name =>
            fs.existsSync(path.join(SWARM_BASE, name, 'config.json'))
        );
    } catch { return []; }
}

module.exports = { Project, getCurrentProject, getCurrentRole, listProjects, SWARM_BASE };
