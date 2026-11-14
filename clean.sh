#!/usr/bin/env bash

BASE_DIR="$(pwd)"
REPO_NAME="$(basename "$BASE_DIR")"
SWARM_ROOT="$(dirname "$BASE_DIR")/.${REPO_NAME}-swarm"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SWARM_SH="$SCRIPT_DIR/swarm.sh"
DELETE_BRANCHES=false

TASKS=()

if [ -f "$SWARM_SH" ]; then
    eval "$(sed -n '/^TASKS=(/,/)/p' "$SWARM_SH")"
fi

if [ -d "$SWARM_ROOT" ]; then
    for dir in "$SWARM_ROOT"/*/; do
        [ -d "$dir" ] || continue
        task="$(basename "$dir")"
        found=false
        for t in "${TASKS[@]}"; do
            if [ "$t" = "$task" ]; then
                found=true
                break
            fi
        done
        if [ "$found" = false ]; then
            TASKS+=("$task")
        fi
    done
fi

if [[ "$1" == "--delete-branches" || "$1" == "-d" ]]; then
    DELETE_BRANCHES=true
fi

echo "Memulai pembersihan laboratorium Swarm..."

for task in "${TASKS[@]}"; do
    WORKTREE_DIR="$SWARM_ROOT/$task"
    BRANCH_NAME="swarm/$task"

    if [ -L "$WORKTREE_DIR/node_modules" ]; then
        rm "$WORKTREE_DIR/node_modules"
    fi

    if [ -d "$WORKTREE_DIR" ]; then
        echo "Menghapus worktree: $task..."
        git worktree remove --force "$WORKTREE_DIR" 2>/dev/null || rm -rf "$WORKTREE_DIR"
    else
        echo "Worktree $task sudah tidak ada."
    fi

    if [ "$DELETE_BRANCHES" = true ]; then
        if git show-ref --verify --quiet "refs/heads/$BRANCH_NAME"; then
            echo "Menghapus branch: $BRANCH_NAME"
            git branch -D "$BRANCH_NAME"
        fi
    fi
done

git worktree prune
rmdir "$SWARM_ROOT" 2>/dev/null || true

echo "Beres! Laboratorium kembali bersih mengkilap, Assistant-kun!"
