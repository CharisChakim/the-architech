import fs from "node:fs/promises";
import path from "node:path";
import { resolveInsideRoot } from "../sandbox.ts";
import type { ToolContext, ToolSpec } from "../registry.ts";

function sessionRoot(ctx: ToolContext): string | undefined {
  return ctx.root || ctx.session?.workspaceRoot?.trim() || undefined;
}

async function realRoot(ctx: ToolContext): Promise<string> {
  const root = sessionRoot(ctx);
  if (!root) throw new Error("Folder kerja belum ditentukan, jadi tool berkas dan perintah tidak tersedia.");
  // Root juga dilewatkan ke sandbox agar hasil relatif tidak bergantung pada symlink
  // yang mungkin dipakai pengguna sebagai nama folder kerja.
  return resolveInsideRoot(root, ".");
}

const listFiles: ToolSpec = {
  def: {
    name: "list_files",
    description:
      "Daftar isi satu folder di dalam folder kerja. Pakai untuk menemukan berkas sebelum membacanya, jangan menebak nama berkas. TIDAK rekursif: hanya satu tingkat, dan setiap entri ditandai file atau dir — untuk menelusuri lebih dalam, panggil lagi dengan path dir tersebut.",
    parameters: {
      type: "object",
      properties: {
        dir: { type: "string", description: "Path relatif terhadap folder kerja. Kosongkan untuk akarnya." },
      },
      required: [],
    },
  },
  available: (session) => Boolean(session?.workspaceRoot?.trim()),
  run: async (input: any, ctx) => {
    const root = await realRoot(ctx);
    const dir = await resolveInsideRoot(root, String(input?.dir ?? "."));
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return {
      dir: path.relative(root, dir) || ".",
      entries: entries.map((entry) => ({ name: entry.name, type: entry.isDirectory() ? "dir" : "file" })),
    };
  },
};

const readFile: ToolSpec = {
  def: {
    name: "read_file",
    description:
      "Baca isi satu berkas teks di dalam folder kerja. Hanya untuk berkas teks — berkas biner kembali sebagai karakter rusak. Isi lebih dari 60.000 karakter dipotong dan hasilnya menyertakan truncated: true; kalau itu terjadi, jangan menulis ulang berkas tersebut dari isi yang Anda terima, karena bagian yang terpotong akan hilang.",
    parameters: {
      type: "object",
      properties: { file: { type: "string", description: "Path relatif terhadap folder kerja." } },
      required: ["file"],
    },
  },
  available: (session) => Boolean(session?.workspaceRoot?.trim()),
  run: async (input: any, ctx) => {
    const root = await realRoot(ctx);
    const file = await resolveInsideRoot(root, String(input?.file ?? ""));
    const text = await fs.readFile(file, "utf8");
    const maxReadChars = ctx.limits.maxReadChars;
    return {
      file: path.relative(root, file),
      truncated: text.length > maxReadChars,
      content: text.slice(0, maxReadChars),
    };
  },
};

const writeFile: ToolSpec = {
  def: {
    name: "write_file",
    description:
      "Tulis berkas di dalam folder kerja. Menimpa SELURUH isi kalau berkas sudah ada — tidak ada penyisipan atau penambalan sebagian, jadi baca dulu berkas yang mau diubah dan kirim kembali isi utuhnya. Folder induk yang belum ada dibuatkan sendiri.",
    parameters: {
      type: "object",
      properties: {
        file: { type: "string", description: "Path relatif terhadap folder kerja." },
        content: { type: "string", description: "Isi berkas seutuhnya setelah perubahan." },
      },
      required: ["file", "content"],
    },
  },
  available: (session) => Boolean(session?.workspaceRoot?.trim()),
  run: async (input: any, ctx) => {
    const root = await realRoot(ctx);
    const file = await resolveInsideRoot(root, String(input?.file ?? ""));
    await fs.mkdir(path.dirname(file), { recursive: true });
    const content = String(input?.content ?? "");
    await fs.writeFile(file, content, "utf8");
    return { ok: true, file: path.relative(root, file), bytes: Buffer.byteLength(content, "utf8") };
  },
};

// Array ini menjadi satu unit supaya registry dapat menyaring semua tool berkas
// dengan izin folder yang sama tanpa mengubah schema provider.
export const fsTools: ToolSpec[] = [listFiles, readFile, writeFile];

