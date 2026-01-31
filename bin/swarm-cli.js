#!/usr/bin/env node
/**
 * Agent Swarm CLI - Multi AI Collaboration Tool
 *
 * Environment Variables:
 *   SWARM_PROJECT - Project name
 *   SWARM_ROLE    - Role (TD/A/B/C...)
 */

const { Project, getCurrentProject, getCurrentRole, listProjects } = require('../lib/project');
const { startTDWatcher, TaskWatcher } = require('../lib/watcher');
const { execSync, spawnSync } = require('child_process');

// ===== tmux message injection =====
function injectToSession(sessionName, message) {
    if (!sessionName) return false;
    try {
        // Escape special characters (shell and tmux)
        const escaped = message
            .replace(/\\/g, '\\\\')  // backslash
            .replace(/"/g, '\\"')    // double quote
            .replace(/\$/g, '\\$')   // dollar sign
            .replace(/`/g, '\\`')    // backtick
            .replace(/!/g, '\\!')    // exclamation
            .replace(/\n/g, ' ');    // newline to space

        // Send in steps: text → short delay → Enter (improve success rate)
        execSync(`tmux send-keys -t "${sessionName}" "[SWARM] ${escaped}"`, { stdio: 'ignore' });
        execSync('sleep 0.1', { stdio: 'ignore' }); // 100ms delay
        execSync(`tmux send-keys -t "${sessionName}" Enter`, { stdio: 'ignore' });
        return true;
    } catch {
        return false; // session doesn't exist or not running
    }
}

function getTDSession(project) {
    const config = project.getConfig();
    return config?.td || null;
}

function getGroupSession(project, groupId) {
    const config = project.getConfig();
    const group = config?.groups?.find(g => g.id === groupId);
    return group?.session || null;
}

// Colors
const c = {
    reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m',
    yellow: '\x1b[33m', blue: '\x1b[34m', cyan: '\x1b[36m', bold: '\x1b[1m'
};

const [,, cmd, ...args] = process.argv;

// ===== Main Entry =====
async function main() {
    try {
        switch (cmd) {
            case 'init': return initProject(args[0]);
            case 'list': return listAllProjects();
            case 'status': return showStatus();
            case 'register': return registerGroup(args[0]);
            case 'groups': return showGroups();
            case 'start': return startAgent(args[0], args[1]);
            case 'stop': return stopAgent(args[0]);
            case 'stop-all': return stopAllAgents();
            case 'attach': return attachAgent(args[0]);
            case 'task': return createTask(args);
            case 'tasks': return showTasks();
            case 'assign': return assignTask(parseInt(args[0]), args[1]);
            case 'done': return completeTask(parseInt(args[0]));
            case 'undo': return uncompleteTask(parseInt(args[0]));
            case 'del': return deleteTask(parseInt(args[0]));
            case 'clear': return clearAllTasks();
            case 'block': return addBlock(args[0], parseInt(args[1]));
            case 'unblock': return removeBlock(parseInt(args[0]), parseInt(args[1]));
            case 'send': return sendMessage(args[0], args.slice(1).join(' '));
            case 'broadcast': return broadcastMessage(args.join(' '));
            case 'log': return writeLog(args.join(' '));
            case 'logs': return args[0] === 'clear' ? clearLogs() : showLogs(args[0]);
            case 'watch': return watchLogs();
            case 'help': default: return showHelp();
        }
    } catch (e) {
        console.log(`${c.red}Error: ${e.message}${c.reset}`);
    }
}

// ===== Project Management =====
function initProject(name) {
    if (!name) return console.log(`${c.red}Usage: swarm init <project-name>${c.reset}`);
    new Project(name).init();
    console.log(`${c.green}✓ Project "${name}" created${c.reset}`);
    console.log(`\n${c.cyan}Start TD:${c.reset}`);
    console.log(`  SWARM_PROJECT=${name} SWARM_ROLE=TD codex`);
}

function listAllProjects() {
    const projects = listProjects();
    if (!projects.length) return console.log(`${c.yellow}No projects${c.reset}`);
    console.log(`${c.blue}=== Projects ===${c.reset}`);
    projects.forEach(name => {
        const s = new Project(name).getStatus();
        console.log(`  ${c.green}●${c.reset} ${name} (${s.groups.length} groups, ${s.totalTasks} tasks)`);
    });
}

function showStatus() {
    const s = getCurrentProject().getStatus();
    console.log(`${c.blue}=== ${s.project} ===${c.reset}`);
    console.log(`Tasks: ${s.completedTasks}/${s.totalTasks}`);
    s.groups.forEach(g => {
        console.log(`  ${c.green}●${c.reset} ${g.id}: ${g.completedCount}/${g.taskCount}`);
    });
}

// ===== Group Management =====
function registerGroup(groupId) {
    if (!groupId) return console.log(`${c.red}Usage: swarm register <groupID>${c.reset}`);
    const p = getCurrentProject();
    const session = `swarm-${p.name}-${groupId}`;
    p.registerGroup(groupId, session);
    console.log(`${c.green}✓ Group ${groupId} registered${c.reset}`);
}

function showGroups() {
    const groups = getCurrentProject().getGroups();
    if (!groups.length) return console.log(`${c.yellow}No groups${c.reset}`);
    console.log(`${c.blue}=== Groups ===${c.reset}`);
    groups.forEach(g => console.log(`  ${c.green}●${c.reset} ${g.id}`));
}

function startAgent(groupId, cli = 'codex') {
    const projectName = process.env.SWARM_PROJECT;
    if (!projectName || !groupId) {
        return console.log(`${c.red}Usage: SWARM_PROJECT=xxx swarm start <groupID> [cli]${c.reset}`);
    }

    const session = `swarm-${projectName}-${groupId}`;
    const prompt = `You are [Group ${groupId}], project: ${projectName}.

[Important Rules]
1. After each step, report progress using:
   SWARM_PROJECT=${projectName} SWARM_ROLE=${groupId} node $(which swarm) log "completed xxx"

2. View your tasks:
   SWARM_PROJECT=${projectName} SWARM_ROLE=${groupId} node $(which swarm) tasks

3. Mark task as done:
   SWARM_PROJECT=${projectName} SWARM_ROLE=${groupId} node $(which swarm) done <number>
`;

    const cmdMap = {
        claude: `SWARM_PROJECT=${projectName} SWARM_ROLE=${groupId} claude --system-prompt '${prompt.replace(/'/g, "'\\''")}'`,
        codex: `SWARM_PROJECT=${projectName} SWARM_ROLE=${groupId} codex --prompt '${prompt.replace(/'/g, "'\\''")}'`,
        gemini: `SWARM_PROJECT=${projectName} SWARM_ROLE=${groupId} gemini --system-prompt '${prompt.replace(/'/g, "'\\''")}'`
    };

    try {
        execSync(`tmux new-session -d -s '${session}' "${cmdMap[cli] || cmdMap.codex}"`, { stdio: 'ignore' });
        new Project(projectName).registerGroup(groupId, session);
        console.log(`${c.green}✓ ${groupId} (${cli}) started${c.reset}`);
        console.log(`  Enter: ${c.cyan}swarm attach ${groupId}${c.reset}`);
    } catch (e) {
        console.log(e.message.includes('duplicate')
            ? `${c.yellow}⚠ ${groupId} already running${c.reset}`
            : `${c.red}Failed to start${c.reset}`);
    }
}

function stopAgent(groupId) {
    const session = `swarm-${process.env.SWARM_PROJECT}-${groupId}`;
    try {
        execSync(`tmux kill-session -t '${session}'`, { stdio: 'ignore' });
        console.log(`${c.green}✓ ${groupId} stopped${c.reset}`);
    } catch {
        console.log(`${c.yellow}⚠ ${groupId} not running${c.reset}`);
    }
}

function stopAllAgents() {
    const prefix = `swarm-${process.env.SWARM_PROJECT}-`;
    try {
        const sessions = execSync(`tmux list-sessions -F '#{session_name}' 2>/dev/null || true`)
            .toString().trim().split('\n').filter(s => s.startsWith(prefix));
        sessions.forEach(s => execSync(`tmux kill-session -t '${s}'`, { stdio: 'ignore' }));
        console.log(`${c.green}✓ Stopped ${sessions.length} groups${c.reset}`);
    } catch {
        console.log(`${c.yellow}No running groups${c.reset}`);
    }
}

function attachAgent(groupId) {
    const session = `swarm-${process.env.SWARM_PROJECT}-${groupId}`;
    console.log(`${c.cyan}Entering ${groupId} (Ctrl+B D to exit)${c.reset}`);
    spawnSync('tmux', ['attach', '-t', session], { stdio: 'inherit' });
}

// ===== Task Management =====
function createTask(args) {
    // Parse args: swarm task "title" -d "description"
    let title = '';
    let description = '';

    const descIndex = args.findIndex(a => a === '-d' || a === '--desc');
    if (descIndex !== -1) {
        title = args.slice(0, descIndex).join(' ');
        description = args.slice(descIndex + 1).join(' ');
    } else {
        title = args.join(' ');
    }

    if (!title) return console.log(`${c.red}Usage: swarm task <title> [-d description]${c.reset}`);

    const p = getCurrentProject();
    const task = p.createTask({ title, description });
    const tasks = p.getTasks();
    const index = tasks.findIndex(t => t.id === task.id) + 1;
    console.log(`${c.green}✓ Task #${index} created${c.reset}`);
    if (description) {
        console.log(`  ${c.cyan}Description: ${description}${c.reset}`);
    }

    // Broadcast to all group members
    const config = p.getConfig();
    const groups = config?.groups || [];
    const msg = description
        ? `[TD] New task #${index}: ${title} | ${description}`
        : `[TD] New task #${index}: ${title}`;
    groups.forEach(g => {
        if (g.session) {
            injectToSession(g.session, msg);
        }
    });
}

function showTasks() {
    const p = getCurrentProject();
    const role = getCurrentRole();
    const allTasks = p.getTasks();
    const tasks = role === 'TD' ? allTasks : p.getTasksForGroup(role);

    if (!tasks.length) return console.log(`${c.yellow}No tasks${c.reset}`);
    console.log(`${c.blue}=== Tasks ===${c.reset}`);
    tasks.forEach((t, i) => {
        // Status icon
        const blockers = p.getBlockers(t.id);
        let status;
        if (t.status === 'completed') {
            status = `${c.green}✓${c.reset}`;
        } else if (blockers.length > 0) {
            status = `${c.red}●${c.reset}`; // blocked
        } else {
            status = `${c.yellow}○${c.reset}`;
        }

        const assignee = t.assignee ? ` ${c.cyan}@${t.assignee}${c.reset}` : '';
        console.log(`  ${status} [${i + 1}] ${t.title}${assignee}`);

        // Show blocking relationships
        if (blockers.length > 0) {
            const blockerIndices = blockers.map(b => {
                const idx = allTasks.findIndex(at => at.id === b.id) + 1;
                return `#${idx}`;
            }).join(', ');
            console.log(`      ${c.red}blocked by: ${blockerIndices}${c.reset}`);
        }
        if (t.blocks && t.blocks.length > 0) {
            const blockIndices = t.blocks.map(id => {
                const idx = allTasks.findIndex(at => at.id === id) + 1;
                return `#${idx}`;
            }).join(', ');
            console.log(`      ${c.yellow}blocks: ${blockIndices}${c.reset}`);
        }

        if (t.description) console.log(`      ${c.cyan}${t.description}${c.reset}`);
    });
}

function assignTask(index, groupId) {
    const p = getCurrentProject();
    const tasks = p.getTasks();
    if (index < 1 || index > tasks.length) return console.log(`${c.red}Invalid index${c.reset}`);
    const cleanGroupId = groupId?.replace('@', '');
    const task = tasks[index - 1];
    p.updateTask(task.id, { assignee: cleanGroupId });
    console.log(`${c.green}✓ Assigned to ${groupId}${c.reset}`);

    // Push to assigned group member
    const session = getGroupSession(p, cleanGroupId);
    if (session) {
        injectToSession(session, `[TD] You are assigned task #${index}: ${task.title}`);
        console.log(`${c.cyan}→ Pushed to ${cleanGroupId}${c.reset}`);
    }
}

function completeTask(index) {
    const p = getCurrentProject();
    const role = getCurrentRole();
    const tasks = role === 'TD' ? p.getTasks() : p.getTasksForGroup(role);
    if (index < 1 || index > tasks.length) return console.log(`${c.red}Invalid index${c.reset}`);
    const task = tasks[index - 1];
    const result = p.completeTask(task.id, role);

    if (result.error) {
        console.log(`${c.red}${result.error}${c.reset}`);
    } else {
        console.log(`${c.green}✓ Completed${c.reset}`);

        // Push to TD (if not completed by TD)
        if (role !== 'TD') {
            const tdSession = getTDSession(p);
            if (tdSession) {
                // Get global task index
                const allTasks = p.getTasks();
                const globalIndex = allTasks.findIndex(t => t.id === task.id) + 1;
                injectToSession(tdSession, `[Group ${role}] Completed task #${globalIndex}: ${task.title}`);
                console.log(`${c.cyan}→ Pushed to TD${c.reset}`);
            }
        }
    }
}

function uncompleteTask(index) {
    const p = getCurrentProject();
    const role = getCurrentRole();
    const tasks = role === 'TD' ? p.getTasks() : p.getTasksForGroup(role);
    if (index < 1 || index > tasks.length) return console.log(`${c.red}Invalid index${c.reset}`);
    const result = p.uncompleteTask(tasks[index - 1].id, role);
    console.log(result.error ? `${c.red}${result.error}${c.reset}` : `${c.yellow}↩ Undone${c.reset}`);
}

function deleteTask(index) {
    const p = getCurrentProject();
    const tasks = p.getTasks();
    if (index < 1 || index > tasks.length) return console.log(`${c.red}Invalid index${c.reset}`);
    p.deleteTask(tasks[index - 1].id);
    console.log(`${c.red}✗ Deleted${c.reset}`);
}

function clearAllTasks() {
    const p = getCurrentProject();
    const tasks = p.getTasks();
    if (!tasks.length) return console.log(`${c.yellow}No tasks${c.reset}`);
    const count = tasks.length;
    for (const task of tasks) {
        p.deleteTask(task.id);
    }
    console.log(`${c.red}✗ Cleared ${count} tasks${c.reset}`);
}

function addBlock(blockersArg, blockedIndex) {
    if (!blockersArg || !blockedIndex) {
        return console.log(`${c.red}Usage: swarm block <blocker-index> <blocked-index>${c.reset}`);
    }
    const p = getCurrentProject();
    const tasks = p.getTasks();

    // Support batch: swarm block 1,3,5 4
    const blockerIndices = String(blockersArg).split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));

    if (blockerIndices.length === 0) {
        return console.log(`${c.red}Invalid index${c.reset}`);
    }

    // Validate all indices
    for (const idx of [...blockerIndices, blockedIndex]) {
        if (idx < 1 || idx > tasks.length) {
            return console.log(`${c.red}Invalid index: ${idx}${c.reset}`);
        }
    }

    const blockedId = tasks[blockedIndex - 1].id;
    const results = [];

    for (const blockerIndex of blockerIndices) {
        const blockerId = tasks[blockerIndex - 1].id;
        const result = p.addBlockRelation(blockerId, blockedId);
        if (result.error) {
            console.log(`${c.red}#${blockerIndex}: ${result.error}${c.reset}`);
        } else {
            results.push(blockerIndex);
        }
    }

    if (results.length > 0) {
        console.log(`${c.green}✓ Task #${results.join(', #')} now blocks #${blockedIndex}${c.reset}`);
    }
}

function removeBlock(blockerIndex, blockedIndex) {
    if (!blockerIndex || !blockedIndex) {
        return console.log(`${c.red}Usage: swarm unblock <blocker-index> <blocked-index>${c.reset}`);
    }
    const p = getCurrentProject();
    const tasks = p.getTasks();
    if (blockerIndex < 1 || blockerIndex > tasks.length ||
        blockedIndex < 1 || blockedIndex > tasks.length) {
        return console.log(`${c.red}Invalid index${c.reset}`);
    }

    const blockerId = tasks[blockerIndex - 1].id;
    const blockedId = tasks[blockedIndex - 1].id;
    const result = p.removeBlockRelation(blockerId, blockedId);

    if (result.error) {
        console.log(`${c.red}${result.error}${c.reset}`);
    } else {
        console.log(`${c.green}✓ Removed block #${blockerIndex} -> #${blockedIndex}${c.reset}`);
    }
}

// ===== Messages =====
function sendMessage(target, content) {
    if (!target || !content) return console.log(`${c.red}Usage: swarm send @group message${c.reset}`);
    const p = getCurrentProject();
    const role = getCurrentRole();
    const targetId = target.replace('@', '');
    // Only use tmux injection, no inbox (avoid duplicates)
    let session;
    if (targetId === 'TD') {
        session = getTDSession(p);
    } else {
        session = getGroupSession(p, targetId);
    }
    if (session) {
        injectToSession(session, `[${role}] ${content}`);
        console.log(`${c.green}✓ Sent${c.reset}`);
        console.log(`${c.cyan}→ Pushed to ${targetId}${c.reset}`);
    } else {
        console.log(`${c.yellow}⚠ ${targetId} not online${c.reset}`);
    }
}

function broadcastMessage(content) {
    if (!content) return console.log(`${c.red}Usage: swarm broadcast message${c.reset}`);
    const p = getCurrentProject();
    const role = getCurrentRole();
    // Only use tmux injection, no inbox
    const config = p.getConfig();
    const groups = config?.groups || [];
    let injectedCount = 0;
    groups.forEach(g => {
        if (g.session && injectToSession(g.session, `[${role}] ${content}`)) {
            injectedCount++;
        }
    });
    if (injectedCount > 0) {
        console.log(`${c.green}✓ Broadcast to ${injectedCount} groups${c.reset}`);
    } else {
        console.log(`${c.yellow}⚠ No online groups${c.reset}`);
    }
    if (injectedCount > 0) {
        console.log(`${c.cyan}→ Pushed to ${injectedCount} groups${c.reset}`);
    }
}

// ===== Logs =====
function writeLog(content) {
    if (!content) return console.log(`${c.red}Usage: swarm log content${c.reset}`);
    const p = getCurrentProject();
    const role = getCurrentRole();
    p.writeLog(role, content);
    console.log(`${c.green}✓ Log recorded${c.reset}`);

    // Auto-push to TD (if not written by TD)
    if (role !== 'TD') {
        const tdSession = getTDSession(p);
        if (tdSession) {
            const injected = injectToSession(tdSession, `[Group ${role}] ${content}`);
            if (injected) console.log(`${c.cyan}→ Pushed to TD${c.reset}`);
        }
    }
}

function showLogs(groupId) {
    const logs = getCurrentProject().readLogs(groupId, 20);
    if (typeof logs === 'object' && !Array.isArray(logs)) {
        Object.entries(logs).forEach(([id, lines]) => {
            console.log(`${c.blue}=== Group ${id} Logs ===${c.reset}`);
            lines.forEach(l => console.log(`  ${l}`));
        });
    } else {
        console.log(`${c.blue}=== Group ${groupId} Logs ===${c.reset}`);
        logs.forEach(l => console.log(`  ${l}`));
    }
}

function clearLogs() {
    const count = getCurrentProject().clearAllLogs();
    console.log(`${c.red}✗ Cleared ${count} log files${c.reset}`);
}

function watchLogs() {
    const p = getCurrentProject();
    const role = getCurrentRole();

    if (role !== 'TD') {
        return console.log(`${c.red}Only TD can watch logs${c.reset}`);
    }

    const config = p.getConfig();
    const tdSession = config?.td || `swarm-${p.name}-TD`;

    console.log(`${c.cyan}Watching logs... (Ctrl+C to exit)${c.reset}`);
    startTDWatcher(p, tdSession);
}

// ===== Help =====
function showHelp() {
    console.log(`
${c.cyan}${c.bold}CTO CLI${c.reset} - Multi AI Agent Collaboration Tool

${c.yellow}Environment:${c.reset}
  SWARM_PROJECT  Project name    SWARM_ROLE  Role(TD/A/B/C...)

${c.yellow}Project:${c.reset}  init <name>  list  status
${c.yellow}Groups:${c.reset}   register <ID>  groups  start <ID> [cli]  stop <ID>  attach <ID>
${c.yellow}Tasks:${c.reset}    task <title> [-d desc]  tasks  assign <n> @grp  done <n>  undo <n>  del <n>
${c.yellow}Deps:${c.reset}     block <n> <m>  unblock <n> <m>  (n blocks m)
${c.yellow}Message:${c.reset}  send @grp <content>  broadcast <content>
${c.yellow}Logs:${c.reset}     log <content>  logs [groupID]  watch

${c.yellow}Examples:${c.reset}
  cto init myproject                       # Create project
  SWARM_PROJECT=myproject SWARM_ROLE=TD codex  # Start TD
  cto register A && cto start A codex      # Register and start Group A
  cto task "Implement login" && cto assign 1 @A  # Create task and assign
  cto log "Completed UI"                   # Write log
`);
}

main();
