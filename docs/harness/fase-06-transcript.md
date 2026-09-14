# Tugas: Fase 6 — transcript yang terbaca

> Konteks besarnya ada di [`PLAN.md`](PLAN.md); aturan yang berlaku untuk semua fase
> ada di [`README.md`](README.md). Baca keduanya sebelum mulai.

**Prasyarat:** Fase 3 (event `tool_start`/`tool_done` membawa `id`) dan fase 5 (shell)
sudah mendarat. Kalau fase 4 sudah mendarat juga, renderer `edit_file` bisa langsung
memakai `result.patch`; kalau belum, renderer itu pakai fallback-nya.

## Masalah yang diselesaikan

Panel chat sekarang **menerima lalu membuang** dua hal terpenting di sebuah harness:
`tool_start.input` dan `tool_done.result` sampai di klien dan tidak pernah ditampilkan
(`ChatPanel.tsx:135-145`). Yang terlihat pengguna hanya satu baris berisi nama tool.

Lebih buruk: `ChatPanel.tsx:176` melakukan `if (!open) return null`, sehingga **seluruh
percakapan hancur setiap kali panel ditutup**. Untuk sebuah harness itu cacat, bukan
detail.

Ditambah satu bug pemasangan: `tool_done` dicocokkan dengan "entri terakhir yang masih
running" (`ChatPanel.tsx:140`), padahal satu giliran bisa memanggil beberapa tool.

## File

**Baru:**

| Berkas | ~LOC | Isi |
|---|---|---|
| `src/lib/agentEvents.ts` | 60 | cermin tipe `AgentEvent` + union `Entry` |
| `src/lib/useAgentRun.ts` | 170 | seluruh logika yang sekarang ada di dalam `ChatPanel` |
| `src/components/agent/AgentPane.tsx` | 180 | daftar transcript + keadaan kosong + chip folder |
| `src/components/agent/ToolCallCard.tsx` | 110 | kartu satu tool call |
| `src/components/agent/toolRenderers.tsx` | 260 | registry renderer + DiffView + TerminalView + JsonView |
| `src/components/agent/ApprovalCard.tsx` | 70 | kartu persetujuan perintah |
| `src/components/agent/Composer.tsx` | 90 | kotak ketik |

**Dihapus:** `src/components/ChatPanel.tsx`.

### Model transcript (`src/lib/agentEvents.ts`)

```ts
export type ToolState = "running" | "ok" | "error" | "denied";

export type Entry =
  | { kind: "user";      id: string; text: string }
  | { kind: "assistant"; id: string; text: string; streaming: boolean }
  | { kind: "tool";      id: string; name: string; input: unknown;
                         result?: unknown; state: ToolState;
                         startedAt: number; endedAt?: number }
  | { kind: "approval";  id: string; elicitId: string; command: string;
                         cwd?: string; decided: boolean; approved?: boolean }
  | { kind: "turn_end";  id: string; toolCount: number; ms: number }
  | { kind: "error";     id: string; message: string; retryable: boolean };
```

### `src/lib/useAgentRun.ts`

Mengangkat `ChatPanel.tsx:44-174` keluar dari komponen, supaya transcript **selamat saat
pane ditutup**.

```ts
export function useAgentRun(opts: {
  sessionId: string;
  workspaceRoot: string;
  onToolApplied: () => void;
}): {
  entries: Entry[];
  busy: boolean;
  error: string | null;
  send: (text: string) => Promise<void>;
  retry: () => Promise<void>;
  decideApproval: (elicitId: string, ok: boolean) => Promise<void>;
  stop: () => void;                  // AbortController, baru
}
```

**Parsing SSE dipindah tanpa diubah.** Buffering `split("\n\n")` + menahan ekornya di
`ChatPanel.tsx:112-126` sudah benar; salin apa adanya beserta komentarnya. `EventSource`
tidak bisa dipakai karena tidak bisa POST — itu alasan kode ini hand-rolled.

Penanganan event:

| Event | Sekarang | Jadi |
|---|---|---|
| `text` | menempel ke entri assistant terakhir | sama, plus `streaming: true` |
| `tool_start` | `{role:"tool", tool, running:true}` — **`input` dibuang** | push `Entry` lengkap dengan `input`, kunci `event.id` |
| `tool_done` | `lastIndexOf(running)` — **`result` dibuang** | cocokkan dengan `id`; **fallback ke heuristik lama bila `id` tidak ada**, supaya tidak pecah kalau fase 3 belum lengkap |
| `approval_request` | ada | + `cwd` |
| `approval_resolved` | ditutup server, bukan klik | **tidak berubah, disengaja** — komentar di `ChatPanel.tsx:62-64` benar: timeout 300 detik di server juga menutupnya, dan menutup lebih dulu di klien akan berbohong |
| `error` | ada | + `retryable` |
| `turn` | — | abaikan atau tampilkan sebagai indikator giliran |
| `done` | **tidak ada cabangnya** | push `turn_end`; tandai assistant terakhir `streaming: false` |

`onToolApplied` tetap dipanggil sekali di akhir stream bila ada `tool_done` non-error.
Ini memang berlebihan (tool baca-saja pun memicunya) tapi benar; **jangan dioptimalkan**
di fase ini.

### Renderer tool (`toolRenderers.tsx`)

Registry `name → renderer` dengan fallback generik — nama tool MCP tidak diketahui saat
build, jadi pencocokan eksak saja tidak cukup.

```ts
interface ToolRenderer {
  icon: LucideIcon;
  title: (input: any) => string;                  // label baris terlipat
  body?: (input: any, result: any) => React.ReactNode;
}
export const rendererFor = (name: string) => RENDERERS[name] ?? GENERIC;
```

| Tool | Judul | Isi |
|---|---|---|
| `read_file` | `Read src/App.tsx` | 30 baris pertama, `+N baris lagi` |
| `read_files` | `Read 4 berkas` | daftar nama + ukuran |
| `list_files` | `List src/components` | grid dua kolom nama/tipe, dari bentuk `{dir, entries:[{name,type}]}` |
| `glob` | `Glob **/*.ts (11)` | daftar path |
| `grep` | `Grep "useState" (23)` | `file:line` + baris, dipotong |
| `edit_file` | `Edit src/App.tsx` | **DiffView** dari `result.patch` + chip `+12 −3` |
| `write_file` | `Write src/App.tsx` | `Menulis N byte` (tanpa diff — memang penulisan penuh) |
| `run_command` | `$ npm test` | **TerminalView** + chip exit code |
| `get_project` / `get_plan` / `get_prd` / `get_tasks` | `Baca proyek` / `Baca plan` / … | ringkasan satu-dua baris, **bukan dump** |
| `update_features` | `Ubah 6 fitur` | daftar nama sebelum/sesudah + tautan **`Buka Plan →`** |
| `set_task_status` | `TASK-04 → done` | + tautan **`Buka Board →`** |
| `generate_prd` | `Buat PRD` | ringkasan 7 poin + **`Buka PRD →`** |
| `mcp__<srv>__<tool>` | nama tool + badge `<srv>` | JsonView |
| selainnya | nama mentah | JsonView |

Tautan `Buka … →` memanggil prop yang mengganti tab pipeline pane — itulah yang membuat
"agent mengubah, pengguna langsung menonton hasilnya" terasa nyambung.

**`DiffView` adalah pewarna unified-diff, bukan algoritma diff.** Split `\n`, klasifikasi
dari karakter pertama (`+` / `-` / `@@` / spasi), render baris dengan `bg-ok-soft` /
`bg-danger-soft` / `bg-subtle`, `font-mono text-xs`. Runtun konteks lebih dari 6 baris
dilipat di balik `… N baris tidak berubah`. **Tanpa package `diff`, tanpa LCS.**
Fallback bila hasilnya hanya `{path, content}` tanpa `patch`: tampilkan
`Menulis N baris ke src/App.tsx` — jangan sampai crash.

**`TerminalView`**: `bg-code text-code-ink` (token ini sudah ada di `src/index.css`),
baris `$ cmd`, lalu stdout, lalu stderr dengan `text-danger-ink`, chip exit code. Cap 400
baris dengan tombol `tampilkan semua`.

Kebijakan lipat kartu, satu baris logika: **terbuka otomatis selama `running`, tertutup
otomatis saat `ok`, tetap terbuka saat `error`.**

### `ApprovalCard.tsx`

Kartu yang ada (`ChatPanel.tsx:236-272`) plus: folder kerjanya ditampilkan, pintasan
`y`/`n` saat kartu ter-fokus, dan hitung mundur terhadap timeout 300 detik di server
supaya kartu basi tidak terlihat masih hidup.

### Markdown jawaban assistant

Pakai `Markdown` dari `src/components/lazy.tsx` yang sudah ada sejak fase 0 — fallback-nya
`<pre className="whitespace-pre-wrap">`, yang persis rendering chat hari ini. Jadi teks
yang sedang streaming tampil polos dulu lalu naik kelas saat chunk-nya tiba, dan react-markdown
tetap di luar bundel awal. Panel chat hari ini sama sekali tidak merender markdown; ini
penambahan, bukan penggantian.

### Chip folder kerja

Sekarang input folder dan checkbox shell memakan ~100px header permanen
(`ChatPanel.tsx:196-226`). Padatkan jadi satu chip di atas composer:
`📁 ~/code/app` dengan titik penanda shell aktif. Diklik membuka popover kecil berisi
input yang sama dan checkbox yang sama (tetap `disabled` selama folder belum diisi).
**Tetap selalu terlihat** — komentar di `ChatPanel.tsx:194-195` benar soal itu, hanya
bentuknya yang berubah.

### Error tingkat stream

Banner selebar penuh + tombol **Coba lagi**, yang mengirim ulang pesan pengguna terakhir.

## Yang TIDAK boleh disentuh

- Kontrak SSE dan approval ke server — fase ini hanya mengubah sisi klien.
- Perilaku `approval_resolved` (ditutup server, bukan klik).
- `onToolApplied` yang me-refetch seluruh sesi.
- Ketiga komponen step, `Step2PRD` khususnya.
- Apa pun di `server/`.

## i18n

Sekitar 18 string baru. Nama tool (`write_file`, `run_command`) dirender sebagai `<code>`
dan **tidak pernah lewat `t()`** — itu identifier protokol, bukan teks antarmuka. Pelajaran
yang sama dengan label `[Functional]`/`Table:` di `Step2PRD`.

## Selesai kalau

1. `npm run lint` dan `npm run build` bersih.
2. `src/components/ChatPanel.tsx` sudah tidak ada dan tidak ada yang mengimpornya.
3. Satu giliran yang memanggil **dua tool sekaligus**: hasil masing-masing mendarat di
   kartu yang benar. Ini pengujian bug pemasangan tadi.
4. Tutup lalu buka pane: **transcript masih utuh**.
5. `run_command` menampilkan stdout, stderr, dan exit code; perintah yang gagal
   menampilkan kartunya tetap terbuka.
6. `edit_file` menampilkan diff berwarna dengan hitungan `+/−`.
7. Kartu approval: `y`/`n` bekerja, dan kartu yang dibiarkan sampai timeout server
   berubah jadi "ditolak" sendiri.
8. `git diff --stat` tidak menyentuh `server/`.

## Berhenti dan lapor kalau

- Event dari server ternyata tidak membawa `id` di `tool_start`/`tool_done` — berarti
  fase 3 belum lengkap; lapor, jangan menambal dengan heuristik lalu diam.
