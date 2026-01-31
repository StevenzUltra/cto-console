#!/usr/bin/env node
/**
 * Filling - 简化的多 AI 协作启动器
 *
 * 用法:
 *   filling codex 1 A      # 启动项目1的A组 (Codex)
 *   filling claude 1 TD    # 启动项目1的TD (Claude)
 *   filling gemini 2 B     # 启动项目2的B组 (Gemini)
 */

const { spawn, execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Project } = require('../lib/project');

const [,, cli, projectId, role] = process.argv;

// 颜色
const c = {
    reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m',
    yellow: '\x1b[33m', blue: '\x1b[34m', cyan: '\x1b[36m'
};

// CTO 控制台
if (cli === 'cto') {
    require('./cto-console.js');
    return;
}

function showHelp() {
    console.log(`
${c.cyan}Filling${c.reset} - 多 AI 协作启动器

${c.yellow}用法:${c.reset}
  filling <cli> <项目ID> <角色>
  filling cto                    # CTO 控制台

${c.yellow}参数:${c.reset}
  cli     - claude / codex / gemini / cto
  项目ID  - 项目编号 (如: 1, 2, demo)
  角色    - TD (Tech Director) 或组名 (A, B, C...)

${c.yellow}示例:${c.reset}
  filling cto             # 启动 CTO 控制台
  filling codex 1 A       # 项目1 A组用 Codex
  filling claude 1 TD     # 项目1 TD 用 Claude
  filling gemini 2 B      # 项目2 B组用 Gemini

${c.yellow}TD 专属命令:${c.reset}
  swarm task "标题"       # 创建任务
  swarm assign 1 @A       # 分配任务
  swarm block 1 2         # 设置依赖 (1完成后才能做2)
  swarm tasks             # 查看任务
  swarm watch             # 监听日志

${c.yellow}组员命令:${c.reset}
  swarm tasks             # 查看我的任务
  swarm log "进度"        # 写日志
  swarm done 1            # 完成任务
`);
}

if (!cli || !projectId || !role) {
    showHelp();
    process.exit(1);
}

// 验证 CLI 类型
const validCLIs = ['claude', 'codex', 'gemini'];
if (!validCLIs.includes(cli)) {
    console.log(`${c.red}错误: CLI 必须是 claude/codex/gemini${c.reset}`);
    process.exit(1);
}

// 项目名
const projectName = `filling-${projectId}`;

// 确保项目存在
const project = new Project(projectName);
if (!project.exists()) {
    project.init();
    console.log(`${c.green}✓ 项目 ${projectName} 已创建${c.reset}`);
}


// 设置环境变量
const env = {
    ...process.env,
    SWARM_PROJECT: projectName,
    SWARM_ROLE: role
};

// 构建系统提示
const isTD = role === 'TD';
const prompt = isTD
    ? `你是项目 ${projectId} 的 Tech Director (TD)。

【消息来源识别】
- [SWARM] 开头的消息 = 来自组员或系统的自动推送
- 没有 [SWARM] 开头 = CTO/用户直接说话，优先级最高

【工作方式 - 优先并行】
- 尽可能并行分配任务给多个组，不要串行等待
- 一个组做 A，另一个组同时做 B，提高效率
- 只有真正有依赖关系的任务才串行

【重要规则 - 你不能闲着】
1. 持续检查任务状态: swarm tasks (每 2-3 分钟)
2. 查看组员日志: swarm logs 或 swarm watch
3. 根据反馈动态调整:
   - 发现问题 → 创建新任务或修改现有任务
   - 任务完成 → 验收并分配下一个
   - 进度受阻 → 发消息协助或重新分配
4. 主动沟通: swarm send @A "反馈/建议/问题"

【命令】
- 创建任务: swarm task "标题" -d "详细描述"
- 分配任务: swarm assign 1 @A
- 设置依赖: swarm block 1,2 3
- 查看任务: swarm tasks
- 查看日志: swarm logs [组ID]
- 监听日志: swarm watch
- 发消息: swarm send @A "内容"
- 广播: swarm broadcast "内容"

【工作节奏】
- 不要等待，主动检查进度
- 看到日志更新立即响应
- 任务完成后立即验收
- 发现问题立即沟通

【环境已配置】
SWARM_PROJECT=${projectName}
SWARM_ROLE=TD`
    : `你是项目 ${projectId} 的 ${role} 组执行者。

【消息来源识别】
- [SWARM] 开头的消息 = 来自 TD 或其他组的自动推送
- 没有 [SWARM] 开头 = CTO/用户直接说话，优先级最高

【工作方式 - 优先并行】
- 优先调用 parallel agents 并行处理多个子任务
- 但要注意任务阻塞情况，被阻塞的任务需等待依赖完成
- 遇到阻塞及时汇报，TD 会协调

【重要规则 - 必须遵守】
1. 每完成一个小步骤，立即汇报: swarm log "具体做了什么"
2. 遇到问题时汇报: swarm log "遇到问题: xxx"
3. 开始任务时汇报: swarm log "开始执行: xxx"
4. 完成任务时: swarm done <编号>

【汇报频率要求】
- 每读取一个文件后汇报
- 每修改一个文件后汇报
- 每执行一个命令后汇报
- 每做出一个决策后汇报
- 至少每 2-3 分钟汇报一次进度

【命令】
- 查看任务: swarm tasks
- 汇报进度: swarm log "内容"
- 完成任务: swarm done <编号>
- 给 TD 发消息: swarm send @TD "内容"
- 给其他组发消息: swarm send @B "内容"

【环境已配置】
SWARM_PROJECT=${projectName}
SWARM_ROLE=${role}`;

// 写入临时文件
const tmpDir = os.tmpdir();
const promptFile = path.join(tmpDir, `filling-${projectId}-${role}-prompt.txt`);
fs.writeFileSync(promptFile, prompt);

// tmux session 名称 (只允许字母数字和连字符)
const safeProjectId = String(projectId).replace(/[^a-zA-Z0-9]/g, '');
const safeRole = String(role).replace(/[^a-zA-Z0-9]/g, '');
const sessionName = `filling-${safeProjectId}-${safeRole}`;

// 注册到项目 (包括 TD)
if (role === 'TD') {
    const config = project.getConfig();
    config.td = sessionName;
    project.saveConfig(config);
} else {
    project.registerGroup(role, sessionName);
}

// 检查 session 是否已存在
let sessionExists = false;
try {
    execSync(`tmux has-session -t "${sessionName}" 2>/dev/null`);
    sessionExists = true;
} catch {}

if (sessionExists) {
    // 已存在，直接 attach
    console.log(`${c.cyan}进入已有 session: ${sessionName}${c.reset}`);
    console.log(`${c.yellow}退出: Ctrl+B D${c.reset}\n`);
    spawnSync('tmux', ['attach', '-t', sessionName], { stdio: 'inherit' });
} else {
    // 创建新 session
    console.log(`${c.cyan}启动 ${cli} - 项目${projectId} ${role}${c.reset}`);
    console.log(`${c.yellow}Session: ${sessionName}${c.reset}`);
    console.log(`${c.yellow}退出: Ctrl+B D | 结束: exit${c.reset}\n`);

    // 写入启动脚本到临时文件（避免引号嵌套问题）
    const scriptFile = path.join(tmpDir, `filling-${safeProjectId}-${safeRole}-start.sh`);
    let scriptContent;
    if (cli === 'codex') {
        scriptContent = `#!/bin/bash
export SWARM_PROJECT="${projectName}"
export SWARM_ROLE="${role}"
${cli} "$(cat '${promptFile}')"
echo ""
echo "Codex 已退出。输入 'exit' 结束 session，或重新运行 codex。"
exec bash
`;
    } else {
        scriptContent = `#!/bin/bash
export SWARM_PROJECT="${projectName}"
export SWARM_ROLE="${role}"
${cli} --system-prompt "$(cat '${promptFile}')"
echo ""
echo "CLI 已退出。输入 'exit' 结束 session，或重新运行 ${cli}。"
exec bash
`;
    }
    fs.writeFileSync(scriptFile, scriptContent);
    fs.chmodSync(scriptFile, '755');

    try {
        // 创建 tmux session 并运行脚本
        execSync(`tmux new-session -d -s "${sessionName}" "bash '${scriptFile}'"`);
        // 立即 attach
        spawnSync('tmux', ['attach', '-t', sessionName], { stdio: 'inherit' });
    } catch (err) {
        // 显示详细错误
        const stderr = err.stderr ? err.stderr.toString() : '';
        const stdout = err.stdout ? err.stdout.toString() : '';
        console.log(`${c.red}启动失败: ${err.message}${c.reset}`);
        if (stderr) console.log(`${c.red}错误详情: ${stderr}${c.reset}`);
        if (stdout) console.log(`${c.yellow}输出: ${stdout}${c.reset}`);
        console.log(`${c.yellow}请确保已安装 tmux: brew install tmux${c.reset}`);
        try { fs.unlinkSync(promptFile); } catch {}
        try { fs.unlinkSync(scriptFile); } catch {}
        process.exit(1);
    }
}

// 清理临时文件 (脚本和 prompt)
try { fs.unlinkSync(promptFile); } catch {}
try { fs.unlinkSync(path.join(tmpDir, `filling-${safeProjectId}-${safeRole}-start.sh`)); } catch {}
