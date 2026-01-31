/**
 * Agent Swarm - 消息注入模块
 * 通过 tmux send-keys 向 Agent 发送消息
 */

const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');

const execAsync = promisify(exec);

const SWARM_DIR = path.join(process.env.HOME, '.agent-swarm');
const TASKS_FILE = path.join(SWARM_DIR, 'tasks.json');

class AgentInjector {
    constructor() {
        this.sessionPrefix = 'swarm-';
    }

    /**
     * 获取所有运行中的 Agent
     */
    async listAgents() {
        try {
            const { stdout } = await execAsync(
                "tmux list-sessions -F '#{session_name}' 2>/dev/null | grep '^swarm-' || true"
            );
            return stdout
                .trim()
                .split('\n')
                .filter(Boolean)
                .map(s => s.replace(this.sessionPrefix, ''));
        } catch {
            return [];
        }
    }

    /**
     * 检查 Agent 是否运行中
     */
    async isAgentRunning(name) {
        try {
            await execAsync(`tmux has-session -t ${this.sessionPrefix}${name} 2>/dev/null`);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * 向指定 Agent 发送消息
     */
    async sendMessage(target, message) {
        const escapedMessage = message.replace(/'/g, "'\\''");

        if (target === 'all') {
            // 广播
            const agents = await this.listAgents();
            const results = await Promise.all(
                agents.map(agent => this.sendToAgent(agent, message))
            );
            return { broadcast: true, agents, results };
        } else if (target.startsWith('@')) {
            // @mention 格式
            return this.sendToAgent(target.slice(1), message);
        } else {
            return this.sendToAgent(target, message);
        }
    }

    /**
     * 向单个 Agent 发送
     */
    async sendToAgent(name, message) {
        const session = `${this.sessionPrefix}${name}`;

        if (!(await this.isAgentRunning(name))) {
            return { success: false, error: `Agent ${name} 未运行` };
        }

        try {
            // 格式化消息
            const formattedMessage = `\n📨 [来自控制台] ${message}`;
            const escapedMessage = formattedMessage.replace(/'/g, "'\\''");

            await execAsync(`tmux send-keys -t '${session}' '${escapedMessage}' Enter`);

            return { success: true, agent: name };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * 创建任务并分配给 Agent
     */
    async createTask(task) {
        const tasks = await this.loadTasks();

        const newTask = {
            id: Date.now(),
            title: task.title,
            description: task.description || '',
            assignee: task.assignee,
            status: 'pending',
            createdAt: new Date().toISOString(),
            completedAt: null
        };

        tasks.push(newTask);
        await this.saveTasks(tasks);

        // 通知相关 Agent
        if (task.assignee) {
            await this.sendMessage(task.assignee,
                `📋 新任务 #${newTask.id}: ${task.title}\n${task.description || ''}`
            );
        }

        return newTask;
    }

    /**
     * 更新任务状态
     */
    async updateTask(taskId, updates) {
        const tasks = await this.loadTasks();
        const index = tasks.findIndex(t => t.id === taskId);

        if (index === -1) {
            throw new Error(`任务 ${taskId} 不存在`);
        }

        tasks[index] = { ...tasks[index], ...updates };

        if (updates.status === 'completed') {
            tasks[index].completedAt = new Date().toISOString();
        }

        await this.saveTasks(tasks);
        return tasks[index];
    }

    /**
     * 获取所有任务
     */
    async getTasks(filter = {}) {
        const tasks = await this.loadTasks();

        return tasks.filter(task => {
            if (filter.status && task.status !== filter.status) return false;
            if (filter.assignee && task.assignee !== filter.assignee) return false;
            return true;
        });
    }

    /**
     * 删除任务
     */
    async deleteTask(taskId) {
        const tasks = await this.loadTasks();
        const filtered = tasks.filter(t => t.id !== taskId);
        await this.saveTasks(filtered);
        return { deleted: taskId };
    }

    // 内部方法
    async loadTasks() {
        try {
            const data = await fs.readFile(TASKS_FILE, 'utf-8');
            return JSON.parse(data);
        } catch {
            return [];
        }
    }

    async saveTasks(tasks) {
        await fs.mkdir(SWARM_DIR, { recursive: true });
        await fs.writeFile(TASKS_FILE, JSON.stringify(tasks, null, 2));
    }
}

// HTTP Server (可选)
function startServer(port = 3456) {
    const http = require('http');
    const injector = new AgentInjector();

    const server = http.createServer(async (req, res) => {
        res.setHeader('Content-Type', 'application/json');

        const url = new URL(req.url, `http://localhost:${port}`);
        const path = url.pathname;

        try {
            // GET /agents - 列出所有 agent
            if (req.method === 'GET' && path === '/agents') {
                const agents = await injector.listAgents();
                res.end(JSON.stringify({ agents }));
            }
            // POST /send - 发送消息
            else if (req.method === 'POST' && path === '/send') {
                const body = await getBody(req);
                const { target, message } = JSON.parse(body);
                const result = await injector.sendMessage(target, message);
                res.end(JSON.stringify(result));
            }
            // GET /tasks - 获取任务
            else if (req.method === 'GET' && path === '/tasks') {
                const tasks = await injector.getTasks();
                res.end(JSON.stringify({ tasks }));
            }
            // POST /tasks - 创建任务
            else if (req.method === 'POST' && path === '/tasks') {
                const body = await getBody(req);
                const task = await injector.createTask(JSON.parse(body));
                res.end(JSON.stringify(task));
            }
            // PATCH /tasks/:id - 更新任务
            else if (req.method === 'PATCH' && path.startsWith('/tasks/')) {
                const taskId = parseInt(path.split('/')[2]);
                const body = await getBody(req);
                const task = await injector.updateTask(taskId, JSON.parse(body));
                res.end(JSON.stringify(task));
            }
            // DELETE /tasks/:id - 删除任务
            else if (req.method === 'DELETE' && path.startsWith('/tasks/')) {
                const taskId = parseInt(path.split('/')[2]);
                const result = await injector.deleteTask(taskId);
                res.end(JSON.stringify(result));
            }
            else {
                res.statusCode = 404;
                res.end(JSON.stringify({ error: 'Not Found' }));
            }
        } catch (error) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: error.message }));
        }
    });

    server.listen(port, () => {
        console.log(`Agent Swarm API 运行在 http://localhost:${port}`);
    });

    return server;
}

function getBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => resolve(body));
        req.on('error', reject);
    });
}

module.exports = { AgentInjector, startServer };

// 直接运行时启动服务器
if (require.main === module) {
    startServer();
}
