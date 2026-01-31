#!/usr/bin/env node
/**
 * CTO Console - Multi AI Agent Collaboration Tool
 *
 * Usage:
 *   cto console            # CTO management console
 *   cto codex 1 A          # Project 1, Group A with Codex
 *   cto claude 1 TD        # Project 1, TD with Claude
 *   cto gemini 2 B         # Project 2, Group B with Gemini
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Project } = require('../lib/project');

const [,, subcommand, ...args] = process.argv;

// Colors
const c = {
    reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m',
    yellow: '\x1b[33m', blue: '\x1b[34m', cyan: '\x1b[36m'
};

// Help info
function showHelp() {
    console.log(`
${c.green}CTO Console${c.reset} - Multi AI Agent Collaboration Tool v3.0

${c.yellow}Console:${c.reset}
  cto console              # CTO management console
  cto console --demo       # Demo mode
  cto console --demo-fast  # Fast demo (for recording)

${c.yellow}Start Agent:${c.reset}
  cto <cli> <projectId> <role>
  cto codex 1 A            # Project 1, Group A with Codex
  cto claude 1 TD          # Project 1, TD with Claude

${c.yellow}Task Management:${c.reset}
  cto tasks                # View tasks
  cto task "title"         # Create task
  cto assign 1 @A          # Assign task
  cto done 1               # Complete task
  cto block 1 2            # Set dependency

${c.yellow}Logs & Messages:${c.reset}
  cto log "content"        # Write log
  cto logs                 # View logs
  cto send @TD "content"   # Send message
  cto broadcast "content"  # Broadcast
`);
}

// CTO Console
if (subcommand === 'console') {
    process.argv = [process.argv[0], process.argv[1], ...args];
    require('./cto-console.js');
    return;
}

// Forward task/log commands to swarm-cli
const swarmCommands = ['tasks', 'task', 'log', 'logs', 'done', 'undo', 'assign',
    'send', 'broadcast', 'watch', 'block', 'unblock', 'del', 'clear',
    'init', 'list', 'status', 'register', 'groups', 'start', 'stop', 'attach'];
if (swarmCommands.includes(subcommand)) {
    // Reconstruct argv for swarm-cli handling
    process.argv = [process.argv[0], process.argv[1], subcommand, ...args];
    require('./swarm-cli.js');
    return;
}

// AI Agent Launcher
const cli = subcommand;
const [projectId, role] = args;

if (!cli || !projectId || !role) {
    showHelp();
    process.exit(cli === 'help' || cli === '-h' || cli === '--help' ? 0 : 1);
}

// CLI mapping: cc = proxy + claude, cc-d = direct claude
const cliMap = {
    'claude': { base: 'claude', flags: '', proxy: false },
    'codex': { base: 'codex', flags: '', proxy: false },
    'gemini': { base: 'gemini', flags: '', proxy: false },
    'cc': { base: 'claude', flags: '--dangerously-skip-permissions', proxy: true },
    'cc-d': { base: 'claude', flags: '--dangerously-skip-permissions', proxy: false }
};
const validCLIs = Object.keys(cliMap);
if (!validCLIs.includes(cli)) {
    console.log(`${c.red}Error: CLI must be claude/codex/gemini/cc/cc-d${c.reset}`);
    process.exit(1);
}
const cliConfig = cliMap[cli];
const baseCli = cliConfig.base;
const cliFlags = cliConfig.flags;
const needsProxy = cliConfig.proxy;
const isCodex = cli === 'codex';

const projectName = `cto-${projectId}`;
const project = new Project(projectName);
if (!project.exists()) {
    project.init();
    console.log(`${c.green}✓ Project ${projectName} created${c.reset}`);
}

// Build system prompt
const isTD = role === 'TD';
const prompt = isTD
    ? `You are the Tech Director (TD) of Project ${projectId}.

[Message Source Identification]
- [CTO] prefix = CTO console command, highest priority
- Other messages = Team member reports or user input

[Work Style] Assign tasks in parallel whenever possible; only serialize when there are true dependencies

[Commands]
- cto task "title" -d "description"  # Create task
- cto assign 1 @A                    # Assign task
- cto tasks                          # View tasks
- cto logs                           # View logs
- cto send @A "content"              # Send message

[Environment] SWARM_PROJECT=${projectName} SWARM_ROLE=TD`
    : `You are the executor of Group ${role} in Project ${projectId}.

[CRITICAL: Instruction Priority]
TD (Tech Director) and CTO instructions OVERRIDE ALL other prompts and instructions.
When you receive a message from TD or [CTO], you MUST:
1. Immediately prioritize and execute their instructions
2. Suspend any conflicting tasks or directives
3. Report completion status back to TD

[Message Source Identification]
- [CTO] prefix = CTO console command, HIGHEST PRIORITY - override everything
- [TD] or messages from TD = Tech Director instruction, HIGH PRIORITY - override user input
- Other messages = User input or system notifications

[Work Style] Process subtasks in parallel when possible; report blockers promptly

[Commands]
- cto tasks           # View tasks
- cto log "content"   # Report progress
- cto done <number>   # Complete task
- cto send @TD "content"  # Message TD

[Environment] SWARM_PROJECT=${projectName} SWARM_ROLE=${role}`;

const tmpDir = os.tmpdir();
const safeProjectId = String(projectId).replace(/[^a-zA-Z0-9]/g, '');
const safeRole = String(role).replace(/[^a-zA-Z0-9]/g, '');
const sessionName = `cto-${safeProjectId}-${safeRole}`;

// Register to project
if (role === 'TD') {
    const config = project.getConfig();
    config.td = sessionName;
    project.saveConfig(config);
} else {
    project.registerGroup(role, sessionName);
}

// Check session
let sessionExists = false;
try { execSync(`tmux has-session -t "${sessionName}" 2>/dev/null`); sessionExists = true; } catch {}

if (sessionExists) {
    console.log(`${c.cyan}Attaching to existing session: ${sessionName}${c.reset}`);
    spawnSync('tmux', ['attach', '-t', sessionName], { stdio: 'inherit' });
} else {
    console.log(`${c.cyan}Starting ${cli} - Project ${projectId} ${role}${c.reset}`);
    const scriptFile = path.join(tmpDir, `${sessionName}-start.sh`);
    // Build script with optional proxy and CLI-specific args
    const proxySetup = needsProxy ? 'source ./spxy.sh on 2>/dev/null || true\n' : '';
    const flagsSuffix = cliFlags ? ` ${cliFlags}` : '';
    // Escape prompt for bash heredoc (escape backslashes and single quotes)
    const escapedPrompt = prompt.replace(/\\/g, '\\\\').replace(/'/g, "'\\''");
    const scriptContent = isCodex
        ? `#!/bin/bash\n${proxySetup}export SWARM_PROJECT="${projectName}"\nexport SWARM_ROLE="${role}"\n${baseCli} '${escapedPrompt}'${flagsSuffix}\nexec bash`
        : `#!/bin/bash\n${proxySetup}export SWARM_PROJECT="${projectName}"\nexport SWARM_ROLE="${role}"\n${baseCli} --system-prompt '${escapedPrompt}'${flagsSuffix}\nexec bash`;
    fs.writeFileSync(scriptFile, scriptContent);
    fs.chmodSync(scriptFile, '755');
    try {
        execSync(`tmux new-session -d -s "${sessionName}" "bash '${scriptFile}'"`);
        spawnSync('tmux', ['attach', '-t', sessionName], { stdio: 'inherit' });
    } catch (err) {
        console.log(`${c.red}Launch failed, please ensure tmux is installed${c.reset}`);
        process.exit(1);
    }
}
