#!/usr/bin/env bash

BASE_DIR="$(pwd)"
REPO_NAME="$(basename "$BASE_DIR")"
SWARM_ROOT="$(dirname "$BASE_DIR")/.${REPO_NAME}-swarm"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SWARM_SH="$SCRIPT_DIR/swarm.sh"

TASKS=()

if [ -f "$SWARM_SH" ]; then
    eval "$(sed -n '/^TASKS=(/,/^)/p' "$SWARM_SH")"
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

if [ ${#TASKS[@]} -eq 0 ]; then
    echo "Tidak ada task swarm yang ditemukan di $SWARM_ROOT!"
    exit 1
fi

prepare_worktree_diff() {
    local wt_dir="$1"
    git -C "$wt_dir" add -N . 2>/dev/null
    git -C "$wt_dir" reset -q HEAD -- node_modules 2>/dev/null || true
}

apply_task() {
    local task="$1"
    local wt_dir="$SWARM_ROOT/$task"

    if [ ! -d "$wt_dir" ]; then
        echo "Folder worktree untuk [$task] tidak ditemukan!"
        return 1
    fi

    echo "Menarik perubahan dari agen [$task] ke Main Tree..."
    prepare_worktree_diff "$wt_dir"

    if git -C "$wt_dir" diff --quiet HEAD -- . ':(exclude)node_modules'; then
        echo "Agen [$task] belum membuat perubahan kode apa pun (kosong)."
        return 0
    fi

    if git -C "$wt_dir" diff HEAD -- . ':(exclude)node_modules' | git apply --3way --whitespace=nowarn -; then
        echo "Berhasil! Perubahan dari [$task] sudah masuk ke Main Tree (Silakan cek VS Code & test app!)."
    else
        echo "Ada sedikit konflik baris saat menggabungkan [$task]!"
        echo "Cek tanda <<<<<<< di VS Code kamu untuk merapikannya ya, Assistant-kun!"
    fi
}

unapply_task() {
    local task="$1"
    local wt_dir="$SWARM_ROOT/$task"

    echo "Mencabut kembali perubahan [$task] dari Main Tree..."
    prepare_worktree_diff "$wt_dir"

    if git -C "$wt_dir" diff HEAD -- . ':(exclude)node_modules' | git apply -R --3way --whitespace=nowarn -; then
        echo "Perubahan dari [$task] berhasil dilepas dari Main Tree!"
    else
        echo "Gagal melepas patch secara otomatis (mungkin sudah tercampur editan lain)."
    fi
}

show_summary() {
    echo ""
    echo "=== RINGKASAN HASIL KERJA AGEN SWARM ==="
    for i in "${!TASKS[@]}"; do
        local t="${TASKS[$i]}"
        local wt_dir="$SWARM_ROOT/$t"
        if [ -d "$wt_dir" ]; then
            prepare_worktree_diff "$wt_dir"
            local stat
            stat="$(git -C "$wt_dir" diff --shortstat HEAD -- . ':(exclude)node_modules')"
            if [ -n "$stat" ]; then
                echo "  [$((i+1))] $t :$stat"
                git -C "$wt_dir" status -s -- . ':(exclude)node_modules' | sed 's/^/       /'
            else
                echo "  [$((i+1))] $t : (Tidak ada perubahan)"
            fi
        else
            echo "  [$((i+1))] $t : (Worktree tidak ditemukan)"
        fi
    done
    echo "==========================================="
}

while true; do
    echo ""
    echo "=== KOYORI'S SWARM TESTER MENU ==="
    for i in "${!TASKS[@]}"; do
        t="${TASKS[$i]}"
        wt_dir="$SWARM_ROOT/$t"
        status_badge="Kosong"
        if [ -d "$wt_dir" ]; then
            prepare_worktree_diff "$wt_dir"
            changes_count=$(git -C "$wt_dir" status -s -- . ':(exclude)node_modules' | wc -l)
            if [ "$changes_count" -gt 0 ]; then
                status_badge="$changes_count file diubah"
            fi
        else
            status_badge="Tidak ada"
        fi
        printf "  [%d] Tarik %-14s (%s)\n" "$((i+1))" "$t" "$status_badge"
    done
    echo "-------------------------------------------"
    echo "  [a] Tarik SEMUA task sekaligus ke Main Tree"
    echo "  [u] Undo / Lepas 1 task dari Main Tree"
    echo "  [s] Lihat detail file yang diubah tiap agen"
    echo "  [r] Reset Main Tree (Kembalikan ke kondisi bersih sebelum tarik)"
    echo "  [q] Keluar"
    echo "==========================================="
    read -rp "Pilih aksi (1-${#TASKS[@]}/a/u/s/r/q): " choice

    case "$choice" in
        [1-9]*)
            idx=$((choice - 1))
            if [ "$idx" -ge 0 ] && [ "$idx" -lt "${#TASKS[@]}" ]; then
                apply_task "${TASKS[$idx]}"
            else
                echo "Nomor tidak valid, Assistant-kun!"
            fi
            ;;
        a|A)
            echo "Menarik semua task secara berurutan..."
            for t in "${TASKS[@]}"; do
                apply_task "$t"
            done
            ;;
        u|U)
            read -rp "Masukkan nomor task yang mau dilepas (1-${#TASKS[@]}): " u_choice
            u_idx=$((u_choice - 1))
            if [ "$u_idx" -ge 0 ] && [ "$u_idx" -lt "${#TASKS[@]}" ]; then
                unapply_task "${TASKS[$u_idx]}"
            else
                echo "Nomor tidak valid!"
            fi
            ;;
        s|S)
            show_summary
            ;;
        r|R)
            read -rp "Yakin mau mereset semua perubahan yang belum di-commit di Main Tree? (y/N): " confirm
            if [[ "$confirm" =~ ^[Yy]$ ]]; then
                git reset --hard HEAD
                git clean -fd
                echo "Main Tree kembali bersih! (Kodingan asli di folder Swarm tetap 100% aman!)"
            fi
            ;;
        q|Q)
            echo "Sampai jumpa lagi di eksperimen berikutnya, Assistant-kun~!"
            break
            ;;
        *)
            echo "Pilihan tidak dikenali!"
            ;;
    esac
done