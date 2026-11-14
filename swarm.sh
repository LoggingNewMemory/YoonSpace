#!/usr/bin/env bash
set -e

TASKS=(
    "shields"
    "status-bar"
    "freeze-fix"
    "caching"
    "dual-resize"
)

BASE_DIR="$(pwd)"
REPO_NAME="$(basename "$BASE_DIR")"
SWARM_ROOT="$(dirname "$BASE_DIR")/.${REPO_NAME}-swarm"

echo "Konkoyoo~! Memulai inisialisasi Agentic Swarm untuk: $REPO_NAME"
mkdir -p "$SWARM_ROOT"

for task in "${TASKS[@]}"; do
    WORKTREE_DIR="$SWARM_ROOT/$task"
    BRANCH_NAME="swarm/$task"

    echo "----------------------------------------"
    echo "Menyiapkan kloningan lab untuk task: [$task]"

    if [ -d "$WORKTREE_DIR" ]; then
        echo "Worktree $WORKTREE_DIR sudah ada, melewati pembuatan worktree..."
    else
        if git show-ref --verify --quiet "refs/heads/$BRANCH_NAME"; then
            git worktree add "$WORKTREE_DIR" "$BRANCH_NAME"
        else
            git worktree add -b "$BRANCH_NAME" "$WORKTREE_DIR" HEAD
        fi
    fi

    if [ -d "$BASE_DIR/node_modules" ] && [ ! -e "$WORKTREE_DIR/node_modules" ]; then
        ln -s "$BASE_DIR/node_modules" "$WORKTREE_DIR/node_modules"
        echo "Berhasil symlink node_modules!"
    fi

    if command -v konsole &> /dev/null; then
        konsole --new-tab --workdir "$WORKTREE_DIR" \
            -p tabtitle="Swarm: $task" \
            -e fish -c "echo 'Agent Branch: $BRANCH_NAME'; agy --dangerously-skip-permissions; exec fish" &
        sleep 0.3
    else
        echo "Siap di: $WORKTREE_DIR (Silakan cd ke sana dan jalankan agy)"
    fi
done

echo "----------------------------------------"
echo "Semua agen sudah berada di dimensi masing-masing! Selamat bereksperimen, Assistant-kun~"