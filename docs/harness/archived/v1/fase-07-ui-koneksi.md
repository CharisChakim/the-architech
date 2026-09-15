# Tugas: Fase 7 — UI koneksi & pemilih model

> Konteks besarnya ada di [`PLAN.md`](PLAN.md); aturan yang berlaku untuk semua fase
> ada di [`README.md`](README.md). Baca keduanya sebelum mulai.

**Prasyarat:** Fase 2 (tabel koneksi + route) dan fase 5 (shell) sudah mendarat.

## Masalah yang diselesaikan

`LLMConfigModal` hanya bisa memegang **satu** konfigurasi, dengan tiga tab provider yang
sudah tidak cocok lagi dengan lapis adapter (`gemini`/`ollama`/`custom` sekarang semuanya
format `openai`). Mengganti model berarti membuka modal dan menyunting satu-satunya
konfigurasi yang ada. Tidak ada cara memasang beberapa endpoint sekaligus, apalagi
memberi peran berbeda ke model berbeda.

Permintaan pemilik repo, apa adanya: *"optional user bisa memilih mana yang perlu di
konekkan. dan saya ingin koneknya mudah."*

## Keputusan arsitektur yang tidak boleh dibalik

**Koneksi hidup di SQLite server, bukan localStorage.** Klien hanya CRUD lewat
`/api/connections`. Alasannya server harus bisa memanggil model tanpa tab browser
terbuka. Konsekuensinya: **API key tidak pernah masuk ke state React dan tidak pernah
dibaca kembali dari server** — `GET /api/connections` hanya mengembalikan `hasKey`.

Ini berbeda dari `LLMConfig` lama yang hidup di localStorage. Jangan membangun jembatan
localStorage "sementara".

## File

**Baru:**

| Berkas | ~LOC |
|---|---|
| `src/lib/connections.tsx` | 130 — provider + fetch ke `/api/connections` |
| `src/components/connections/presets.ts` | 70 |
| `src/components/connections/ConnectionSwitcher.tsx` | 150 |
| `src/components/connections/ConnectionsModal.tsx` | 300 (termasuk tab MCP) |

**Dihapus:** `src/components/LLMConfigModal.tsx`.
**Diubah:** `src/types.ts` (tambahan, bukan penggantian), `src/App.tsx`, `src/components/Topbar.tsx`,
`src/components/Sidebar.tsx`, `src/lib/generate.ts`.

### Tipe — aditif, `LLMConfig` tidak dihapus

Tambahkan ke `src/types.ts`. **`LLMConfig` (baris 1-11) dibiarkan** karena sesi lama
masih bisa memuatnya dan server masih menerimanya.

```ts
export type WireFormat = "anthropic" | "openai";
export type AgentRole = "agent" | "plan" | "prd" | "tasks";

export interface Connection {
  id: string;
  name: string;
  format: WireFormat;
  baseUrl: string;
  hasKey: boolean;              // server tidak pernah mengirim nilainya
  apiKeyEnv?: string;
  headers?: Record<string, string>;
  models: string[];
  jsonMode: boolean;
  enabled: boolean;
  lastCheck?: { ok: boolean; toolsSupported: boolean; at: string; message?: string };
}

export interface RoleBinding { connectionId: string; model: string }

export interface McpServerConfig {
  id: string; name: string; enabled: boolean;
  transport: "stdio" | "http";
  command?: string; args?: string[];
  url?: string; headers?: Record<string, string>;
  status?: { ok: boolean; tools: number; message?: string };
}
```

### Satu context baru

`ConnectionsProvider` di `src/lib/connections.tsx`, mengikuti pola `LanguageProvider`
yang sudah ada di `src/lib/i18n.tsx`.

Alasannya, karena ini satu-satunya state baru yang tidak pakai `useState` di `App`:
pill di topbar, popover switcher, modal, dan pemanggil `/api/agent/chat` semuanya butuh
daftar dan pilihan aktif yang sama. Mengalirkannya sebagai prop berarti lima prop melewati
`App → Workbench → Topbar` dan `App → Workbench → AgentPane`. Context 130 baris lebih
kecil daripada pengalirannya. **Bukan state library.**

### Klien berhenti mengirim `llmConfig`

- `src/lib/generate.ts` berhenti menyertakan `llmConfig` di body; server menyelesaikannya
  lewat `role_bindings` untuk peran `plan`/`prd`/`tasks`.
- Pemanggil `/api/agent/chat` berhenti mengirim `agentConfig`.
- Di server, balik urutan resolusi yang dipasang di fase 2 sehingga **`role_bindings`
  menang atas `llmConfig`**. `llmConfig` tetap diterima sebagai jalur legacy paling
  belakang; jangan dihapus.
- `session.llmConfig` berhenti diisi di `App.tsx`. `handleSaveLLMConfig` dihapus.
  `sessionStore.ts` sudah membuang `llmConfig` sebelum persist, jadi sesi tersimpan tidak
  terpengaruh sama sekali.

### Migrasi sekali jalan

Saat aplikasi pertama kali dibuka setelah fase ini: kalau `GET /api/connections`
mengembalikan daftar kosong **dan** `localStorage["ai_plan_architect_llm_config"]` ada,
kirim satu `POST /api/connections` yang disintesis dari config lama itu, lalu ikat keempat
peran ke sana.

| `provider` lama | jadi |
|---|---|
| `gemini` | `{name:"Gemini", format:"openai", baseUrl:"https://generativelanguage.googleapis.com/v1beta/openai"}` |
| `ollama` | `{name:"Ollama", format:"openai", baseUrl: baseUrl \|\| "http://localhost:11434"}` |
| `custom` | `{name:"Custom", format:"openai", baseUrl}` |

Sertakan `apiKey` kalau ada. **Biarkan key localStorage lama di tempatnya satu rilis** —
kalau migrasi ternyata salah, tidak ada yang hilang. Pengguna lama membuka aplikasi dan
setelannya sudah ada.

## Tiga tingkat UI

**1 — Pill di topbar, selalu terlihat.** `● Claude Combo · claude-combo ▾`. Titiknya
hijau/kuning/merah dari `lastCheck`.

**2 — `ConnectionSwitcher` sebagai popover, bukan modal.** Ini yang menjawab "ganti model
tanpa buka modal":

- Baris atas: empat chip peran `Agent · Plan · PRD · Tasks`. Chip yang terpilih menentukan
  peran mana yang akan diikat oleh klik berikutnya; `Agent` terpilih secara bawaan.
- Badan: koneksi yang `enabled`, masing-masing ter-expand jadi daftar modelnya, dengan
  kotak filter ketik.
- Klik sebuah model → ikat ke peran terpilih (`PUT /api/roles`) → popover tertutup.
- Kaki: `Kelola koneksi…` · `Server MCP (3)`.

**Ganti model = dua klik.**

**3 — `ConnectionsModal`.** Tab `Koneksi | Peran | MCP`. Kiri daftar koneksi + `+ Tambah`.
Kanan editor: nama, radio format, base URL, API key, `apiKeyEnv`, header kustom, daftar
model, toggle `enabled`, tombol Test.

Field API key selalu tampil kosong dengan placeholder `(tersimpan di server)` bila
`hasKey`. Mengosongkan field lalu menyimpan **tidak** menghapus key — harus ada tombol
`Hapus key` terpisah yang mengirim `apiKey: ""`. Ini mencegah kehilangan key hanya karena
mengganti nama koneksi.

Hasil Test ditampilkan sebagai tiga baris probe, bukan satu boolean:
`models ✓ 120ms · chat ✓ 840ms · tools ✗ endpoint menolak tools`. Probe `tools` yang
gagal ditampilkan sebagai peringatan, bukan kegagalan — koneksi itu masih berguna untuk
peran plan/prd/tasks, hanya tidak untuk agent. Kalau pengguna mengikat koneksi tanpa
dukungan tool ke peran `agent`, tampilkan peringatan di situ juga.

## Preset — inti dari "koneknya mudah"

`+ Tambah` menampilkan **preset dulu, form belakangan**.

| Preset | format | baseUrl | key |
|---|---|---|---|
| Router lokal (Anthropic) | `anthropic` | `http://localhost:20128/v1` | opsional |
| Ollama | `openai` | `http://localhost:11434` | tidak perlu |
| LM Studio | `openai` | `http://localhost:1234/v1` | tidak perlu |
| OpenRouter | `openai` | `https://openrouter.ai/api/v1` | wajib |
| Anthropic | `anthropic` | `https://api.anthropic.com` | wajib |
| Gemini (OpenAI-compat) | `openai` | `https://generativelanguage.googleapis.com/v1beta/openai` | wajib |
| Kustom | — | kosong | — |

`http://localhost:20128/v1` dan model `claude-combo` diambil dari bawaan yang sudah ada di
`agent.ts` sebelum fase 3 — router lokal itu memang yang selama ini diasumsikan aplikasi.

Memilih preset **langsung memanggil** `POST /api/connections/test` terhadap draft itu;
hasil `models` mengisi daftar model. Tombol Simpan jadi tombol utama yang ter-fokus.

**Untuk tiga preset lokal, ini benar-benar dua klik: pilih preset → Simpan.**

Probe yang gagal **bukan jalan buntu**: field model berubah jadi teks bebas dengan daftar
chip, error aslinya ditampilkan inline, dan koneksi tetap bisa disimpan. Endpoint tanpa
`/models` itu normal.

**Toggle enable/disable per koneksi.** Koneksi yang dimatikan hilang dari switcher; peran
yang menunjuk ke sana jatuh ke koneksi enabled pertama.

## Tab MCP

Daftar dengan nama, transport, toggle enabled, status (`12 tool` / `gagal: ENOENT`).
Form tambah: nama + (`command` + `args`) atau (`url` + `headers`), tombol Test ke
`/api/mcp/test`.

**Route MCP baru ada di fase 11.** Di fase ini, kalau endpoint-nya belum ada, tab MCP
menampilkan keadaan kosong dengan catatan singkat, bukan error. Bagian klien ini tetap
ditulis sekarang karena transcript fase 6 butuh daftar server untuk memetakan
`mcp__github__create_issue` → badge `github` — helper tiga baris.

## Yang TIDAK boleh disentuh

- `sessionStore.ts` `stripLocalOnlyFields` — sudah benar.
- Ketiga komponen step.
- Bentuk `LLMConfig` di `types.ts` (dibiarkan, bukan dihapus).
- Apa pun di `server/`, kecuali membalik urutan resolusi yang disebut di atas.

## i18n

Sekitar 30 string baru. **Nama produk tidak diterjemahkan** — `Ollama`, `LM Studio`,
`OpenRouter`, `Anthropic`, `Gemini` ditulis apa adanya, alasannya sama dengan nama bahasa
di `Sidebar.tsx`.

## Selesai kalau

1. `npm run lint` dan `npm run build` bersih.
2. `LLMConfigModal.tsx` sudah tidak ada dan tidak ada yang mengimpornya.
3. Preset Ollama: **pilih preset → Simpan**, dan koneksi langsung terpakai. Hitung
   kliknya; kalau lebih dari dua, rancangannya belum selesai.
4. Mengganti model untuk peran `agent` lewat popover: dua klik, tanpa modal.
5. Mengganti nama koneksi lalu menyimpan **tidak** menghapus API key-nya.
6. Tidak ada nilai API key yang pernah muncul di respons jaringan mana pun — periksa di
   tab Network.
7. Pengguna dengan `ai_plan_architect_llm_config` lama membuka aplikasi dan langsung punya
   satu koneksi terikat ke empat peran, tanpa mengisi apa pun.
8. Keempat route generate dan chat masih bekerja tanpa klien mengirim `llmConfig`.

## Berhenti dan lapor kalau

- Endpoint `/api/connections` ternyata berbeda bentuknya dari yang diasumsikan brief ini.
