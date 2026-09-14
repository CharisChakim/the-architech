# Tugas: Fase 4 — pipeline PRD jadi tool + tool coding

> Konteks besarnya ada di [`PLAN.md`](PLAN.md); aturan yang berlaku untuk semua fase
> ada di [`README.md`](README.md). Baca keduanya sebelum mulai.

**Prasyarat:** Fase 3 sudah mendarat — `server/agent/registry.ts` dengan `ToolSpec` sudah ada.

Fase ini murni aditif: tidak ada tool lama yang berubah perilakunya.

**Butuh konfirmasi pemilik repo:** fase ini menaikkan daya edit agent secara signifikan
sementara `edit_file`/`write_file` tetap tidak lewat kanal approval. Kalau pemilik ingin
penulisan berkas juga minta persetujuan seperti `run_command`, tanyakan sebelum mulai.

## Masalah yang diselesaikan

Dua hal sekaligus.

**Pertama**, `get_project` hanya mengembalikan `{title, currentStep, summary, features,
hasPrd, tasks[id,title,status]}`. Agent tidak bisa membaca PRD, arsitektur, roadmap, atau
detail task — padahal seluruh alasan aplikasi ini ada adalah supaya agent **mengacu pada
plan yang sudah dirancang**. Agent juga tidak bisa menjalankan pipeline-nya sendiri.

**Kedua**, `write_file` menimpa seluruh isi berkas. Untuk mengubah satu fungsi di berkas
500 baris, model harus membaca semuanya lalu menulis ulang semuanya — boros token dan
setiap bagian yang lupa disertakan ikut terhapus. Tidak ada pencarian isi sama sekali,
jadi model menebak nama berkas.

## Bagian A — pipeline jadi tool

### Ekstraksi

Empat route generate di `server.ts` sekarang memuat prompt, panggilan `callLlm`,
`parseJsonFromLlm`, dan post-processing dalam satu badan handler. Pisahkan jadi fungsi
murni:

```
server/pipeline/followups.ts    generateFollowups(input, conn, model, lang)
server/pipeline/plan.ts         generatePlan(input, conn, model, lang, lockedFeatures?)
server/pipeline/prd.ts          generatePrd(title, plan, conn, model, lang)
server/pipeline/tasks.ts        generateTasks(title, plan, prd, conn, model, lang)
```

Route jadi pembungkus tipis yang cuma membaca body, memanggil `resolveFor(role, body, lang)`,
memanggil fungsi pipeline, dan mengirim hasilnya.

**Prompt Bahasa Indonesia berpindah utuh — nol karakter berubah.** Termasuk
`DIAGRAM_RULES`, `AI_RULES`, `outputLanguage`, dan prompt resync yang contoh skemanya
sengaja tidak memuat `coreFeatures` (alasannya ada sebagai komentar di `server.ts`: model
kecil mengarang fitur sendiri begitu field itu muncul di contoh — jangan "dirapikan").

Post-processing juga ikut utuh: koersi `subFeatures` jadi array string tak-kosong,
renumber `additionalSections` mulai dari 8, alias legacy PRD (`executiveSummary`,
`functionalRequirements`, `nonFunctionalRequirements`, `dataSchema`), `status ??= "todo"`.

Sekalian **hapus `bundledMarkdown`** di route generate-tasks: ia dibangun tapi tidak
pernah dibaca siapa pun (`src/lib/generate.ts` hanya mengambil `data.tasks`).

### Tool baru (`server/agent/tools/pipeline.ts`)

| Tool | Isi |
|---|---|
| `get_plan` | `summary`, `specs` (fitur + tech stack), `architectureDraft` lengkap dengan `dataFlow` dan `diagramMermaid`, `roadmap`, `estimation`. Balas penanda jelas kalau plan belum ada. |
| `get_prd` | 7 poin + `additionalSections`. Kalau `requirements`/`databaseSchema`/`techStack` berupa objek terstruktur, kirim apa adanya; kalau sudah jadi string hasil suntingan pengguna, kirim stringnya. Balas penanda jelas kalau PRD belum ada. |
| `get_tasks` | papan penuh: `id`, `phase`, `title`, `priority`, `targetFiles`, `dependencies`, `promptInstructions`, `verificationSteps`, `status`. |
| `generate_plan` | jalankan `generatePlan` dari `session.input` + jawaban follow-up, tulis ke sesi, balas ringkasannya |
| `generate_prd` | jalankan `generatePrd` dari plan yang ada, tulis ke sesi |
| `generate_tasks` | jalankan `generateTasks` dari PRD yang ada, tulis ke sesi |
| `ask_followups` | jalankan `generateFollowups`, **tampilkan pertanyaannya lewat `elicit({kind:"questions", ...})`**, tulis jawabannya ke `session.input.answersToFollowUp`, balas ringkasannya |

Tool generate memakai model dari peran masing-masing (`role_bindings.plan` / `.prd` /
`.tasks`), bukan dari koneksi agent — itu gunanya pengikatan per-peran: agent jalan di
model kuat sementara generasi PRD di model murah.

`ask_followups` memakai kanal elicitation yang jalurnya sudah disiapkan di fase 3.
Renderernya baru ada di fase 8; sampai saat itu `elicit` untuk `kind:"questions"` akan
timeout dan mengembalikan penolakan. **Itu perilaku yang benar untuk fase ini** — jangan
memalsukan jawaban.

`ask_followups` harus jadi **tersedia hanya bila `session.input.description` tidak kosong**;
bertanya klarifikasi tentang ide yang belum ada tidak masuk akal.

## Bagian B — tool coding (`server/agent/tools/fs.ts`)

Semua lewat `resolveInsideRoot`, termasuk setiap path yang dikembalikan `glob`. Deskripsi
tool ditulis Bahasa Indonesia, seragam dengan yang sudah ada.

### `glob` — `{ pattern: string, dir?: string, limit?: number }`

`fs.promises.glob(pattern, { cwd, exclude })` dengan `exclude` sebagai **fungsi**:

```ts
(p) => /(^|[\/\\])(node_modules|\.git|dist|build|coverage|\.next|\.venv)([\/\\]|$)/.test(String(p))
```

Fungsi memangkas saat traversal, bukan menyaring setelahnya — sudah diukur di repo ini:
`**/*.ts` mengembalikan 11 berkas dalam 15 ms dengan `node_modules` terpasang. Cap di
`limit ?? 200`, urutkan mtime turun. Brace expansion (`**/*.{ts,tsx}`) bekerja di Node 24.

### `grep` — `{ pattern, path?, glob?, ignoreCase?, maxMatches?, contextLines? }`

Node murni, **jangan shell out ke ripgrep**: syaratnya aplikasi ini jalan tanpa binary
tambahan, dan memanggil `rg` juga melewati sandbox path.

Enumerasi lewat glob yang sama (default `**/*`), lalu per berkas: lewati > 2 MB; lewati
biner (ada byte NUL di 8 KB pertama); baca utf8; `new RegExp(pattern, ignoreCase ? "i" : "")`
**dibangun di dalam try/catch** — pola rusak mengembalikan `{error}`, bukan melempar.

Cap: 200 kecocokan total, 20 per berkas, tiap baris dipotong 300 karakter, budget
wall-clock dicek tiap 500 berkas → `{truncated: true}`. Balas
`{ matches: [{file, line, text}], truncated, filesScanned }`.

**Risiko yang diterima, tulis sebagai komentar:** pola dengan catastrophic backtracking
memblokir event loop, dan budget wall-clock tidak bisa menginterupsi satu panggilan
`.test()`. Di aplikasi localhost satu pengguna ini menggantung satu giliran. Pengerasan
lewat `node:worker_threads` **sengaja tidak dibangun**.

### `edit_file` — `{ file: string, edits: [{ oldText, newText, replaceAll? }] }`

Menggantikan `write_file` sebagai jalur yang diiklankan.

1. Baca berkas **penuh**. Kalau terpotong, itu error keras — jangan lanjut.
2. Untuk tiap edit **berurutan**, terhadap buffer yang terus diperbarui:
   - `oldText === ""` → tolak (sisip di posisi 0 itu ambigu).
   - 0 kemunculan → tolak: `{ error: "Teks yang dicari tidak ditemukan di <file>.", hint: "Salin ulang persis dari read_file, termasuk spasi dan indentasi." }`
   - > 1 kemunculan tanpa `replaceAll` → tolak: `{ error: "Teks itu muncul N kali di <file>.", occurrences: N, atLines: [...] }`
   - selain itu, splice.
3. **Penolakan apa pun membatalkan seluruh panggilan dan berkas TIDAK ditulis.** Tidak
   boleh ada multi-edit yang setengah jadi.
4. Balas `{ ok, file, editsApplied, bytes, patch }` — `patch` adalah teks unified-diff
   yang dibangun dari offset splice yang sudah diketahui, konteks ±3 baris. **Tanpa
   package `diff`**, dan UI fase 6 membacanya.

Tidak ada fallback fuzzy atau normalisasi whitespace. Model baru saja membaca berkas itu,
jadi gagal exact-match berarti ia menebak — dan jumlah kemunculan adalah umpan balik yang
memperbaikinya. Fuzzy matching adalah tempat tool semacam ini membusuk.

`write_file` **tetap ada** (membuat berkas baru itu sah) tapi deskripsinya ditulis ulang:
"untuk berkas baru atau penulisan ulang yang memang disengaja; pakai `edit_file` untuk
mengubah berkas yang sudah ada". Ini sekaligus membuat flag `truncated: true` milik
`read_file` jadi berguna — sebelumnya ia hanya informatif sambil membiarkan model menimpa
berkas dari bacaan yang terpotong.

### `read_files` — `{ files: string[], maxChars? }`

Maksimal 10 berkas per panggilan; budget per berkas `floor(limits.maxReadChars / jumlah)`;
tiap entri `{ file, content, truncated, error? }` sehingga satu path rusak tidak
menggagalkan seluruh batch.

`read_file` ditambah `startLine`/`endLine` opsional — lebih murah daripada tool terpisah,
dan menghentikan pembacaan ulang berkas besar secara utuh.

`list_files` dibiarkan apa adanya; `glob` yang menangani rekursi.

## Yang TIDAK boleh disentuh

- Prompt Bahasa Indonesia — nol karakter berubah, hanya berpindah berkas.
- `parseJsonFromLlm`, `looksTruncated`, `resolveInsideRoot`.
- Perilaku `run_command`, termasuk tidak adanya denylist (itu keputusan sadar yang
  didokumentasikan) dan approval sebelum eksekusi.
- `src/` — nol perubahan di fase ini.

## Selesai kalau

1. `npm run lint` dan `npm run build` bersih.
2. Empat route generate berperilaku **identik** dengan sebelum ekstraksi. Bandingkan
   keluaran JSON untuk input yang sama sebelum dan sesudah.
3. `edit_file` dengan `oldText` yang muncul dua kali **ditolak dengan jumlah dan nomor
   barisnya**, dan berkasnya **byte-identik** setelah penolakan (`sha256sum` sebelum dan
   sesudah).
4. `edit_file` dengan tiga edit yang edit ketiganya gagal: berkas byte-identik.
5. `grep` dengan pola regex rusak mengembalikan `{error}`, tidak mematikan giliran.
6. `glob "**/*.ts"` di root repo ini tidak mengembalikan apa pun dari `node_modules`.
7. Agent bisa: `get_prd` → membaca isinya → `get_tasks` → menjalankan satu task lewat
   tool berkas → `set_task_status`. Uji sungguhan dengan satu percakapan.
8. `git diff --stat` tidak menyentuh `src/`.

## Berhenti dan lapor kalau

- Ekstraksi pipeline ternyata mengubah keluaran route mana pun.
- Belum ada keputusan soal approval untuk penulisan berkas.
