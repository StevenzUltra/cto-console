#!/usr/bin/env node
/**
 * @CTO - Send message to CTO Console
 *
 * Usage: at-cto "Your message here"
 *        at-cto -p project-name "Your message"
 *
 * This writes to the project's cto-inbox.jsonl file
 * which is monitored by CTO Console.
 */

const fs = require('fs');
const path = require('path');

const SWARM_BASE = path.join(process.env.HOME, '.agent-swarm', 'projects');

function getProjectDir(projectName) {
    if (projectName) {
        return path.join(SWARM_BASE, projectName);
    }
    // Try to find current project from env or first available
    const envProject = process.env.SWARM_PROJECT;
    if (envProject) {
        return path.join(SWARM_BASE, envProject);
    }
    // Use first project
    try {
        const projects = fs.readdirSync(SWARM_BASE).filter(name =>
            fs.existsSync(path.join(SWARM_BASE, name, 'config.json'))
        );
        if (projects.length > 0) {
            return path.join(SWARM_BASE, projects[0]);
        }
    } catch {}
    return null;
}

function sendToCTO(projectDir, from, message) {
    const inboxPath = path.join(projectDir, 'cto-inbox.jsonl');
    const entry = JSON.stringify({
        timestamp: new Date().toISOString(),
        from: from || process.env.SWARM_GROUP || 'Agent',
        message: message
    }) + '\n';

    fs.appendFileSync(inboxPath, entry);
    return true;
}

// Parse args
const args = process.argv.slice(2);
let projectName = null;
let from = null;
let message = null;

for (let i = 0; i < args.length; i++) {
    if (args[i] === '-p' || args[i] === '--project') {
        projectName = args[++i];
    } else if (args[i] === '-f' || args[i] === '--from') {
        from = args[++i];
    } else if (!message) {
        message = args[i];
    }
}

if (!message) {
    console.log('Usage: at-cto "Your message"');
    console.log('       at-cto -p project-name "Your message"');
    console.log('       at-cto -f GroupA "Your message"');
    process.exit(1);
}

const projectDir = getProjectDir(projectName);
if (!projectDir || !fs.existsSync(projectDir)) {
    console.error('Error: No project found. Use -p to specify project name.');
    process.exit(1);
}

try {
    sendToCTO(projectDir, from, message);
    console.log(`@CTO message sent to ${path.basename(projectDir)}`);
} catch (e) {
    console.error('Error sending message:', e.message);
    process.exit(1);
}
