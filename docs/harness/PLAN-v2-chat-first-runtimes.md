# Plan v2 — Chat, PRD Builder, Kanban, dan runtime agent

Status: **MVP V2-0–V2-6 terimplementasi; V2-7 sedang berjalan**. Chat mandiri,
discovery/picker runtime, run lifecycle, approval, versi PRD, sinkronisasi task,
handoff, dan review evidence sudah terhubung. Hardening V2-7 sebagian besar
selesai dengan fixture test; smoke test provider live, tes end-to-end, dan
beberapa kriteria penerimaan belum dikerjakan. Daftar sisa pekerjaan ada di
[§10](#10-progres-v2-7). Tanggal: 23 September 2026.

## 1. Hasil yang dituju

The Architech menjadi tempat berdiskusi, menyusun PRD, dan menjalankan pekerjaan menggunakan **Claude Code, Codex, atau Antigravity**. User bisa langsung mengerjakan task dari Kanban, mengikuti proses agent, menangani izin, lalu memeriksa hasilnya.

- **Chat langsung bisa dipakai.** Proyek dan PRD opsional untuk percakapan atau pekerjaan coding sederhana.
- **PRD Builder + Kanban eksekusi tetap pusat nilai produk.** Percakapan bisa menjadi proyek tanpa kehilangan konteks.
- **Koneksi mudah:** deteksi runtime → hubungkan melalui metode resmi → muat model → gunakan default koneksi.
- **Model dan effort mengikuti kemampuan koneksi.** User bisa override per percakapan atau run.
- **Dua jalur pekerjaan:** eksekusi di Architech dan paket konteks untuk dilanjutkan di tool lain.

Asumsi awal: aplikasi lokal, satu user, backend berjalan pada mesin workspace. Deteksi instalasi terjadi di mesin backend; browser tidak bisa mendeteksi CLI di komputer lain. Deployment remote memerlukan koneksi host tersendiri dan berada di luar rilis ini.

Acuan visual: prototipe `architech-chat-first.html` yang disetujui dalam diskusi. Spesifikasi di dokumen ini menjadi acuan implementasi yang tersimpan di repo.

## 2. Struktur UI dan perjalanan user

### Navigasi

| Area | Isi dan tindakan utama |
|---|---|
| Sidebar | Chat baru, riwayat chat, Proyek, Agents, Koneksi |
| Chat | Percakapan, kartu aktivitas agent, pertanyaan, hasil singkat, composer |
| Header/composer | Workspace, runtime, model, effort, status koneksi; rincian lanjutan dapat dibuka |
| Proyek | Tab **Chat / PRD / Kanban**, bebas berpindah; empty state menjelaskan tindakan berikutnya |
| Panel konteks | Dokumen PRD, detail task, approval, perubahan file, hasil verifikasi sesuai aktivitas |
| Agents | Profil sederhana: instruksi, koneksi, pilihan model/effort, dan izin tool |
| Koneksi | Runtime terdeteksi, autentikasi, katalog model, default, refresh, diagnosis |

Desktop memakai panel konteks di kanan. Layar kecil memakai panel penuh yang dapat ditutup dan mengembalikan fokus. Informasi eksekusi harus terlihat tanpa mencari di percakapan panjang: task aktif, tahap, kebutuhan input, dan tombol Stop.

### A. Chat atau task sederhana

1. Buka Chat baru; langsung ketik.
2. Untuk pekerjaan pada file, pilih workspace. Percakapan umum tidak membutuhkan workspace.
3. Gunakan koneksi default; model/effort tetap bisa diubah melalui picker.
4. Agent menampilkan aktivitas dan hasil. Izin muncul saat tindakan membutuhkannya.
5. Percakapan dan draft tersimpan otomatis, termasuk sebelum ada judul.

### B. Ide → PRD → task yang berjalan

1. Diskusikan ide; agent menanyakan informasi yang benar-benar belum cukup.
2. Pilih **Jadikan proyek**; chat yang sama ditautkan ke proyek.
3. PRD Builder membuat draft terstruktur di panel, dengan masalah, target user, scope, alur, kebutuhan, dan kriteria penerimaan.
4. User mengedit bagian tertentu lalu menyetujui versi PRD.
5. **Buat task** menghasilkan kartu Kanban beserta dependensi dan cara verifikasi.
6. Buka kartu → pilih **Jalankan** → cek workspace, runtime, model/effort, dan batas izin.
7. Pantau aktivitas; berikan input jika diperlukan. Hasil masuk **Review** dengan diff dan bukti verifikasi.
8. User menerima hasil → **Done**. Gagal verifikasi → perbaiki melalui run lanjutan.

PRD baru tidak diam-diam mengganti task lama. Tampilkan bagian/task terdampak sebagai **Perlu sinkronisasi**; user memilih perubahan yang diterapkan. Task buatan manual boleh dijalankan tanpa PRD.

### C. Handoff ke tool lain

Kartu task atau proyek → **Siapkan handoff** → preview paket → unduh/salin atau buka integrasi resmi yang tersedia. Paket berisi versi PRD, scope task, dependensi, petunjuk workspace, kriteria penerimaan, dan perintah verifikasi. Rahasia dan file di luar pilihan user tidak disertakan.

Status setelah ekspor: **Diserahkan**, bukan Done. Hasil eksternal masuk Review setelah user melampirkan bukti atau adapter yang terhubung mengirim hasilnya. Tidak mengasumsikan tool eksternal dapat membaca path lokal pada host lain.

### D. Menghubungkan runtime

1. Buka Koneksi → **Deteksi di mesin ini**; deteksi ringan juga berjalan saat halaman pertama kali dibuka.
2. Kartu Claude Code / Codex / Antigravity menampilkan **Siap**, **Perlu login**, **Belum terpasang**, atau **Versi belum didukung**.
3. Klik Hubungkan; gunakan login resmi atau API key sesuai jalur integrasinya.
4. Muat katalog model; tampilkan sumber dan waktu refresh.
5. Default picker: **Model: Ikuti koneksi** dan **Effort: Ikuti koneksi**.
6. **Uji respons** tersedia secara eksplisit; jelaskan bahwa pengujian memakai kuota.

Contoh tampilan, dengan nilai ilustratif:

```text
Runtime   [ Codex                         v ]
Model     [ Ikuti koneksi · model aktif   v ]
Effort    [ Ikuti koneksi · medium        v ]
Sumber: konfigurasi runtime untuk workspace ini

Effort:
  ✓ Ikuti koneksi
    low
    medium
    high
```

Pilihan tambahan hanya muncul jika model dan kebijakan runtime mendukungnya. Jika default tidak dapat dibaca: **Ikuti koneksi · ditentukan runtime**. Jangan menampilkan angka/level tebakan.

## 3. Fondasi repo yang perlu berubah

| Kondisi sekarang | Perubahan yang direncanakan |
|---|---|
| `src/App.tsx` mengandalkan `ProjectSession`; percakapan server membutuhkan `session_id` | Pisahkan identitas percakapan dan proyek; hubungan proyek boleh kosong |
| `src/lib/routing.ts` mengatur akses berdasarkan tahap Plan/PRD | Rute chat/proyek stabil; tab proyek dengan empty state dan tindakan yang sesuai |
| Draft tersebar di komponen form | Simpan draft independen dari mount/unmount dan judul proyek |
| `server/llm/types.ts` hanya format Anthropic/OpenAI dan `models: string[]` | Pertahankan adapter API; tambah koneksi runtime dan katalog kapabilitas terpisah |
| `server/connections/*` sudah memiliki CRUD, test, role binding | Perluas secara kompatibel; jangan mengganti semua koneksi lama |
| `server/agent/loop.ts` memiliki loop/tool execution sendiri | Bungkus sebagai runtime internal; native runtime menjalankan loop miliknya |
| `Workbench.tsx` memulai task melalui prompt agent | Server mengelola run, status task, dependensi, dan bukti hasil secara eksplisit |

Stack tetap React/Vite/Express/SQLite. Dokumen `PLAN.md` dan fase 0–11 adalah riwayat implementasi v1. Rencana ini menjadi acuan pekerjaan v2; tidak mengulang migrasi v1.

## 4. Strategi integrasi resmi

**Pisahkan dua jenis koneksi:**

- **Model API:** Architech memiliki loop dan tool; adapter HTTP yang ada tetap dipakai.
- **Agent runtime:** Claude Code/Codex/Antigravity memiliki loop dan tool; Architech mengirim konteks, mengatur lifecycle, dan menerjemahkan event.

Satu run hanya memiliki satu pemilik eksekusi tool. Ini mencegah perintah/file edit dijalankan dua kali. MCP/tool proyek diberikan hanya melalui mekanisme runtime yang memang didukung.

### Codex

Gunakan **Codex App Server melalui stdio**. `model/list` menyediakan katalog dengan `supportedReasoningEfforts` dan `defaultReasoningEffort`; `config/read` menyediakan konfigurasi efektif. Default katalog perlu dibedakan dari override user. Lifecycle thread/turn dan approval diterjemahkan oleh adapter. Pin versi protokol yang diuji. [Dokumentasi resmi](https://learn.chatgpt.com/docs/app-server).

### Claude Code

Gunakan **Claude Agent SDK TypeScript** untuk jalur terintegrasi. Discovery memanfaatkan `supportedModels()`; bentuk metadata effort harus diperiksa pada versi SDK yang dipin. [Referensi SDK](https://code.claude.com/docs/en/agent-sdk/typescript).

Effort mengikuti resolusi konfigurasi Claude saat tidak di-override; pilihan bergantung model dan batas organisasi. Verifikasi pewarisan konfigurasi user/project secara eksplisit pada SDK, karena menjalankan SDK tidak otomatis berarti semua pengaturan CLI terbaca. [Konfigurasi model](https://code.claude.com/docs/en/model-config), [agent loop dan callback izin](https://code.claude.com/docs/en/agent-sdk/agent-loop).

Untuk aplikasi pihak ketiga, jalur terintegrasi memakai API key atau penyedia cloud yang didukung. Jangan menjanjikan login Claude.ai/langganan Pro–Max sebagai autentikasi produk ini; handoff ke Claude Code milik user tetap menjadi jalur terpisah. Jangan mengambil atau menyalin token sesi Claude.ai. [Ketentuan autentikasi resmi](https://code.claude.com/docs/en/legal-and-compliance).

### Antigravity

Mulai dari **AGY CLI**: `agy models` untuk katalog, mode `stream-json` untuk event, dan `--effort` untuk pengaturan yang didukung. Headless memakai kebijakan izin dan bisa menolak tool sambil tetap keluar dengan kode 0; kanal input tersebut tidak menerima balasan approval interaktif. [Dokumentasi headless](https://www.antigravity.google/docs/cli/headless/).

Keputusan desain: rilis adapter CLI dengan scope eksekusi yang disetujui sebelum run; blokir tindakan di luar scope. Jangan mengaktifkan bypass semua izin. Jika hasil uji membutuhkan approval per tindakan, evaluasi **SDK Python resmi** beserta policy/hooks sebagai bridge khusus. Penambahan Python harus dibuktikan perlu. [SDK](https://www.antigravity.google/docs/sdk/overview).

Login akun CLI dan Gemini API key adalah jalur berbeda; mode key CLI memerlukan konfigurasi provider yang sesuai. Katalog/default harus diambil dari jalur yang benar-benar digunakan. [Instalasi dan autentikasi](https://www.antigravity.google/docs/cli/install/).

## 5. Discovery model dan effort

### Kontrak katalog

Setiap model menyimpan:

| Data | Tujuan |
|---|---|
| `connectionId`, `modelId`, `label` | Identitas per koneksi; nama sama pada runtime berbeda tetap berbeda |
| `source`, `discoveredAt`, `runtimeVersion`, `authScope` | Asal katalog, umur data, versi runtime, identitas akun non-rahasia |
| `availability` | `listed`, `verified`, `unavailable`, atau `unknown`; status manual disimpan sebagai sumber |
| `effortOptions` | Nilai native + label; kosong tidak sama dengan dukungan low/medium/high |
| `defaultModel`, `defaultEffort`, `defaultSource` | Nilai yang diketahui beserta asalnya; boleh unknown |
| `capabilities` | Structured output, tool/approval, resume, interrupt, usage; hanya yang terbukti didukung |

Alur discovery:

1. Temukan binary melalui PATH atau lokasi yang dipilih user. Catat versi dengan timeout.
2. Periksa status autentikasi melalui mekanisme resmi; jangan membaca isi token untuk ditampilkan.
3. Gunakan API/command metadata runtime. Untuk API lama, pertahankan `/models` dan model manual.
4. Normalisasi, deduplikasi per koneksi, cache, dan tampilkan hasil parsial/error per provider.
5. Refresh setelah login, pergantian akun/workspace, versi runtime, atau tombol Refresh. Gunakan TTL awal 15 menit; refresh kedaluwarsa dapat berjalan di latar.
6. Validasi pilihan ketika run dimulai. Kegagalan akses mengubah status katalog, tanpa berpindah model/akun diam-diam.

`listed` berarti dilaporkan katalog, bukan jaminan kuota atau hak akses saat eksekusi. `verified` hanya berarti pernah berhasil pada waktu tercatat. Deteksi otomatis tidak mengirim prompt uji ke seluruh model dan tidak memasang software sendiri.

Untuk katalog tanpa metadata effort: gunakan informasi resmi yang cocok dengan versi/model dan tandai sumbernya. Jika tidak cukup, tampilkan **Ikuti koneksi** saja sampai validasi tersedia. Jangan mengubah suffix model yang tidak dikenal menjadi level tebakan.

### Aturan default dan override

Urutan preferensi Architech: **override run → pilihan percakapan/profil → default koneksi Architech → default runtime untuk workspace tersebut → default model**. Kebijakan organisasi/runtime tetap membatasi semuanya.

- Simpan `inherit` sebagai pilihan asli, terpisah dari nilai efektif. Jangan menyimpan hasil resolusi `medium` sebagai override permanen ketika user memilih Ikuti koneksi.
- Resolve pada awal run/turn; simpan snapshot model, effort, sumber, versi, workspace, dan runtime session ID.
- Adapter boleh menghilangkan parameter agar runtime meresolve default hanya setelah perilaku itu teruji. Jika SDK memberi default sendiri, adapter harus menanganinya secara eksplisit.
- Nilai aktual yang tidak dilaporkan runtime tetap unknown. Simpan requested dan reported secara terpisah.
- Model baru memicu validasi ulang effort. Override yang tidak cocok meminta pilihan baru sebelum run; jangan diam-diam menurunkannya.
- Perubahan picker saat run aktif berlaku pada run/turn berikutnya, dengan label yang jelas.
- Default disimpan di Architech; tidak mengubah konfigurasi global CLI tanpa tindakan khusus user.
- Nama effort tetap native. `high` di dua provider tidak menyiratkan biaya/kekuatan yang sama. Effort, token limit, tampilan reasoning, dan izin eksekusi adalah pengaturan berbeda.

## 6. Data dan lifecycle run

### Entitas minimum

| Entitas | Hubungan/data penting |
|---|---|
| Conversation | ID mandiri, `projectId` opsional, judul, draft, pesan |
| Project | Workspace dan artefak; adaptasi data session lama |
| ArtifactVersion | Plan/PRD versi, isi, persetujuan, hubungan versi sebelumnya |
| Task | Scope, dependensi, acceptance criteria, referensi versi PRD opsional |
| Connection + ModelCatalog | Konfigurasi runtime/API, status auth, preferensi, metadata model |
| AgentProfile | Instruksi dan binding koneksi/model/effort sederhana |
| Run | Conversation/task, status, snapshot konfigurasi, external session ID, hasil |
| RunEvent / Approval / Evidence | Event berurutan, keputusan izin, diff, command + exit code, verifikasi |

Migrasi SQLite bersifat versioned dan transactional, dengan backup sebelum migrasi. Pertahankan ID pesan/session lama dan role binding `agent/plan/prd/tasks`. Chat lama tetap terhubung ke proyek asal; chat baru boleh tanpa proyek. Tidak membuat proyek palsu untuk menyiasati `session_id` wajib.

### State dan kontrol

```text
Task: Backlog → Ready → Running → Review → Done
                         ↓          ↓
                       Blocked    Ready (perbaikan)

Run: queued → running ↔ waiting_for_input / waiting_for_approval
                 └──→ completed / failed / cancelled / interrupted
```

- Completed pada runtime berarti run berakhir; Done pada task memerlukan hasil diterima.
- Backend memvalidasi dependensi dan versi task ketika mulai; double-click Run memakai idempotency key.
- Satu writer per workspace untuk MVP. Pekerjaan berikutnya masuk antrean; tanpa eksekusi paralel yang berisiko menimpa file.
- Event envelope minimum: run ID, nomor urut, waktu, jenis, payload, referensi event provider bila ada.
- Server memiliki proses run; browser hanya subscribe. Refresh/tab tertutup tidak menjalankan ulang task.
- SSE reconnect membaca event setelah cursor terakhir. Simpan hasil sebelum menerbitkan event terminal.
- Setelah server crash, tandai status tidak pasti/interrupted dan rekonsiliasi sesi runtime. Jangan replay operasi tulis otomatis.
- Approval terikat run, tool call, dan input. Tolak approval kedaluwarsa/duplikat; simpan hasil eksekusi terpisah dari keputusan izin.
- Interrupt diteruskan hanya ke proses/sesi yang dimiliki run tersebut.
- Pergantian runtime membuat sesi backend baru dari ringkasan netral dan artefak terpilih. Jangan mengirim ID sesi atau blok protokol privat dari provider lain.
- PRD generation lewat native runtime memakai kapabilitas structured output/read-only yang teruji, lalu validasi schema server. Jika tidak tersedia, arahkan ke koneksi PRD yang kompatibel secara terlihat.

## 7. Tahapan implementasi

Setiap fase selesai dalam kondisi aplikasi bisa dipakai. Nomor v2 terpisah dari fase v1. Rute baru diluncurkan melalui feature flag sampai migrasi dan alur utama lolos.

| Fase | Pekerjaan dan area file | Kriteria selesai |
|---|---|---|
| **V2-0 — Uji kompatibilitas** | Dokumentasikan versi, auth, model discovery, effort, default, resume, dan izin ketiga runtime; fixture metadata/protokol di `server/runtimes/` | Matriks capability berdasarkan hasil uji, daftar gap jelas; pilih batas adapter AGY CLI vs SDK. Probe metadata tidak menulis workspace atau memanggil model |
| **V2-1 — Percakapan dan draft** | `server/agent/conversations.ts`, penyimpanan session, `src/App.tsx`, `src/lib/sessionStore.ts`, routing dan types | Chat tanpa proyek; reload dan ganti tab tidak menghilangkan draft; migrasi mempertahankan pesan/proyek lama; Jadikan proyek tidak menggandakan chat |
| **V2-2 — Shell UI** | Sidebar, Workbench, AgentPane, Composer, panel konteks, koneksi/picker UI berbasis kontrak | Chat/proyek/PRD/Kanban bisa dinavigasi; state loading/error/empty nyata; keyboard, fokus, Escape, dan mobile berfungsi |
| **V2-3 — Runtime core + Codex** | `server/runtimes/` baru; adaptasi loop internal, `server/connections/*`, katalog, run store/routes, `useAgentRun` dan event frontend | Discovery dan pewarisan default Codex bekerja; satu task bisa start, stream, approve/reject, interrupt, dan resume; koneksi API lama tetap jalan |
| **V2-4 — PRD dan Kanban** | `server/pipeline/*`, tool proyek, Step2PRD/Step3AgentTasks atau komponen penggantinya; versioning dan evidence | PRD tersimpan/berversi → task dengan dependensi → run → Review → Done; perubahan PRD ditandai; ekspor handoff bekerja |
| **V2-5 — Claude Code** | Adapter SDK, auth yang didukung, metadata/default resolver, approval callback, structured output | Jalur chat dan task yang sama lolos; model/default/effort sesuai koneksi; izin ditolak tidak menjalankan tool; handoff tersedia untuk pemakaian native terpisah |
| **V2-6 — Antigravity** | Adapter hasil V2-0, model discovery, effort resolver, event/error normalization | Katalog aktual dan opsi effort tampil; chat/task dapat dijalankan dalam scope yang disetujui; tool soft-denied menyebabkan Blocked/hasil belum lengkap, tidak Done |
| **V2-7 — Ketahanan dan rilis** | Recovery, migration fixtures, accessibility, end-to-end, dokumentasi koneksi | Seluruh skenario penerimaan lolos; default tak diketahui jujur; tidak ada run ganda setelah reconnect; rollback terdokumentasi |

Urutan: **V2-0 → V2-1 → V2-2 → V2-3 → V2-4 → V2-5 → V2-6 → V2-7**. V2-0 mendahulukan risiko integrasi agar UI tidak menjanjikan fitur yang tidak tersedia. Durasi baru diestimasi setelah matriks kompatibilitas tersedia.

### Cakupan V2-0 yang langsung dapat dikerjakan

1. Catat versi binary/SDK yang akan didukung dan mekanisme instalasi/auth masing-masing.
2. Ambil contoh respons metadata non-rahasia; pastikan pagination, default, dan error tersedia.
3. Uji konfigurasi kosong, override user, override workspace, batas organisasi, serta model tanpa effort.
4. Uji sesi kecil di workspace fixture untuk start/stop/resume/izin. Prompt berkuota hanya melalui tindakan pengujian yang eksplisit.
5. Hasilkan matriks dan contract fixtures; revisi scope fase adapter berdasarkan hasilnya.

Observasi mesin saat menyusun plan: `codex-cli 0.154.0-alpha.6.2` dan Claude Code `2.1.263` tersedia. Binary `antigravity` ditemukan, tetapi `agy` tidak ditemukan di PATH. Ini bukan bukti login, akses model, atau kompatibilitas AGY; ketiganya belum diuji secara live.

## 8. Verifikasi dan definisi selesai

### Skenario penerimaan wajib

- Instalasi baru: Chat bisa dipakai sesudah koneksi siap, tanpa proyek/PRD.
- Riwayat lama terbuka; draft bertahan setelah reload, pindah tab, dan ganti layout.
- Percakapan berubah menjadi proyek dengan pesan tetap utuh.
- PRD diedit, disetujui, menghasilkan task; PRD berubah lagi dan task terdampak ditandai.
- Task manual tanpa PRD dapat dieksekusi; dependensi yang belum selesai memblokir task terkait.
- Ketiga koneksi dapat dideteksi, atau mendapat status belum terpasang/perlu login dengan tindakan pemulihan.
- Picker memuat model dari koneksi; pergantian akun/workspace menginvalidasi cache terkait.
- Ikuti koneksi mempertahankan default; override effort terkirim benar; opsi tidak didukung tidak dapat dipilih.
- Default/config tidak terbaca tidak memunculkan nilai palsu. Katalog offline menampilkan cache dan umur data.
- Ganti provider di chat mempertahankan konteks netral dan memakai sesi baru yang benar.
- Approve/reject, interrupt, expiry login, kehabisan kuota, error protokol, dan restart server memberi status yang dapat ditindaklanjuti.
- Reconnect dan double-click tidak menggandakan tool execution atau task run.
- Command sukses/gagal, tool ditolak, dan verifikasi belum dijalankan dibedakan. Done tidak bisa diperoleh hanya dari klaim teks agent.
- Handoff menyertakan konteks cukup dan tidak memuat credential; hasil eksternal tetap melalui Review.
- Keyboard penuh, label input, focus return, Escape, dan viewport 320/390/1440 px diperiksa.

### Jenis pengujian

- Contract tests adapter dengan fixture stream termasuk event terpotong, duplikat, malformed, dan unknown.
- Integration tests SQLite untuk migrasi, relasi proyek opsional, versioning, antrean, dan idempotency.
- End-to-end untuk Chat → proyek → PRD → Kanban → review, serta picker/default tiap provider.
- Smoke test live per runtime pada versi yang dipin; jangan mengklaim support hanya dari mock.
- Jalankan `npm run lint` dan `npm run build` pada setiap fase yang mengubah kode. Dokumen rencana saja tidak memerlukan build aplikasi.

### Rollout dan rollback

Backup DB + versi schema sebelum migrasi. Gunakan fitur/rute baru bertahap sambil mempertahankan jalur API lama. Sebelum ada data v2, rollback dapat mematikan flag; sesudah ada data baru, ekspor data tersebut lalu gunakan restore/migrasi balik yang diuji. Mematikan flag saja tidak mengembalikan schema. Jangan hapus histori untuk menyederhanakan rollback.

## 9. Batas rilis ini

Termasuk: UI baru, proyek opsional, PRD versi, Kanban eksekusi, tiga adapter, discovery/default/effort, handoff, review, dan recovery dasar.

Ditunda: marketplace agent, penagihan produk, kolaborasi multiuser, host remote, penjadwalan otonom, serta beberapa agent menulis workspace bersamaan. Fokus pertama adalah satu pekerjaan berjalan dengan konteks, konfigurasi, dan hasil yang dapat dipercaya.

Dokumentasi provider bergerak cepat. Verifikasi ulang referensi dan versi saat memulai setiap fase integrasi; matriks V2-0 menjadi sumber kebenaran implementasi.

## 10. Progres V2-7

Diperbarui 23 September 2026. Bagian ini adalah daftar kerja aktif V2-7: mulai
dari **Sisa pekerjaan** saat melanjutkan. Rincian pemetaan event per runtime dan
checklist smoke test live ada di [`runtime-compatibility.md`](runtime-compatibility.md).

### Kriteria penerimaan (§8)

| Kriteria | Status | Bukti |
|---|---|---|
| Instalasi baru: Chat bisa dipakai tanpa proyek/PRD | Selesai: diuji dengan data kosong terpisah; chat baru mulai di runtime yang siap, dan penolakan menampilkan alasannya | `159ffda` |
| Riwayat lama terbuka; draft bertahan setelah reload/pindah tab/layout | Sebagian: draft pesan pertama kini terhapus setelah terkirim | `f6f82a9`; reload/layout belum diuji ulang |
| Percakapan menjadi proyek dengan pesan utuh | Belum diuji ulang | — |
| PRD diedit → disetujui → task; PRD berubah → task ditandai | Belum diuji ulang | — |
| Task manual tanpa PRD dieksekusi; dependensi memblokir | Selesai: board dengan task di chat tanpa judul kini tersimpan (sebelumnya hilang saat reload); task dengan dependensi yang belum Done ditolak server (409) dan Run-nya nonaktif dengan label "Waiting on …". Task manual tidak punya UI untuk mengatur dependensi | `f31bdb7` |
| Ketiga koneksi terdeteksi atau diberi tindakan pemulihan | Terverifikasi 22 September | `runtime-compatibility.md` |
| Picker memuat model; ganti akun/workspace menginvalidasi cache | Sebagian: Refresh dan simpan path/preferensi di Connections kini sampai ke picker. **Batasan:** runtime tidak melaporkan identitas akun (`connectionId` statis), jadi ganti akun hanya terbaca lewat TTL 15 menit atau Refresh; run tetap memakai discovery baru per request | `503212e` |
| Ikuti default; override effort terkirim; opsi tak didukung tak bisa dipilih | Selesai (fixture): `inherit` tidak dikirim; model/effort pilihan sampai ke Codex, Claude SDK, dan AGY CLI serta tercatat di snapshot run sebagai `user-override`; model di luar katalog ditolak (`MODEL_UNAVAILABLE`) sebelum sampai ke provider; picker hanya menawarkan effort model aktif | `06c2402` |
| Default tak terbaca tidak dipalsukan; katalog offline menampilkan cache dan umurnya | Selesai: default yang tidak dilaporkan tampil "Use runtime default"; refresh yang gagal sementara menampilkan katalog terakhir, ditandai "Cached" beserta tanggalnya | `503212e` |
| Ganti provider di chat: konteks netral, sesi baru | Selesai (fixture): tiap runtime memakai sesinya sendiri; pesan yang belum dilihat sesi itu dikirim sebagai teks (maks. 40 pesan / ±24.000 karakter) dan chat memberi catatan | `fdf68d7`, `7ae98c0` |
| Approve/reject, interrupt, login kedaluwarsa, kuota habis, error protokol, restart → status yang bisa ditindaklanjuti | Sebagian: approval, restart, error protokol, run gagal, dan Stop dari UI teruji; pesan AGY belum menyebut langkah perbaikan | `1d09539`, `a9123bb`, `06d7ae2`, `53d41fc`, `207f656`, tes restart sebelumnya |
| Reconnect dan double-click tidak menggandakan eksekusi | Selesai (fixture) | `1d09539`, `983c0ab` |
| Command sukses/gagal, tool ditolak, verifikasi belum jalan dibedakan; Done tidak dari klaim teks | Selesai untuk pemetaan event dan evidence (fixture) | `1ae00c3`, `91d9e3f`, `94ebaac` |
| Handoff cukup konteks, tanpa credential; hasil eksternal lewat Review | Ada tes redaksi (`src/lib/handoff.test.ts`); tidak diuji ulang | — |
| Keyboard, label, focus return, Escape; viewport 320/390/1440 px | Dicek dan diperbaiki; Enter/Space tidak bisa diuji dengan tool browser yang dipakai | `7ec0fc0`, `3cf73cf` |

### Jenis pengujian (§8)

- Contract tests adapter (event terpotong, duplikat, malformed, unknown): selesai
  untuk ketiga runtime (`a9123bb`). Tes transport Codex lama yang tidak pernah
  jalan kini ikut `npm test`.
- Integration tests SQLite (migrasi, antrean, idempotency): ada; route run kini
  punya tes sendiri (`server/routes/runtime-agent.test.ts`).
- End-to-end: **belum ada**. Repo belum punya framework e2e.
- Smoke test live per runtime: **belum ada**.

### Sisa pekerjaan

1. **Smoke test live** per runtime, mengikuti checklist di
   `runtime-compatibility.md`. Memakai kuota; jalankan dengan pengawasan.
   Banyak perbaikan V2-7 bergantung pada bentuk event yang baru diuji dengan
   fixture.
2. **Tes end-to-end** untuk Chat → proyek → PRD → Kanban → Review dan
   picker/default per provider. Perlu keputusan framework (mis. Playwright)
   karena menambah dependency.
3. **Kriteria yang belum dicek** di tabel atas: percakapan menjadi proyek, dan
   alur PRD (edit → setujui → task, lalu PRD berubah → task ditandai). Membuat
   PRD dan task dari PRD memanggil LLM, jadi sebagian butuh kuota.
4. **Celah kecil yang tercatat:**
   - Chat tanpa workspace menjalankan runtime tanpa `cwd`; dua chat seperti itu
     bisa menulis ke direktori yang sama.
   - `exitCode` Bash dari Claude selalu kosong di evidence.
   - Pesan kegagalan AGY belum menyebut langkah perbaikan.
   - Pesan error server hanya berbahasa Inggris.
   - `tool_progress` Claude tidak ditampilkan, termasuk durasi tool yang
     berjalan lama.
   - Catatan "konteks dibawa" tidak disimpan di riwayat, jadi hilang setelah
     reload.
6. **Indikator context window** per sesi. Butuh data pemakaian token dari tiap
   runtime (`usage`/`modelUsage` Claude, `thread/tokenUsage/updated` Codex,
   `usage` AGY) yang belum dibaca dan belum diverifikasi live; kerjakan setelah
   smoke test. Ganti model di runtime yang sama tidak memindahkan sesi, tapi
   bisa melewati prompt cache atau melebihi context window model baru.
5. Setelah butir 1–3 lolos: perbarui status di awal dokumen ini menjadi V2-7
   selesai.
