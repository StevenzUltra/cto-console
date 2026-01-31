/**
 * Agent Swarm - 文件监听模块
 * TD 监听所有组的日志文件变化
 */

const fs = require('fs');
const path = require('path');
const { Project, getCurrentProject, getCurrentRole } = require('./project');

class LogWatcher {
    constructor(project) {
        this.project = project;
        this.watchers = new Map();  // groupId -> { watcher, lastSize }
        this.onLogCallback = null;
    }

    /**
     * 开始监听所有组的日志
     */
    start() {
        const groups = this.project.getGroups();

        for (const group of groups) {
            this.watchGroup(group.id);
        }

        // 定期检查新组
        this.checkInterval = setInterval(() => {
            const currentGroups = this.project.getGroups();
            for (const group of currentGroups) {
                if (!this.watchers.has(group.id)) {
                    this.watchGroup(group.id);
                }
            }
        }, 5000);

        console.log(`👁️ 开始监听日志 (${groups.length} 个组)`);
        return this;
    }

    /**
     * 监听单个组的日志
     */
    watchGroup(groupId) {
        const logFile = this.project.getLogFile(groupId);

        if (!fs.existsSync(logFile)) {
            fs.writeFileSync(logFile, '');
        }

        const stat = fs.statSync(logFile);
        let lastSize = stat.size;

        // 使用轮询而非 fs.watch（更可靠）
        const interval = setInterval(() => {
            try {
                const currentStat = fs.statSync(logFile);
                if (currentStat.size > lastSize) {
                    // 文件增长了，读取新内容
                    const fd = fs.openSync(logFile, 'r');
                    const buffer = Buffer.alloc(currentStat.size - lastSize);
                    fs.readSync(fd, buffer, 0, buffer.length, lastSize);
                    fs.closeSync(fd);

                    const newContent = buffer.toString('utf-8').trim();
                    if (newContent && this.onLogCallback) {
                        // 解析日志条目
                        const lines = newContent.split('\n').filter(Boolean);
                        for (const line of lines) {
                            this.onLogCallback(groupId, line);
                        }
                    }

                    lastSize = currentStat.size;
                }
            } catch (e) {
                // 文件可能被删除或不可访问
            }
        }, 1000);

        this.watchers.set(groupId, { interval, lastSize });
    }

    /**
     * 设置日志回调
     */
    onLog(callback) {
        this.onLogCallback = callback;
        return this;
    }

    /**
     * 停止监听
     */
    stop() {
        for (const [groupId, { interval }] of this.watchers) {
            clearInterval(interval);
        }
        this.watchers.clear();

        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }
    }
}

class TaskWatcher {
    constructor(project, role) {
        this.project = project;
        this.role = role;
        this.lastTaskVersion = 0;
        this.notifiedTasks = new Set();
        this.onTaskCallback = null;
    }

    /**
     * 开始监听任务
     */
    start(interval = 2000) {
        // 初始获取任务
        this.checkTasks();

        this.watchInterval = setInterval(() => {
            this.checkTasks();
        }, interval);

        return this;
    }

    /**
     * 检查任务更新
     */
    checkTasks() {
        const config = this.project.getConfig();
        const currentVersion = config?.taskVersion || 0;

        if (currentVersion > this.lastTaskVersion) {
            const tasks = this.role === 'TD'
                ? this.project.getTasks()
                : this.project.getTasksForGroup(this.role);

            for (const task of tasks) {
                const taskKey = `${task.id}-${task.title}-${task.description}-${task.status}`;

                if (!this.notifiedTasks.has(taskKey)) {
                    if (this.onTaskCallback) {
                        this.onTaskCallback(task);
                    }
                    this.notifiedTasks.add(taskKey);
                }
            }

            this.lastTaskVersion = currentVersion;
        }
    }

    /**
     * 设置任务回调
     */
    onTask(callback) {
        this.onTaskCallback = callback;
        return this;
    }

    /**
     * 停止监听
     */
    stop() {
        if (this.watchInterval) {
            clearInterval(this.watchInterval);
        }
    }
}

/**
 * TD 专用：监听所有日志并注入到终端
 */
function startTDWatcher(project, tdSession) {
    const logWatcher = new LogWatcher(project);

    logWatcher.onLog((groupId, logLine) => {
        // 解析日志行: [timestamp] content
        const match = logLine.match(/^\[([^\]]+)\]\s*(.*)$/);
        const content = match ? match[2] : logLine;

        // 注入到 TD 终端
        project.injectToSession(tdSession, {
            type: 'log',
            from: groupId,
            content
        });
    });

    logWatcher.start();

    return logWatcher;
}

module.exports = {
    LogWatcher,
    TaskWatcher,
    startTDWatcher
};
