import { execFile } from "node:child_process";
import { resolveInsideRoot } from "../sandbox.ts";
import type { ToolContext, ToolSpec } from "../registry.ts";

const SHELL_NOTE =
  process.platform === "win32"
    ? "Shell-nya Windows PowerShell 5.1, bukan bash. Operator '&&' dan '||' TIDAK ada dan menyebabkan error parser; pakai ';' untuk berurutan, atau '; if ($?) { ... }' untuk menjalankan hanya bila perintah sebelumnya berhasil. Tidak ada head, tail, which, atau touch — pakai Select-Object -First/-Last, Get-Command, dan New-Item."
    : "Shell-nya /bin/sh.";

function sessionRoot(ctx: ToolContext): string | undefined {
  return ctx.root || ctx.session?.workspaceRoot?.trim() || undefined;
}

function runCommand(
  command: string,
  cwd: string,
  timeoutMs: number,
  maxOutputChars: number,
  signal: AbortSignal
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    // Shell dipilih berdasarkan platform karena model perlu sintaks yang benar,
    // sementara signal tetap diteruskan agar child mati saat klien terputus.
    const shell = process.platform === "win32" ? "powershell.exe" : "/bin/sh";
    const args = process.platform === "win32" ? ["-NoProfile", "-Command", command] : ["-c", command];

    execFile(
      shell,
      args,
      {
        cwd,
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
        windowsHide: true,
        signal,
      },
      (err: any, stdout, stderr) => {
        const cut = (value: string) =>
          value.length > maxOutputChars ? value.slice(0, maxOutputChars) + "\n...[dipangkas]" : value;
        resolve({
          stdout: cut(stdout || ""),
          stderr: cut(stderr || (err?.killed ? `Dihentikan setelah ${timeoutMs / 1000} detik.` : "")),
          exitCode: typeof err?.code === "number" ? err.code : err ? 1 : 0,
        });
      }
    );
  });
}

const runCommandTool: ToolSpec = {
  def: {
    name: "run_command",
    description:
      `Jalankan satu perintah shell dengan folder kerja sebagai direktori aktif. Kembalikan stdout, stderr, dan exit code. ${SHELL_NOTE} ` +
      "Perintah yang berjalan lebih dari dua menit dihentikan, dan keluaran di atas 20.000 karakter dipotong. " +
      "Perintah berjalan tanpa pengawasan: tidak ada yang bisa menjawab prompt interaktif, jadi pakai flag non-interaktif. " +
      "Jelaskan lebih dulu perintah yang menghapus atau menimpa sesuatu, dan jangan jalankan kalau pengguna belum memintanya.",
    parameters: {
      type: "object",
      properties: { command: { type: "string", description: "Perintah lengkap, boleh memakai pipe dan operator." } },
      required: ["command"],
    },
  },
  available: (session) => Boolean(session?.workspaceRoot?.trim()) && Boolean(session?.allowShell),
  run: async (input: any, ctx) => {
    const root = sessionRoot(ctx);
    if (!root) return { error: "Folder kerja belum ditentukan, jadi tool berkas dan perintah tidak tersedia." };
    if (!ctx.session?.allowShell) return { error: "Menjalankan perintah belum diizinkan untuk proyek ini." };

    const command = String(input?.command ?? "").trim();
    if (!command) return { error: "Perintah kosong." };

    // Persetujuan datang sebelum child dibuat, sehingga penolakan tidak pernah
    // menimbulkan efek samping dan tetap menjadi hasil tool biasa.
    const cwd = await resolveInsideRoot(root, ".");
    const approved = Boolean(await ctx.elicit({ kind: "approval", command, cwd, action: "command" }));
    if (!approved) {
      return { error: "Pengguna menolak menjalankan perintah ini.", command, ranAnything: false };
    }

    const result = await runCommand(
      command,
      cwd,
      ctx.limits.commandTimeoutMs,
      ctx.limits.maxOutputChars,
      ctx.signal
    );
    return { command, ...result };
  },
};

export const shellTool: ToolSpec = runCommandTool;
export const shellTools: ToolSpec[] = [runCommandTool];

