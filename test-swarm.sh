#!/usr/bin/env bash

BASE_DIR="$(pwd)"
REPO_NAME="$(basename "$BASE_DIR")"
SWARM_ROOT="$(dirname "$BASE_DIR")/.${REPO_NAME}-swarm"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SWARM_SH="$SCRIPT_DIR/swarm.sh"

# Mode resolusi konflik otomatis:
# "union"  = Gabungkan kode kedua agen tanpa tanda <<<<<<< (Default terbaik untuk gabung banyak task)
# "theirs" = Menangkan baris milik agen yang baru ditarik (Timpa baris yang bentrok)
# "force"  = Langsung copy-overwrite seluruh file dari agen ke Main Tree (100% identik dengan worktree agen)
CONFLICT_MODE="theirs"

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

get_base_commit() {
    local wt_dir="$1"
    local wt_head main_head base
    wt_head="$(git -C "$wt_dir" rev-parse HEAD 2>/dev/null)" || { echo "HEAD"; return; }
    main_head="$(git -C "$BASE_DIR" rev-parse HEAD 2>/dev/null)" || { echo "HEAD"; return; }
    base="$(git -C "$BASE_DIR" merge-base "$main_head" "$wt_head" 2>/dev/null)"
    if [ -n "$base" ]; then
        echo "$base"
    else
        echo "HEAD"
    fi
}

apply_task() {
    local task="$1"
    local wt_dir="$SWARM_ROOT/$task"

    if [ ! -d "$wt_dir" ]; then
        echo "Folder worktree untuk [$task] tidak ditemukan!"
        return 1
    fi

    echo "Menarik perubahan dari agen [$task] ke Main Tree (Mode: $CONFLICT_MODE)..."
    prepare_worktree_diff "$wt_dir"

    local base_commit
    base_commit="$(get_base_commit "$wt_dir")"

    mapfile -t changed_files < <(git -C "$wt_dir" diff --name-only "$base_commit" -- . ':(exclude)node_modules')

    if [ ${#changed_files[@]} -eq 0 ]; then
        echo "Agen [$task] belum membuat perubahan kode apa pun (kosong)."
        return 0
    fi

    for file in "${changed_files[@]}"; do
        local wt_file="$wt_dir/$file"
        local main_file="$BASE_DIR/$file"

        if [ ! -e "$wt_file" ]; then
            rm -f "$main_file"
            echo "  [-] Dihapus: $file"
            continue
        fi

        mkdir -p "$(dirname "$main_file")"

        if [ ! -e "$main_file" ] || [ "$CONFLICT_MODE" = "force" ]; then
            cp -f "$wt_file" "$main_file"
            echo "  [F] Disalin langsung: $file"
            continue
        fi

        local tmp_base
        tmp_base="$(mktemp)"
        if git -C "$wt_dir" show "$base_commit:$file" > "$tmp_base" 2>/dev/null; then
            if [ "$CONFLICT_MODE" = "theirs" ]; then
                git merge-file --theirs -q "$main_file" "$tmp_base" "$wt_file"
                echo "  [M] Digabung (Auto-Theirs, 0 conflict): $file"
            else
                git merge-file --union -q "$main_file" "$tmp_base" "$wt_file"
                echo "  [M] Digabung (Auto-Union, 0 conflict): $file"
            fi
        else
            cp -f "$wt_file" "$main_file"
            echo "  [+] File baru: $file"
        fi
        rm -f "$tmp_base"
    done

    git reset -q HEAD 2>/dev/null || true

    echo "Berhasil 100% TANPA CONFLICT MARKER! Silakan langsung test app, Assistant-kun~"
}

unapply_task() {
    local task="$1"
    local wt_dir="$SWARM_ROOT/$task"

    echo "Mencabut kembali perubahan [$task] dari Main Tree..."
    prepare_worktree_diff "$wt_dir"

    local base_commit
    base_commit="$(get_base_commit "$wt_dir")"

    if git -C "$wt_dir" diff "$base_commit" -- . ':(exclude)node_modules' | git apply -R --3way --whitespace=nowarn - 2>/dev/null; then
        git reset -q HEAD 2>/dev/null || true
        echo "Perubahan dari [$task] berhasil dilepas dari Main Tree!"
    else
        echo "Gagal melepas patch dengan git apply -R, mengembalikan file yang disentuh [$task] ke HEAD..."
        mapfile -t changed_files < <(git -C "$wt_dir" diff --name-only "$base_commit" -- . ':(exclude)node_modules')
        for file in "${changed_files[@]}"; do
            if git cat-file -e "HEAD:$file" 2>/dev/null; then
                git checkout HEAD -- "$file" 2>/dev/null
            else
                rm -f "$BASE_DIR/$file"
            fi
        done
        echo "File yang berkaitan dengan [$task] telah di-reset ke kondisi awal!"
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
            local base_commit
            base_commit="$(get_base_commit "$wt_dir")"
            local stat
            stat="$(git -C "$wt_dir" diff --shortstat "$base_commit" -- . ':(exclude)node_modules')"
            if [ -n "$stat" ]; then
                echo "  [$((i+1))] $t :$stat"
                git -C "$wt_dir" diff --name-status "$base_commit" -- . ':(exclude)node_modules' | sed 's/^/       /'
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
    echo "=== KOYORI'S ZERO-CONFLICT SWARM MENU ==="
    echo "  Mode Saat Ini: [$CONFLICT_MODE] (Ketik 'm' untuk ganti mode)"
    echo "-------------------------------------------"
    for i in "${!TASKS[@]}"; do
        t="${TASKS[$i]}"
        wt_dir="$SWARM_ROOT/$t"
        status_badge="Kosong"
        if [ -d "$wt_dir" ]; then
            prepare_worktree_diff "$wt_dir"
            base_commit="$(get_base_commit "$wt_dir")"
            changes_count=$(git -C "$wt_dir" diff --name-only "$base_commit" -- . ':(exclude)node_modules' | sed '/^\s*$/d' | wc -l)
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
    echo "  [m] Ganti Mode Merge (union / theirs / force)"
    echo "  [u] Undo / Lepas 1 task dari Main Tree"
    echo "  [s] Lihat detail file yang diubah tiap agen"
    echo "  [r] Reset Main Tree (Kembalikan ke kondisi bersih sebelum tarik)"
    echo "  [q] Keluar"
    echo "==========================================="
    read -rp "Pilih aksi (1-${#TASKS[@]}/a/m/u/s/r/q): " choice

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
        m|M)
            if [ "$CONFLICT_MODE" = "union" ]; then
                CONFLICT_MODE="theirs"
            elif [ "$CONFLICT_MODE" = "theirs" ]; then
                CONFLICT_MODE="force"
            else
                CONFLICT_MODE="union"
            fi
            echo "Mode berhasil diubah ke: [$CONFLICT_MODE]!"
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
