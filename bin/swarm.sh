#!/bin/bash
# Agent Swarm - 多 AI Agent 协作启动脚本
# 使用 tmux 管理多个 CLI 进程

set -e

SWARM_DIR="$HOME/.agent-swarm"
TASKS_FILE="$SWARM_DIR/tasks.json"
AGENTS_FILE="$SWARM_DIR/agents.json"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 初始化目录
init() {
    mkdir -p "$SWARM_DIR"
    [ -f "$TASKS_FILE" ] || echo '[]' > "$TASKS_FILE"
    [ -f "$AGENTS_FILE" ] || echo '{}' > "$AGENTS_FILE"
    echo -e "${GREEN}✓ Swarm 初始化完成${NC}"
}

# 启动单个 Agent
start_agent() {
    local name=$1
    local cli=${2:-claude}  # 默认 claude
    local prompt=${3:-"你是 $name 团队"}

    # 检查 session 是否已存在
    if tmux has-session -t "swarm-$name" 2>/dev/null; then
        echo -e "${YELLOW}⚠ Agent $name 已在运行${NC}"
        return 1
    fi

    # 创建 tmux session
    case $cli in
        claude)
            tmux new-session -d -s "swarm-$name" "claude --system-prompt '$prompt'"
            ;;
        codex)
            tmux new-session -d -s "swarm-$name" "codex --prompt '$prompt'"
            ;;
        gemini)
            tmux new-session -d -s "swarm-$name" "gemini --system-prompt '$prompt'"
            ;;
        *)
            echo -e "${RED}✗ 未知 CLI: $cli${NC}"
            return 1
            ;;
    esac

    # 记录 agent 信息
    local agents=$(cat "$AGENTS_FILE")
    echo "$agents" | jq --arg name "$name" --arg cli "$cli" --arg prompt "$prompt" \
        '. + {($name): {"cli": $cli, "prompt": $prompt, "status": "running", "started_at": now}}' \
        > "$AGENTS_FILE"

    echo -e "${GREEN}✓ Agent $name ($cli) 已启动${NC}"
}

# 停止单个 Agent
stop_agent() {
    local name=$1

    if tmux has-session -t "swarm-$name" 2>/dev/null; then
        tmux kill-session -t "swarm-$name"

        # 更新状态
        local agents=$(cat "$AGENTS_FILE")
        echo "$agents" | jq --arg name "$name" \
            '.[$name].status = "stopped"' > "$AGENTS_FILE"

        echo -e "${GREEN}✓ Agent $name 已停止${NC}"
    else
        echo -e "${YELLOW}⚠ Agent $name 未在运行${NC}"
    fi
}

# 向 Agent 发送消息
send_message() {
    local target=$1
    shift
    local message="$*"

    if [ "$target" = "all" ]; then
        # 广播给所有 agent
        for session in $(tmux list-sessions -F '#{session_name}' 2>/dev/null | grep '^swarm-'); do
            tmux send-keys -t "$session" "$message" Enter
        done
        echo -e "${GREEN}✓ 已广播消息给所有 Agent${NC}"
    else
        if tmux has-session -t "swarm-$target" 2>/dev/null; then
            tmux send-keys -t "swarm-$target" "$message" Enter
            echo -e "${GREEN}✓ 已发送消息给 $target${NC}"
        else
            echo -e "${RED}✗ Agent $target 未在运行${NC}"
            return 1
        fi
    fi
}

# 列出所有 Agent
list_agents() {
    echo -e "${BLUE}=== Agent 列表 ===${NC}"

    local running=0
    for session in $(tmux list-sessions -F '#{session_name}' 2>/dev/null | grep '^swarm-' || true); do
        local name=${session#swarm-}
        echo -e "  ${GREEN}●${NC} $name (运行中)"
        ((running++)) || true
    done

    if [ $running -eq 0 ]; then
        echo -e "  ${YELLOW}没有运行中的 Agent${NC}"
    fi
}

# 查看 Agent 输出
attach_agent() {
    local name=$1

    if tmux has-session -t "swarm-$name" 2>/dev/null; then
        tmux attach -t "swarm-$name"
    else
        echo -e "${RED}✗ Agent $name 未在运行${NC}"
        return 1
    fi
}

# 启动预设团队
start_team() {
    local preset=$1

    case $preset in
        default)
            start_agent "architect" "claude" "[🏛️ 架构师] 你负责系统架构设计和技术决策"
            start_agent "frontend" "codex" "[🎨 前端] 你负责 Vue/React 前端开发"
            start_agent "backend" "gemini" "[⚙️ 后端] 你负责 Node.js/API 后端开发"
            ;;
        full)
            start_agent "director" "claude" "[👔 技术总监] 你负责分配任务和协调团队"
            start_agent "architect" "claude" "[🏛️ 架构师] 你负责系统架构设计"
            start_agent "frontend" "codex" "[🎨 前端] 你负责前端开发"
            start_agent "backend" "gemini" "[⚙️ 后端] 你负责后端开发"
            start_agent "reviewer" "claude" "[🔍 审查] 你负责代码审查和质量把控"
            ;;
        *)
            echo -e "${RED}✗ 未知预设: $preset${NC}"
            echo "可用预设: default, full"
            return 1
            ;;
    esac

    echo -e "${GREEN}✓ 团队 $preset 已启动${NC}"
}

# 停止所有 Agent
stop_all() {
    for session in $(tmux list-sessions -F '#{session_name}' 2>/dev/null | grep '^swarm-' || true); do
        tmux kill-session -t "$session"
    done
    echo -e "${GREEN}✓ 所有 Agent 已停止${NC}"
}

# 显示帮助
show_help() {
    cat << EOF
${BLUE}Agent Swarm - 多 AI Agent 协作工具${NC}

用法: swarm <命令> [参数]

命令:
  init                      初始化 Swarm
  start <name> [cli] [prompt]  启动单个 Agent
  stop <name>               停止单个 Agent
  send <target> <message>   发送消息 (target=all 广播)
  list                      列出所有 Agent
  attach <name>             查看 Agent 终端
  team <preset>             启动预设团队 (default/full)
  stop-all                  停止所有 Agent
  tui                       启动 TUI 控制台

示例:
  swarm init
  swarm team default
  swarm send architect "请设计用户认证架构"
  swarm send all "项目启动，任务是实现 OAuth2"
  swarm attach frontend
EOF
}

# 主入口
case ${1:-help} in
    init)       init ;;
    start)      start_agent "$2" "$3" "$4" ;;
    stop)       stop_agent "$2" ;;
    send)       send_message "$2" "${@:3}" ;;
    list)       list_agents ;;
    attach)     attach_agent "$2" ;;
    team)       start_team "$2" ;;
    stop-all)   stop_all ;;
    tui)        node "$(dirname "$0")/../tui/index.js" ;;
    help|*)     show_help ;;
esac
