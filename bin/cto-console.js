#!/usr/bin/env node
/**
 * CTO Console - Minimal TUI Interface
 *
 * Command: cto console
 */

const blessed = require('blessed');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SWARM_BASE = path.join(process.env.HOME, '.agent-swarm', 'projects');

// ═══════════════════════════════════════════════════════════════
// Project Management
// ═══════════════════════════════════════════════════════════════
function listProjects() {
    try {
        return fs.readdirSync(SWARM_BASE).filter(name =>
            fs.existsSync(path.join(SWARM_BASE, name, 'config.json'))
        );
    } catch { return []; }
}

function getProject(name) {
    const dir = path.join(SWARM_BASE, name);
    return {
        name,
        dir,
        configFile: path.join(dir, 'config.json'),
        tasksFile: path.join(dir, 'tasks.json'),
        logsDir: path.join(dir, 'logs'),
        getConfig() {
            try { return JSON.parse(fs.readFileSync(this.configFile, 'utf-8')); }
            catch { return null; }
        },
        getTasks() {
            try { return JSON.parse(fs.readFileSync(this.tasksFile, 'utf-8')); }
            catch { return []; }
        }
    };
}

function sendToSession(sessionName, message) {
    if (!sessionName) return false;
    try {
        const escaped = message
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/\$/g, '\\$')
            .replace(/`/g, '\\`')
            .replace(/!/g, '\\!')
            .replace(/\n/g, ' ');
        execSync(`tmux send-keys -t "${sessionName}" "[CTO] ${escaped}"`, { stdio: 'ignore' });
        execSync('sleep 0.1', { stdio: 'ignore' });
        execSync(`tmux send-keys -t "${sessionName}" Enter`, { stdio: 'ignore' });
        return true;
    } catch { return false; }
}

// ═══════════════════════════════════════════════════════════════
// TUI Interface
// ═══════════════════════════════════════════════════════════════
function createUI() {
    const projects = listProjects();
    let currentProject = projects[0] ? getProject(projects[0]) : null;
    let currentTarget = 'all';
    let inputValue = '';
    let suggestionVisible = false;
    let suggestionItems = [];
    let suggestionIndex = 0;
    let suggestionMode = null;
    let ignoreNextEnter = false; // Prevent double-fire when switching modes

    const screen = blessed.screen({
        smartCSR: true,
        title: 'CTO Console',
        fullUnicode: true
    });

    // Green gradient ASCII title
    const header = blessed.box({
        parent: screen,
        top: 0,
        left: 0,
        width: '100%',
        height: 8,
        tags: true,
        style: { bg: 'black' }
    });

    header.setContent(`
{#0a5f0a-fg}  ██████╗{/#0a5f0a-fg}{#0c6f0c-fg}████████╗{/#0c6f0c-fg}{#0e7f0e-fg} ██████╗ {/#0e7f0e-fg}    {#108f10-fg} ██████╗{/#108f10-fg}{#129f12-fg} ██████╗ {/#129f12-fg}{#14af14-fg}███╗   ██╗{/#14af14-fg}{#16bf16-fg}███████╗{/#16bf16-fg}
{#0a5f0a-fg} ██╔════╝{/#0a5f0a-fg}{#0c6f0c-fg}╚══██╔══╝{/#0c6f0c-fg}{#0e7f0e-fg}██╔═══██╗{/#0e7f0e-fg}    {#108f10-fg}██╔════╝{/#108f10-fg}{#129f12-fg}██╔═══██╗{/#129f12-fg}{#14af14-fg}████╗  ██║{/#14af14-fg}{#16bf16-fg}██╔════╝{/#16bf16-fg}
{#0c6f0c-fg} ██║     {/#0c6f0c-fg}{#0e7f0e-fg}   ██║   {/#0e7f0e-fg}{#108f10-fg}██║   ██║{/#108f10-fg}    {#129f12-fg}██║     {/#129f12-fg}{#14af14-fg}██║   ██║{/#14af14-fg}{#16bf16-fg}██╔██╗ ██║{/#16bf16-fg}{#18cf18-fg}███████╗{/#18cf18-fg}
{#0e7f0e-fg} ██║     {/#0e7f0e-fg}{#108f10-fg}   ██║   {/#108f10-fg}{#129f12-fg}██║   ██║{/#129f12-fg}    {#14af14-fg}██║     {/#14af14-fg}{#16bf16-fg}██║   ██║{/#16bf16-fg}{#18cf18-fg}██║╚██╗██║{/#18cf18-fg}{#1adf1a-fg}╚════██║{/#1adf1a-fg}
{#108f10-fg} ╚██████╗{/#108f10-fg}{#129f12-fg}   ██║   {/#129f12-fg}{#14af14-fg}╚██████╔╝{/#14af14-fg}    {#16bf16-fg}╚██████╗{/#16bf16-fg}{#18cf18-fg}╚██████╔╝{/#18cf18-fg}{#1adf1a-fg}██║ ╚████║{/#1adf1a-fg}{#1cef1c-fg}███████║{/#1cef1c-fg}
{#129f12-fg}  ╚═════╝{/#129f12-fg}{#14af14-fg}   ╚═╝   {/#14af14-fg}{#16bf16-fg} ╚═════╝ {/#16bf16-fg}    {#18cf18-fg} ╚═════╝{/#18cf18-fg}{#1adf1a-fg} ╚═════╝ {/#1adf1a-fg}{#1cef1c-fg}╚═╝  ╚═══╝{/#1cef1c-fg}{#1eff1e-fg}╚══════╝{/#1eff1e-fg}`);

    // Log area (below header, main content area)
    const logBox = blessed.log({
        parent: screen,
        label: ' Logs ',
        top: 8,
        left: 0,
        width: '100%',
        bottom: 8,  // 留出底部空间给状态栏+输入框
        border: { type: 'line', fg: 'gray' },
        style: { fg: 'white', bg: 'black', border: { fg: 'gray' } },
        tags: true,
        scrollable: true,
        alwaysScroll: true,
        scrollbar: { ch: '|', style: { fg: 'green' } },
        mouse: true
    });

    // Status bar (above bottom)
    const statusBar = blessed.box({
        parent: screen,
        bottom: 7,
        left: 0,
        width: '100%',
        height: 1,
        tags: true,
        style: { fg: 'white', bg: 'black' }
    });

    function updateStatus() {
        if (!currentProject) {
            statusBar.setContent(' {yellow-fg}No project{/yellow-fg} | swarm init <name>');
            return;
        }
        const config = currentProject.getConfig();
        const tasks = currentProject.getTasks();
        const completed = tasks.filter(t => t.status === 'completed').length;
        const members = [];
        if (config?.td) members.push('{green-fg}TD{/green-fg}');
        (config?.groups || []).forEach(g => members.push(`{green-fg}${g.id}{/green-fg}`));
        const target = currentTarget === 'all' ? '{yellow-fg}@all{/yellow-fg}' : `{cyan-fg}@${currentTarget}{/cyan-fg}`;
        statusBar.setContent(` {white-fg}${currentProject.name}{/white-fg} | Tasks ${completed}/${tasks.length} | ${members.join(' ')} | Send: ${target}`);
    }

    // Input box (bottom)
    const inputBox = blessed.box({
        parent: screen,
        label: ` Message → @${currentTarget} `,
        bottom: 4,
        left: 0,
        width: '100%',
        height: 3,
        border: { type: 'line', fg: 'green' },
        style: { fg: 'white', bg: 'black', border: { fg: 'green' } },
        tags: true
    });

    // Suggestion box (expands below input, at bottom) - max 5 visible items
    const MAX_VISIBLE_SUGGESTIONS = 5;
    let suggestionScrollOffset = 0;

    const suggestionBox = blessed.box({
        parent: screen,
        bottom: 0,
        left: 1,
        width: '100%-2',
        height: 7, // 5 items + 2 border
        border: { type: 'line', fg: 'green' },
        style: { fg: 'white', bg: 'black', border: { fg: 'green' } },
        tags: true,
        hidden: true
    });

    function updateInput() {
        inputBox.setLabel(` Message → @${currentTarget} `);
        inputBox.setContent(` ${inputValue}{green-fg}_{/green-fg}`);
    }

    function updateSuggestions() {
        if (!suggestionVisible) {
            suggestionBox.hide();
            statusBar.show();  // Restore status bar
            return;
        }
        suggestionBox.show();
        statusBar.hide();  // Hide status bar to make room for suggestions

        // Adjust scroll offset to keep selected item visible
        if (suggestionIndex < suggestionScrollOffset) {
            suggestionScrollOffset = suggestionIndex;
        } else if (suggestionIndex >= suggestionScrollOffset + MAX_VISIBLE_SUGGESTIONS) {
            suggestionScrollOffset = suggestionIndex - MAX_VISIBLE_SUGGESTIONS + 1;
        }

        // Get visible items only
        const visibleItems = suggestionItems.slice(
            suggestionScrollOffset,
            suggestionScrollOffset + MAX_VISIBLE_SUGGESTIONS
        );

        const lines = visibleItems.map((item, i) => {
            const actualIndex = i + suggestionScrollOffset;
            const prefix = actualIndex === suggestionIndex ? '{green-fg}▶{/green-fg}' : ' ';
            const style = actualIndex === suggestionIndex ? '{green-fg}' : '{white-fg}';
            return ` ${prefix} ${style}${item}{/${actualIndex === suggestionIndex ? 'green' : 'white'}-fg}`;
        });

        // Add scroll indicators if needed
        const hasMore = suggestionItems.length > MAX_VISIBLE_SUGGESTIONS;
        const canScrollUp = suggestionScrollOffset > 0;
        const canScrollDown = suggestionScrollOffset + MAX_VISIBLE_SUGGESTIONS < suggestionItems.length;

        suggestionBox.setContent(lines.join('\n'));
        const labels = { '@': ' Select Target ', '/': ' Commands ', 'project': ' Select Project ' };
        let label = labels[suggestionMode] || ' Options ';
        if (hasMore) {
            label += ` (${suggestionIndex + 1}/${suggestionItems.length})`;
            if (canScrollUp) label = '▲ ' + label;
            if (canScrollDown) label = label + ' ▼';
        }
        suggestionBox.setLabel(label);

        // Adjust box height dynamically
        const boxHeight = Math.min(suggestionItems.length, MAX_VISIBLE_SUGGESTIONS) + 2;
        suggestionBox.height = boxHeight;
    }

    // Full suggestion list
    let allSuggestionItems = [];

    function getFullSuggestions(mode) {
        if (mode === '@') {
            const items = ['all - Broadcast to everyone'];
            if (currentProject) {
                const config = currentProject.getConfig();
                // Always show TD as option
                items.push('TD - Technical Director');
                // Add "groups" option if there are members (broadcast to all except TD)
                const groups = config?.groups || [];
                if (groups.length > 0) {
                    items.push('groups - All members (except TD)');
                }
                groups.forEach(g => items.push(`${g.id} - Member`));
            }
            return items;
        } else if (mode === 'project') {
            // Project name suggestions
            return listProjects().map(p => {
                const mark = p === currentProject?.name ? '* ' : '';
                return `${p} - ${mark}Project`;
            });
        } else {
            return ['help - Show help', 'list - Project list', 'p - Switch project'];
        }
    }

    function filterSuggestions(query) {
        const q = query.toLowerCase().trim();
        if (!q) {
            suggestionItems = [...allSuggestionItems];
            suggestionIndex = 0;
            suggestionScrollOffset = 0;
            return;
        }

        // Filter and sort by match quality
        suggestionItems = allSuggestionItems
            .filter(item => item.toLowerCase().includes(q))
            .sort((a, b) => {
                const aLower = a.toLowerCase();
                const bLower = b.toLowerCase();
                const aName = aLower.split(' ')[0]; // 取项目名部分
                const bName = bLower.split(' ')[0];

                // Exact match first
                if (aName === q) return -1;
                if (bName === q) return 1;

                // Starts with query next
                const aStarts = aName.startsWith(q);
                const bStarts = bName.startsWith(q);
                if (aStarts && !bStarts) return -1;
                if (!aStarts && bStarts) return 1;

                // Contains query, sort by position
                const aIndex = aName.indexOf(q);
                const bIndex = bName.indexOf(q);
                return aIndex - bIndex;
            });

        if (suggestionItems.length === 0) {
            suggestionItems = [...allSuggestionItems]; // 无匹配时显示全部
        }
        suggestionIndex = 0;
        suggestionScrollOffset = 0;
    }

    function showSuggestions(mode) {
        suggestionMode = mode;
        allSuggestionItems = getFullSuggestions(mode);
        suggestionItems = [...allSuggestionItems];
        suggestionIndex = 0;
        suggestionScrollOffset = 0;
        suggestionVisible = true;
        updateSuggestions();
        screen.render();
    }

    function hideSuggestions() {
        suggestionVisible = false;
        suggestionBox.hide();
        statusBar.show();  // Restore status bar
        screen.render();
    }

    function addLog(text) {
        const now = new Date().toLocaleTimeString('en-US', { hour12: false });
        logBox.log(`{gray-fg}${now}{/gray-fg} ${text}`);
    }

    function handleCommand(cmd) {
        const [action, ...args] = cmd.split(' ');
        switch (action) {
            case 'help':
            case 'h':
                addLog('{green-fg}=== Help ==={/green-fg}');
                addLog('  Type @ to select target');
                addLog('  Type / for commands');
                addLog('  @TD message - Send to TD');
                addLog('  Ctrl+C/Esc - Exit');
                break;
            case 'p':
            case 'project':
                if (args[0]) {
                    currentProject = getProject(args[0]);
                    currentTarget = 'all';
                    addLog(`{green-fg}Switched to: ${args[0]}{/green-fg}`);
                    updateStatus();
                }
                break;
            case 'list':
            case 'l':
                addLog('{green-fg}=== Projects ==={/green-fg}');
                listProjects().forEach(p => {
                    const mark = p === currentProject?.name ? '*' : ' ';
                    addLog(`  ${mark} ${p}`);
                });
                break;
        }
    }

    function sendMessageTo(target, message) {
        if (!currentProject) { addLog('{red-fg}No project{/red-fg}'); return; }
        const config = currentProject.getConfig();
        if (!config) { addLog('{red-fg}Invalid config{/red-fg}'); return; }

        if (target === 'all') {
            let count = 0;
            if (config.td && sendToSession(config.td, message)) count++;
            (config.groups || []).forEach(g => {
                if (g.session && sendToSession(g.session, message)) count++;
            });
            if (count > 0) addLog(`{green-fg}>>> @all:{/green-fg} ${message}`);
            else addLog('{yellow-fg}No online targets{/yellow-fg}');
        } else {
            let session = target === 'TD' ? config.td : config.groups?.find(g => g.id === target)?.session;
            if (session && sendToSession(session, message)) {
                addLog(`{green-fg}>>> @${target}:{/green-fg} ${message}`);
            } else {
                addLog(`{yellow-fg}@${target} offline{/yellow-fg}`);
            }
        }
    }

    function submitInput() {
        const input = inputValue.trim();
        inputValue = '';
        updateInput();

        if (!input) return;

        if (input.startsWith('/')) {
            handleCommand(input.slice(1));
        } else if (input.startsWith('@')) {
            const match = input.match(/^@(\w+)\s+(.+)$/);
            if (match) sendMessageTo(match[1], match[2]);
            else addLog('{yellow-fg}Format: @target message{/yellow-fg}');
        } else {
            sendMessageTo(currentTarget, input);
        }
        screen.render();
    }

    // Exit function (graceful exit)
    function exitApp() {
        screen.destroy();
        // 清屏并重置终端
        process.stdout.write('\x1b[2J\x1b[H\x1b[?25h');
        process.exit(0);
    }

    // Ctrl+C shortcut (highest priority)
    screen.key(['C-c'], exitApp);

    // Global keyboard handler
    screen.on('keypress', (ch, key) => {
        // Ctrl+C extra handling
        if (key && key.ctrl && key.name === 'c') {
            exitApp();
            return;
        }

        if (suggestionVisible) {
            // Suggestion mode with circular navigation
            if (key.name === 'up') {
                suggestionIndex = suggestionIndex <= 0
                    ? suggestionItems.length - 1  // Wrap to bottom
                    : suggestionIndex - 1;
                updateSuggestions();
            } else if (key.name === 'down') {
                suggestionIndex = suggestionIndex >= suggestionItems.length - 1
                    ? 0  // Wrap to top
                    : suggestionIndex + 1;
                updateSuggestions();
            } else if (key.name === 'enter' || key.name === 'return') {
                // Prevent double-fire when switching modes
                if (ignoreNextEnter) {
                    ignoreNextEnter = false;
                    screen.render();
                    return;
                }
                const selected = suggestionItems[suggestionIndex]?.split(' ')[0];
                if (selected) {
                    if (suggestionMode === '@') {
                        currentTarget = selected;
                        addLog(`{gray-fg}Target: @${currentTarget}{/gray-fg}`);
                        updateStatus();
                        inputValue = '';
                        hideSuggestions();
                    } else if (suggestionMode === 'project') {
                        // Select project
                        currentProject = getProject(selected);
                        currentTarget = 'all';
                        addLog(`{green-fg}Switched to: ${selected}{/green-fg}`);
                        updateStatus();
                        inputValue = '';
                        hideSuggestions();
                    } else if (suggestionMode === '/') {
                        if (selected === 'p') {
                            // Switch to project selection mode
                            ignoreNextEnter = true; // Prevent double-fire
                            inputValue = '/p ';
                            showSuggestions('project');
                            updateInput();
                            screen.render();
                            return;
                        } else {
                            handleCommand(selected);
                            inputValue = '';
                            hideSuggestions();
                        }
                    }
                } else {
                    inputValue = '';
                    hideSuggestions();
                }
                updateInput();
            } else if (key.name === 'escape') {
                // Esc in suggestion mode just closes suggestions
                inputValue = '';
                hideSuggestions();
                updateInput();
            } else if (key.name === 'backspace') {
                // Backspace: delete char or close suggestions
                const minLen = suggestionMode === 'project' ? 2 : 1; // /p vs @ or /
                if (inputValue.length > minLen) {
                    inputValue = inputValue.slice(0, -1);
                    // If backspaced before /p, switch back to command mode
                    if (suggestionMode === 'project' && !inputValue.startsWith('/p')) {
                        showSuggestions('/');
                        filterSuggestions(inputValue.slice(1));
                    } else {
                        const query = suggestionMode === 'project'
                            ? inputValue.slice(2).trim()  // Remove /p
                            : inputValue.slice(1); // Remove @ or /
                        filterSuggestions(query);
                        updateSuggestions();
                    }
                    updateInput();
                } else {
                    inputValue = '';
                    hideSuggestions();
                    updateInput();
                }
            } else if (ch && !key.ctrl && !key.meta) {
                // Type character to filter
                inputValue += ch;

                // Detect switch to project mode /p or /p followed by chars
                if (suggestionMode === '/' && inputValue.startsWith('/p')) {
                    // Switch to project selection mode
                    showSuggestions('project');
                    const query = inputValue.slice(2).trim(); // Remove /p
                    if (query) filterSuggestions(query);
                    updateInput();
                } else {
                    const query = suggestionMode === 'project'
                        ? inputValue.slice(2).trim()  // Remove /p
                        : inputValue.slice(1); // Remove @ or /
                    filterSuggestions(query);
                    updateSuggestions();
                    updateInput();
                }
            }
            screen.render();
            return;
        }

        // Normal input mode - Esc to exit
        if (key.name === 'escape') {
            exitApp();
            return;
        }
        if (key.name === 'enter' || key.name === 'return') {
            submitInput();
        } else if (key.name === 'backspace') {
            inputValue = inputValue.slice(0, -1);
            updateInput();
        } else if (ch && !key.ctrl && !key.meta) {
            inputValue += ch;
            updateInput();
            // Auto-show suggestions
            if (inputValue === '@') showSuggestions('@');
            else if (inputValue === '/') showSuggestions('/');
            else if (inputValue === '/p ' || inputValue === '/p') showSuggestions('project');
        }
        screen.render();
    });

    // Log watcher
    let lastLogSizes = {};
    function watchLogs() {
        if (!currentProject || !fs.existsSync(currentProject.logsDir)) return;
        fs.readdirSync(currentProject.logsDir).filter(f => f.endsWith('.log')).forEach(file => {
            const logPath = path.join(currentProject.logsDir, file);
            const groupId = file.replace('.log', '');
            try {
                const stat = fs.statSync(logPath);
                const lastSize = lastLogSizes[logPath] || 0;
                if (stat.size > lastSize) {
                    const content = fs.readFileSync(logPath, 'utf-8');
                    content.slice(lastSize).split('\n').filter(Boolean).forEach(line => {
                        addLog(`{cyan-fg}[${groupId}]{/cyan-fg} ${line}`);
                    });
                    lastLogSizes[logPath] = stat.size;
                }
            } catch {}
        });
    }

    setInterval(() => { updateStatus(); watchLogs(); screen.render(); }, 2000);

    // Startup
    addLog('{green-fg}CTO Console started{/green-fg}');
    addLog('{gray-fg}Type @ for target, / for commands, Esc to exit{/gray-fg}');
    if (currentProject) addLog(`{gray-fg}Project: ${currentProject.name}{/gray-fg}`);

    // Demo mode - simulate agent reports
    const isDemo = process.argv.includes('--demo');
    const isDemoFast = process.argv.includes('--demo-fast'); // Fast recording mode
    if (isDemo || isDemoFast) {
        // fast=~70sec total, normal=~6min total
        const speed = isDemoFast ? 1000 : 5000;
        const demoLogs = [
            { delay: 2 * speed, group: 'A', msg: 'Starting task #1: User auth module refactor' },
            { delay: 5 * speed, group: 'B', msg: 'Reading file: src/services/authService.js (328 lines)' },
            { delay: 9 * speed, group: 'A', msg: 'Analyzed code structure, found 3 areas to optimize' },
            { delay: 13 * speed, group: 'C', msg: 'Starting task #3: API documentation update' },
            { delay: 17 * speed, group: 'B', msg: 'Creating file: src/services/authCoreService.js' },
            { delay: 20 * speed, group: 'D', msg: 'Starting task #4: Unit test writing' },
            { delay: 25 * speed, group: 'A', msg: 'Completed JWT validation logic migration' },
            { delay: 29 * speed, group: 'C', msg: 'Updated README.md, added API endpoint docs' },
            { delay: 33 * speed, group: 'B', msg: 'Issue found: circular dependency, resolving...' },
            { delay: 38 * speed, group: 'D', msg: 'Writing test cases: testLogin(), testLogout()' },
            { delay: 42 * speed, group: 'TD', msg: 'Received feedback from B, suggesting DI pattern' },
            { delay: 47 * speed, group: 'A', msg: 'Task #1 progress: 60%, 2 subtasks remaining' },
            { delay: 52 * speed, group: 'B', msg: 'Resolved circular dependency, continuing refactor' },
            { delay: 57 * speed, group: 'C', msg: 'Task #3 completed, awaiting review' },
            { delay: 62 * speed, group: 'D', msg: 'Test coverage: 78%, adding edge case tests' },
            { delay: 67 * speed, group: 'A', msg: 'Task #1 completed!' },
            { delay: 72 * speed, group: 'TD', msg: 'Approved, assigning new task to Group A' },
        ];

        demoLogs.forEach(({ delay, group, msg }) => {
            setTimeout(() => {
                const color = { A: 'cyan', B: 'yellow', C: 'magenta', D: 'blue', TD: 'green' }[group] || 'white';
                addLog(`{${color}-fg}[${group}]{/${color}-fg} ${msg}`);
                screen.render();
            }, delay);
        });

        // Mock project data
        currentProject = {
            name: 'demo-project',
            getConfig: () => ({
                td: 'demo-td',
                groups: [
                    { id: 'A', session: 'demo-a' },
                    { id: 'B', session: 'demo-b' },
                    { id: 'C', session: 'demo-c' },
                    { id: 'D', session: 'demo-d' }
                ]
            }),
            getTasks: () => [
                { id: 1, title: 'User auth refactor', assignee: 'A', status: 'completed' },
                { id: 2, title: 'Database optimization', assignee: 'B', status: 'in_progress' },
                { id: 3, title: 'API docs update', assignee: 'C', status: 'completed' },
                { id: 4, title: 'Unit tests', assignee: 'D', status: 'in_progress' },
                { id: 5, title: 'Performance tuning', assignee: null, status: 'pending' },
            ]
        };
    }

    updateStatus();
    updateInput();
    screen.render();
}

// Main entry
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

try {
    createUI();
} catch (e) {
    console.error(e);
    process.exit(1);
}
