#!/usr/bin/env bash

BASE_DIR="$(pwd)"
REPO_NAME="$(basename "$BASE_DIR")"
SWARM_ROOT="$(dirname "$BASE_DIR")/.${REPO_NAME}-swarm"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SWARM_SH="$SCRIPT_DIR/swarm.sh"

load_tasks() {
    TASKS=()

    if [ -f "$SWARM_SH" ]; then
        eval "$(sed -n '/^TASKS=(/,/)/p' "$SWARM_SH")"
    fi

    if [ -d "$SWARM_ROOT" ]; then
        for dir in "$SWARM_ROOT"/*/; do
            [ -d "$dir" ] || continue
            local task
            task="$(basename "$dir")"
            local found=false
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

    while IFS= read -r branch; do
        [ -n "$branch" ] || continue
        local task="${branch#refs/heads/swarm/}"
        local found=false
        for t in "${TASKS[@]}"; do
            if [ "$t" = "$task" ]; then
                found=true
                break
            fi
        done
        if [ "$found" = false ]; then
            TASKS+=("$task")
        fi
    done < <(git for-each-ref --format='%(refname)' refs/heads/swarm/ 2>/dev/null)
}

clean_task() {
    local task="$1"
    local del_branch="${2:-true}"
    local rm_swarm="${3:-true}"
    local wt_dir="$SWARM_ROOT/$task"
    local branch_name="swarm/$task"

    echo "Membersihkan task: [$task]..."

    if [ -L "$wt_dir/node_modules" ]; then
        rm -f "$wt_dir/node_modules"
    fi

    if [ -d "$wt_dir" ]; then
        echo "Menghapus worktree: $task..."
        git worktree remove --force "$wt_dir" 2>/dev/null || rm -rf "$wt_dir"
    else
        echo "Worktree $task sudah tidak ada."
    fi

    if [ "$del_branch" = true ]; then
        if git show-ref --verify --quiet "refs/heads/$branch_name"; then
            echo "Menghapus branch: $branch_name"
            git branch -D "$branch_name"
        else
            echo "Branch $branch_name sudah tidak ada."
        fi
    fi

    if [ "$rm_swarm" = true ]; then
        if [ -f "$SWARM_SH" ]; then
            sed -i "/^[[:space:]]*[\"']$task[\"']/d" "$SWARM_SH"
            echo "Task [$task] dihapus dari daftar TASKS di swarm.sh."
        fi
    fi

    git worktree prune
    rmdir "$SWARM_ROOT" 2>/dev/null || true
    echo "Pembersihan [$task] selesai!"
}

clean_all() {
    local del_branch="${1:-true}"
    local rm_swarm="${2:-true}"

    echo "Memulai pembersihan semua task Swarm..."
    load_tasks
    for t in "${TASKS[@]}"; do
        clean_task "$t" "$del_branch" "$rm_swarm"
    done
    git worktree prune
    rmdir "$SWARM_ROOT" 2>/dev/null || true
    echo "Beres! Laboratorium kembali bersih mengkilap, Assistant-kun!"
}

CLI_TASK=""
CLI_ALL=false

for arg in "$@"; do
    case "$arg" in
        --all|-a)
            CLI_ALL=true
            ;;
        *)
            if [ -z "$CLI_TASK" ]; then
                CLI_TASK="$arg"
            fi
            ;;
    esac
done

if [ "$CLI_ALL" = true ]; then
    clean_all true true
    exit 0
fi

if [ -n "$CLI_TASK" ]; then
    clean_task "$CLI_TASK" true true
    exit 0
fi

while true; do
    load_tasks

    if [ ${#TASKS[@]} -eq 0 ]; then
        echo ""
        echo "Tidak ada task swarm yang ditemukan!"
        break
    fi

    echo ""
    echo "=== MENU PEMBERSIHAN SWARM ==="
    for i in "${!TASKS[@]}"; do
        t="${TASKS[$i]}"
        wt_dir="$SWARM_ROOT/$t"
        branch_name="swarm/$t"

        wt_status="Tidak ada"
        if [ -d "$wt_dir" ]; then
            wt_status="Ada"
        fi

        br_status="Tidak ada"
        if git show-ref --verify --quiet "refs/heads/$branch_name"; then
            br_status="Ada"
        fi

        sw_status="Tidak ada"
        if [ -f "$SWARM_SH" ] && grep -qE "^[[:space:]]*[\"']$t[\"']" "$SWARM_SH"; then
            sw_status="Ada"
        fi

        printf "  [%d] %-14s (Worktree: %-9s | Branch: %-9s | swarm.sh: %s)\n" "$((i+1))" "$t" "$wt_status" "$br_status" "$sw_status"
    done

    echo "-------------------------------------------"
    echo "  [a] Bersihkan SEMUA task sekaligus"
    echo "  [q] Keluar"
    echo "==========================================="
    read -rp "Pilih task yang mau dibersihkan (1-${#TASKS[@]}/a/q): " choice

    case "$choice" in
        [1-9]*)
            idx=$((choice - 1))
            if [ "$idx" -ge 0 ] && [ "$idx" -lt "${#TASKS[@]}" ]; then
                target="${TASKS[$idx]}"
                clean_task "$target" true true
            else
                echo "Nomor tidak valid, Assistant-kun!"
            fi
            ;;
        a|A)
            read -rp "Yakin mau membersihkan SEMUA task? (y/N): " confirm_all
            if [[ "$confirm_all" =~ ^[Yy]$ ]]; then
                clean_all true true
            fi
            ;;
        q|Q)
            echo "Keluar dari menu pembersihan Swarm."
            break
            ;;
        *)
            echo "Pilihan tidak dikenali!"
            ;;
    esac
done
