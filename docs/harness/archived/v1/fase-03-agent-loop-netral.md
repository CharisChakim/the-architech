# Tugas: Fase 3 — agent loop provider-netral

> Konteks besarnya ada di [`PLAN.md`](PLAN.md); aturan yang berlaku untuk semua fase
> ada di [`README.md`](README.md). Baca keduanya sebelum mulai.

**Prasyarat:** Fase 1 dan 2 sudah mendarat.

Ini fase paling berisiko dari seluruh perombakan. Bacalah `agent.ts` utuh sebelum
menyentuh apa pun — tiap komentar di dalamnya menandai satu keputusan yang sudah pernah
salah sekali.

## Masalah yang diselesaikan

`agent.ts` terkunci ke `@anthropic-ai/sdk`: tipe tool memakai `input_schema`, loop keluar
dengan `stop_reason !== "tool_use"`, dan riwayat percakapan berbentuk `MessageParam[]`
Anthropic yang bolak-balik lewat browser. Akibatnya model non-Anthropic tidak bisa
dipakai sama sekali, dan mengganti provider di tengah percakapan mustahil.

Sekalian menutup tiga cacat: tidak ada penanganan client-disconnect sama sekali (tutup
tab saat `run_command` panjang → loop terus jalan dan menulis ke SQLite), `tool_start`/
`tool_done` tidak membawa id sehingga dua tool paralel menaruh hasil di kartu yang salah,
dan `ChatPanel.tsx:99-103` mengirim konfigurasi Gemini ke klien Anthropic.

## File

**Baru:**

```
server/agent/sandbox.ts          pindahan VERBATIM: resolveInsideRoot
server/agent/prompt.ts           pindahan VERBATIM: SYSTEM_PROMPT, systemPromptFor
server/agent/conversations.ts    tabel conversations + messages
server/agent/registry.ts         ToolSpec, toolsFor, dispatch
server/agent/loop.ts             runAgent
server/agent/tools/project.ts    pindahan: get_project, update_features, set_task_status
server/agent/tools/fs.ts         pindahan: list_files, read_file, write_file
server/agent/tools/shell.ts      pindahan: run_command (+ abort)
server/routes/agent.ts           /api/agent/chat, /api/agent/respond
```

**Dihapus di akhir fase:** `agent.ts`. **Dibuang dari `package.json`:** `@anthropic-ai/sdk`.

## Persistensi percakapan

```sql
CREATE TABLE IF NOT EXISTS conversations (
  id         TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  title      TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations (session_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  conv_id    TEXT NOT NULL,
  role       TEXT NOT NULL,               -- 'user' | 'assistant'
  content    TEXT NOT NULL,               -- array ContentBlock, JSON
  meta       TEXT NOT NULL DEFAULT '{}',  -- {model, connectionId, stop}
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages (conv_id, id);
```

Satu baris per `Message` netral, isinya array blok sebagai JSON — blok selalu dibaca
bersama, jadi baris per blok tidak membeli apa pun. Tidak ada kolom `seq`: penulisnya
tunggal, jadi `ORDER BY id` sudah urutan yang benar.

**Tabel `sessions` tidak disentuh. Tanpa migrasi.**

```ts
export function ensureConversation(sessionId: string, conversationId?: string): string;
export function loadMessages(convId: string): Message[];
export function appendMessage(convId: string, m: Message, meta?: object): void;
export function importLegacyHistory(convId: string, anthropicHistory: any[]): void;
export function sanitize(messages: Message[]): Message[];
```

### `sanitize()` — dijalankan sebelum SETIAP request ke provider

Untuk setiap `tool_call` di pesan assistant yang tidak punya `tool_result` pasangannya
di pesan sesudahnya, sisipkan hasil sintetis:

```ts
{ type: "tool_result", toolCallId, content: '{"error":"Giliran terputus."}', isError: true }
```

Kedua API menolak keras tool call yang tak terjawab. Fungsi inilah yang membuat abort
bisa dipulihkan **dan** yang membuat pergantian provider di tengah percakapan aman —
tanpa ini, satu giliran yang terputus mengunci percakapan itu selamanya.

## Loop (`server/agent/loop.ts`)

```ts
export interface AgentLimits {
  maxTurns: number;          // 12
  maxTokens: number;         // 8000
  maxReadChars: number;      // 60_000
  maxOutputChars: number;    // 20_000
  commandTimeoutMs: number;  // 120_000
}

export interface AgentRunOptions {
  sessionId: string;
  conversationId: string;
  userMessage: string;
  conn: Connection;
  model: string;
  limits: AgentLimits;
  onEvent: (e: AgentEvent) => void;
  elicit: Elicit;
  signal: AbortSignal;
}

export async function runAgent(opts: AgentRunOptions): Promise<void>;   // tidak lagi mengembalikan messages
```

Limit dibaca dari `session.agentLimits` (parsial, di-merge di atas `DEFAULT_LIMITS`).
Payload sesi sudah blob JSON, jadi ini nol kerja skema dan duduk bersebelahan dengan
`workspaceRoot`/`allowShell` yang sudah ada.

Per giliran:

1. `if (signal.aborted) break;` lalu emit `{type:"turn", turn, maxTurns}`.
2. `streamLlm(conn, { model, system, messages: sanitize(loadMessages(convId)), tools, maxTokens, signal })`.
3. Teruskan event `text` sebagai `AgentEvent{type:"text"}`; akumulasi blok.
4. **Persist pesan assistant begitu stream berakhir, sebelum tool mana pun jalan.**
   Abort saat `run_command` panjang tidak boleh menghilangkan giliran assistant-nya.
5. `stop !== "tool_calls"` → emit `{type:"done"}`, `return`.
6. Untuk tiap tool call, berurutan: cek abort → `tool_start` → `dispatch()` → `tool_done`.
   Call yang membawa `parseError` **tidak dieksekusi** — langsung jadi hasil error.
7. Persist **satu** pesan user berisi **semua** blok `tool_result` giliran itu. Dipecah
   jadi beberapa pesan, model belajar berhenti memanggil tool secara paralel. (Alasan ini
   ada sebagai komentar di `agent.ts:434-437`; bawa komentarnya.)
8. Habis giliran → `{type:"error", message:"Batas N putaran tool tercapai tanpa jawaban akhir."}`.

`tool_start` dan `tool_done` **wajib membawa `id`** dari tool call. Tanpa itu klien
memasangkan hasil dengan "entri terakhir yang masih running", dan dengan dua tool
paralel hasilnya mendarat di kartu yang salah.

## Registry (`server/agent/registry.ts`)

```ts
export interface ToolContext {
  sessionId: string;
  session: any;                 // dibaca ULANG saat dispatch, bukan dibawa dari awal giliran
  root?: string;                // hasil realpath workspaceRoot
  limits: AgentLimits;
  elicit: Elicit;
  signal: AbortSignal;
}

export interface ToolSpec {
  def: ToolDef;                       // JSON Schema polos, bukan bentuk Anthropic
  available(session: any): boolean;
  run(input: any, ctx: ToolContext): Promise<unknown>;
}

export function toolsFor(session: any, extra?: ToolSpec[]): ToolSpec[];
export async function dispatch(name: string, input: unknown, ctx: ToolContext, specs: ToolSpec[]): Promise<unknown>;
```

Empat sifat keamanan dari `agent.ts` harus bertahan, sekarang secara generik alih-alih
sebagai rantai `if` atas nama tool:

- **Gating ketersediaan** — `toolsFor` menyaring dengan `available(session)`. Tool yang
  tidak diizinkan **tidak pernah ditawarkan**, jadi model tidak menyusun rencana di
  sekitar kemampuan yang tidak ada.
- **Cek ulang saat dispatch** — `dispatch` membaca ulang sesi dan menjalankan
  `available()` lagi sebelum `run()`, karena daftar dibangun sekali di awal giliran
  sedangkan izinnya bisa dicabut di tengah jalan.
- **`resolveInsideRoot`** — pindah **verbatim** ke `server/agent/sandbox.ts`. Semua tool
  berkas lewat sini. Jangan "sederhanakan" logikanya: pemeriksaan realpath untuk berkas
  yang sudah ada dan pemeriksaan folder induk saat `ENOENT` keduanya menahan serangan
  symlink yang berbeda.
- **Error jadi hasil, bukan throw** — `dispatch` membungkus `run()` dengan try/catch
  menjadi `{error: message}`.

Ketersediaan tool (sama seperti sekarang): tool proyek selalu ada; tool berkas hanya bila
`session.workspaceRoot?.trim()`; `run_command` hanya bila itu **dan** `session.allowShell`.

## Kanal elicitation

`askApproval` sekarang sudah melakukan persis yang dibutuhkan untuk bertanya apa pun ke
pengguna di tengah tool. Naikkan satu tingkat:

```ts
export type Elicit = (req:
  | { kind: "approval"; command: string; cwd?: string }
  | { kind: "questions"; questions: FollowUpQuestion[]; round: number }
) => Promise<unknown>;
```

Fase ini hanya memakai `kind:"approval"` — perilakunya harus **identik** dengan sekarang,
termasuk timeout 300 detik yang menghasilkan penolakan. `kind:"questions"` baru dipakai
fase 8; sediakan jalurnya sekarang supaya tidak perlu dibongkar lagi.

Peta pending jadi `Map<string, { convId: string; settle: (v: unknown) => void }>`.
`POST /api/agent/respond` menerima `{ elicitId, conversationId, response }` dan memeriksa
`convId`. **Nyatakan jujur di komentar bahwa ini bukan batas keamanan** pada aplikasi
single-user localhost — pelindung sesungguhnya adalah nonce yang tidak bisa ditebak —
tapi ia mencegah tab basi menjawab prompt milik percakapan lain.

`POST /api/agent/approve` **tetap ada satu rilis** sebagai alias yang menerima
`{approvalId, approved}` tanpa `conversationId`; tanpa itu tombol approve di ChatPanel
lama langsung 404.

## Transport (`server/routes/agent.ts`)

Body: `{ sessionId, conversationId?, message, connectionId?, model?, agentConfig?, history? }`.

**Abort saat klien memutus — ini yang hari ini sama sekali tidak ada:**

```ts
const ac = new AbortController();
req.on("close", () => ac.abort(new Error("client disconnected")));
```

Salurkan ke: fetch provider (`AbortSignal.any([ac.signal, AbortSignal.timeout(LLM_TIMEOUT_MS)])`),
tunggu elicit (abort → settle `false` seketika, bersihkan timer), `execFile` untuk
`run_command` (`{ signal }` membunuh child-nya), awal tiap giliran, dan sebelum tiap
dispatch.

`send()` butuh penjaga: `if (res.writableEnded || ac.signal.aborted) return;` — tanpa itu
`res.write` ke socket yang sudah mati melempar dari dalam loop.

Tambahkan heartbeat `: ping\n\n` tiap 15 detik. Tool yang berjalan lama tanpa keluaran
terlihat mati bagi proxy di tengah jalan.

Encoder SSE yang ada (`res.write(\`data: ${JSON.stringify(event)}\n\n\`)`) **sudah benar**
— `JSON.stringify` tidak bisa menghasilkan `\n` telanjang. Jangan diganti.

### Resolusi konfigurasi agent

```
1. body.connectionId + body.model
2. role_bindings["agent"]
3. body.agentConfig -> dianggap koneksi legacy berformat anthropic
```

Urutan 2 sebelum 3 penting: begitu pengguna menyimpan satu koneksi, **ChatPanel lama yang
belum disentuh langsung me-routing dengan benar**, tanpa menunggu pekerjaan UI. Di sinilah
bug `provider` yang dibuang itu mati.

### Kompatibilitas klien lama

- `conversationId` tidak ada → pakai `conv_<sessionId>_default`.
- Kalau percakapan itu kosong dan `history.length > 0`, jalankan `importLegacyHistory`
  sekali. Setelah itu DB yang berwenang.
- **Berhenti mengirim event `{type:"history"}`.** Panel lama akan menyimpan `[]` dan
  mengirim `[]` kembali; server mengabaikannya. Efek sampingnya menyenangkan: chat di UI
  lama jadi selamat dari reload.
- Union `AgentEvent` bertambah (`conversation`, `turn`, `done.stop`). Rantai if/else di
  `ChatPanel.tsx:125-165` mengabaikan tipe yang tidak dikenal — sudah diperiksa, aman.

## Yang TIDAK boleh disentuh

- Semua prompt Bahasa Indonesia di `server.ts`, `parseJsonFromLlm`, `looksTruncated`.
- `SYSTEM_PROMPT` dan `systemPromptFor` — pindah **verbatim**, termasuk kalimat soal
  `update_features` mengganti SELURUH daftar.
- Perilaku dan pesan error tiap tool yang ada — teks Indonesianya dipakai model sebagai
  umpan balik, jangan diparafrase.
- `src/` — nol perubahan di fase ini. ChatPanel lama harus tetap hidup apa adanya.
- Tabel `sessions`.

## Selesai kalau

1. `npm run lint` dan `npm run build` bersih.
2. `grep -rn "@anthropic-ai/sdk" .` (di luar `node_modules`) kosong, dan `agent.ts` hilang.
3. Chat bekerja terhadap **router berformat Anthropic** dan terhadap **endpoint berformat
   OpenAI** — keduanya diuji sungguhan, bukan diasumsikan.
4. **Ganti koneksi di tengah percakapan**, lalu kirim pesan berikutnya: giliran itu
   berhasil. Ini yang membuktikan model pesan netral dan `sanitize()` bekerja.
5. Tutup tab browser saat `run_command` sedang berjalan lama (`sleep 60`): proses anaknya
   mati, tidak jadi yatim. Periksa dengan `ps`.
6. Dua tool dipanggil paralel dalam satu giliran: hasil masing-masing mendarat di event
   `tool_done` dengan `id` yang cocok.
7. `git diff --stat` tidak menyentuh `src/`.

## Berhenti dan lapor kalau

- `sanitize()` ternyata perlu menyentuh bentuk pesan yang sudah tersimpan dari fase
  sebelumnya dengan cara yang tidak reversibel.
- Ada perilaku di `agent.ts` yang tidak punya padanan di lapis netral — laporkan, jangan
  diam-diam dijatuhkan.
