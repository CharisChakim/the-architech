# Tugas: Fase 10 — papan task yang bisa dikerjakan

> Konteks besarnya ada di [`PLAN.md`](PLAN.md); aturan yang berlaku untuk semua fase
> ada di [`README.md`](README.md). Baca keduanya sebelum mulai.

**Prasyarat:** Fase 5 (shell) dan fase 6 (transcript) sudah mendarat. Fase 4 sangat
disarankan sudah mendarat — tanpa tool coding, tombol Run hanya menghasilkan agent yang
bisa membaca tapi tidak bisa mengerjakan.

## Masalah yang diselesaikan

Papan kanban di `Step3AgentTasks.tsx` dirancang untuk halaman selebar layar. Di pipeline
pane 58%, tiap kolom dapat ~290px sementara kartunya membawa judul, fase, prioritas,
target files, dependencies, dan tombol — terlalu padat.

Lebih penting: papan ini hanya bisa **dilihat**. Task dengan `promptInstructions`,
`targetFiles`, dan `verificationSteps` lengkap hanya bisa disalin manual ke tempat lain.
Padahal agent-nya ada di sebelah, punya tool berkas, dan sudah bisa memanggil
`set_task_status`.

Inilah interaksi yang menjadi alasan seluruh restrukturisasi ini ada.

## Yang dibangun

### Tombol Run per kartu

`Step3AgentTasks` mendapat **satu prop opsional**:

```ts
onRunTask?: (task: AgentTask) => void;
```

Handler-nya di `Workbench`: semai composer dengan `promptInstructions`, `targetFiles`, dan
`id` task, pastikan agent pane terlihat, lalu kirim.

Rantainya kemudian berjalan sendiri: agent mengerjakan → memanggil `set_task_status` →
server menulis SQLite → `onToolApplied` me-refetch sesi → **kartu berpindah kolom di papan
yang sedang dilihat pengguna**. Tidak ada kode sinkronisasi baru yang perlu ditulis;
jalurnya sudah ada sejak fase 3.

Prop ini opsional supaya `Step3AgentTasks` tetap bisa dirender tanpa agent.

### Indikator "sedang dikerjakan"

Kartu yang id-nya muncul di giliran agent yang sedang berjalan mendapat penanda hidup.
Ambil dari transcript: `Workbench` sudah memegang `entries` dari `useAgentRun`, jadi
cukup mencocokkan id task terhadap teks pesan pengguna terakhir atau input
`set_task_status` yang sedang berjalan. Kalau itu terasa rapuh, cukup tandai berdasarkan
task terakhir yang di-Run selama `busy` — sederhana dan tidak berbohong.

### Kartu dipadatkan

Kartu menyisakan: judul, chip fase, chip prioritas, jumlah target file, tombol Run.
`targetFiles`, `dependencies`, `promptInstructions`, dan `verificationSteps` pindah ke
detail.

### Modal detail → panel geser

`Step3AgentTasks.tsx:551` memakai `fixed inset-0` untuk modal detail task. Di dalam
pipeline pane yang ber-`container-type`, modal itu ter-scope ke pane — dan panel geser
memang lebih tepat di sini: pengguna ingin membaca detail task **sambil** melihat papan
dan transcript, bukan menutupi keduanya.

Ganti dengan panel yang meluncur dari kanan pipeline pane, dengan tombol Run yang sama.
`selectedTaskForModal` jadi `selectedTask`; perilaku `handleTaskStatusChange` yang ikut
memperbarui state modal (`Step3AgentTasks.tsx:87`) dipertahankan.

### Yang dipertahankan apa adanya

- **Drag-and-drop HTML5** (`onDragStart`/`onDragOver`/`onDrop`, baris 294-341) beserta
  seluruh tombol fallback untuk sentuh dan keyboard (baris 378-419). Ini aksesibilitas,
  bukan hiasan.
- Mode `list` (`viewMode`), termasuk tab pemilihnya.
- `columns` yang dihitung inline (baris 156) dengan filter `!t.status || t.status === "todo"`
  — tugas tanpa status memang harus jatuh ke kolom To do.
- Confetti saat generate berhasil (sudah jadi dynamic import sejak fase 0).

## Penyatuan generator AGENTS.md — ikut di sini

Ada **tiga** generator AGENTS.md yang berbeda isinya:

| Lokasi | Bahasa | Isi |
|---|---|---|
| `src/components/Step3AgentTasks.tsx:107-131` | Inggris | paling kaya: aturan eksekusi, status, dependencies, fase |
| `src/components/ExportModal.tsx:64-78` | Inggris | lebih ringkas |
| `server.ts` `bundledMarkdown` | Indonesia | **mati** — tidak pernah dibaca klien |

Satukan jadi `src/lib/agentsMd.ts` yang mengekspor `buildAgentsMarkdown(session): string`,
disemai dari versi `Step3AgentTasks` yang paling kaya. Kedua pemakai mengimpornya.
Yang di `server.ts` sudah dihapus di fase 4; kalau ternyata masih ada, hapus sekarang.

Sekalian: `downloadFile` diduplikasi verbatim di `ExportModal.tsx:19-29` dan
`MermaidViewer.tsx:98-109`. Ekstrak ke `src/lib/download.ts` (~12 baris), tiga titik pakai.

## Kebocoran API key di ekspor — ikut di sini

`ExportModal.tsx:80-83` melakukan `JSON.stringify(session)` untuk tombol "Full backup".
Itu menyertakan `session.llmConfig` dengan `apiKey` yang hidup — **bahkan ketika
`saveApiKey` false**, karena key tetap ada di state sesi selama tab terbuka. Berkasnya
lalu masuk folder Downloads, dilampirkan ke issue, ter-commit.

`src/lib/sessionStore.ts:6-9` sudah punya helper yang persis dibutuhkan. Ekspor fungsi itu
dan pakai ulang — satu definisi, bukan dua:

```ts
// sessionStore.ts — tambahkan `export`
export function stripLocalOnlyFields(session: ProjectSession) { … }

// ExportModal.tsx
JSON.stringify(stripLocalOnlyFields(session), null, 2)
```

Tambahkan satu string i18n pada keterangannya: kredensial model tidak ikut diekspor.

Catatan: setelah fase 7, `session.llmConfig` memang tidak diisi lagi — tapi perbaikan ini
tetap dipasang, karena sesi lama bisa memuatnya dan ketergantungan pada "kebetulan
kosong" bukan perbaikan.

## Yang TIDAK boleh disentuh

- `Step2PRD` dan helper koersi formatnya.
- Bentuk `AgentTask` di `types.ts`.
- Ketiga nilai status (`todo`/`in_progress`/`done`) dan penyaringnya — tool
  `set_task_status` di server memvalidasi persis ketiga nilai ini, dan nilai lain membuat
  kartunya **lenyap** dari papan, bukan salah kolom.

## Selesai kalau

1. `npm run lint` dan `npm run build` bersih.
2. Klik **Run** pada satu kartu → agent mengeksekusi → kartu **pindah kolom sendiri**
   tanpa pengguna menyentuh papan. Uji sungguhan, bukan diasumsikan.
3. Drag-and-drop masih bekerja, dan tombol fallback masih memindahkan kartu.
4. Panel detail terbuka bersamaan dengan papan yang masih terlihat.
5. Papan terbaca di pipeline pane selebar 800px.
6. "Full backup" **tidak** memuat API key: unduh satu, lalu `grep -i "apikey\|sk-"` harus
   kosong.
7. `grep -rn "buildBundledMarkdown\|AGENTS_" src/` hanya menunjukkan `src/lib/agentsMd.ts`
   sebagai sumbernya.

## Berhenti dan lapor kalau

- Penyatuan generator AGENTS.md ternyata mengubah isi berkas yang dihasilkan dengan cara
  yang tidak disengaja — bandingkan keluarannya sebelum dan sesudah untuk satu proyek yang
  sama.
