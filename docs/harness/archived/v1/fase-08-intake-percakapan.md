# Tugas: Fase 8 — intake jadi percakapan, `Step1Plan` dipecah

> Konteks besarnya ada di [`PLAN.md`](PLAN.md); aturan yang berlaku untuk semua fase
> ada di [`README.md`](README.md). Baca keduanya sebelum mulai.

**Prasyarat:** Fase 4 (tool `ask_followups` + `generate_plan`) dan fase 6 (transcript +
kartu elicitation) sudah mendarat.

## Masalah yang diselesaikan

Memulai proyek hari ini berarti mengisi form, lalu menjawab pertanyaan klarifikasi di
layar kedua, baru plan muncul di layar ketiga. Di harness, bertanya adalah pekerjaan
chat — bukan pekerjaan sebuah form yang mengambil alih layar.

Alur baru:

```
pengguna mengetik idenya di composer
  → agent memanggil ask_followups
  → pertanyaan muncul sebagai KARTU INTERAKTIF di dalam transcript
  → pengguna menjawab di kartu
  → jawaban pulang sebagai tool_result
  → agent memanggil generate_plan
  → pane Plan terisi sementara pengguna menontonnya
```

Mesin klarifikasi bertingkat yang sudah ada dipakai **utuh**; yang berubah hanya tempat
renderingnya. Itulah sebabnya kanal elicitation dibangun di fase 3.

## Pemecahan `Step1Plan.tsx`

Berkas 1070 baris ini memuat tiga layar dalam satu komponen. Batasnya jelas:

| Baris | Isi | Tujuan |
|---|---|---|
| 1–418 | helper, state, handler, tab langkah | dibagi sesuai pemakainya |
| 419–562 | `subView === "form"` | `PlanIntake.tsx` |
| 563–789 | `subView === "clarify"` | `PlanIntake.tsx` |
| 790–1070 | `subView === "plan_review"` | `PlanView.tsx` |

Hasil:

| Berkas | ~LOC | Isi |
|---|---|---|
| `src/components/plan/PlanView.tsx` | 600 | summary, FeatureEditor, tech stack, arsitektur, Mermaid, roadmap, estimasi, PlanCanvas, banner tidak-sinkron + tombol selaraskan ulang |
| `src/components/plan/PlanIntake.tsx` | 380 | form + klarifikasi, **tetap ada**, dicapai lewat tautan "Isi manual" |
| `src/components/plan/followups.ts` | 90 | penggabungan ronde, pra-isi jawaban, state pertanyaan — dipakai `PlanIntake` **dan** kartu transcript |

`src/components/Step1Plan.tsx` jadi pembungkus tipis yang memilih `PlanView` bila
`session.plan` ada, dan `PlanIntake` bila tidak — sehingga `PipelinePane` tidak perlu tahu
apa-apa tentang pemecahan ini. **Prop-nya tidak berubah.**

**Jalur form tidak dibuang.** Sebagian orang memang ingin mengisi kolom, dan membuangnya
berarti menghapus fitur yang tidak diminta hilang.

Nomor baris di atas dari kondisi sebelum fase ini — verifikasi isinya cocok sebelum
memotong, jangan percaya nomornya buta.

## Kartu pertanyaan di transcript

Renderer baru di `src/components/agent/` untuk elicit `kind: "questions"`. Isinya persis
data yang sudah dihasilkan `/api/followup-questions`: `question`, `explanation`,
`options[]`, `suggestedAnswer`, `round`.

Perilaku yang harus sama dengan layar `clarify` sekarang:

- Pilihan dirender sebagai tombol; `suggestedAnswer` jadi satu-satunya pilihan bila
  `options` kosong.
- Ada jalur "jawaban sendiri" per pertanyaan (`customAnswerActive` di kode lama).
- Ada tombol "isi semua dengan saran" (`handleFillAllSuggested`).
- Pra-isi: `options[0] ?? suggestedAnswer`.

Kartu mengirim satu balasan berisi seluruh jawaban sekaligus, lewat
`POST /api/agent/respond`. Selama belum dijawab, kartu tetap terbuka dan giliran agent
menunggu — sama seperti kartu approval.

Logika penggabungan ronde dan pra-isi hidup di `followups.ts` supaya kartu dan
`PlanIntake` memakai satu implementasi, bukan dua yang perlahan menyimpang.

## Perbaikan kunci jawaban — ikut di sini karena ongkosnya jadi nol

Sekarang jawaban di-key dengan **teks pertanyaan**:
`answers[q.question]`, `customAnswerActive[q.question]` (`Step1Plan.tsx:617-618`), dan
`handleSelectOption(questionStr, …)` (`:339`). Pertanyaan yang diubah kata-katanya
membuat jawabannya yatim, padahal `FollowUpQuestion.id` sudah ada di `types.ts:22`.

Karena `followups.ts` memang ditulis ulang, pindahkan kunci internal ke `q.id`.

**Tapi perhatikan batas berikut, ini yang membuat perubahan ini tidak sepele:**

Server menyerialkan jawaban langsung ke dalam prompt dengan kuncinya sebagai teks
pertanyaan:

```ts
// server.ts, /api/followup-questions
Object.entries(previousAnswers).map(([q, a]) => `- ${q}\n  Jawaban: ${a}`)
// server.ts, /api/generate-plan
Object.entries(answers).map(([q, a]) => `- ${q}: ${a}`)
```

Kalau kunci berubah jadi id, prompt akan berbunyi `- fu_3: ...` dan modelnya kehilangan
konteks sepenuhnya. **Prompt tidak boleh diubah** (aturan lintas fase).

Jadi: simpan **internal** ber-key `id`, lalu **konversi ke ber-key teks tepat di batas
pengiriman** ke `/api/followup-questions` dan `/api/generate-plan` — dan juga saat menulis
`session.input.answersToFollowUp`, supaya sesi tersimpan tetap berbentuk seperti dulu.

Pembacaan mundur untuk sesi lama: saat memuat, untuk tiap pertanyaan `q`, ambil
`stored[q.id] ?? stored[q.question]`.

Tulis kedua arah konversi ini sebagai fungsi bernama di `followups.ts` dengan komentar
yang menjelaskan kenapa — ini persis jenis hal yang akan "dirapikan" orang berikutnya
kalau alasannya tidak tertulis.

## Keadaan kosong di AgentPane

Ketika `session.plan` tidak ada dan transcript kosong, agent pane **tidak** menampilkan
kotak chat telanjang. Tampilkan judul, textarea selebar penuh, dan tiga chip:

| Chip | Aksi |
|---|---|
| **Rencanakan dulu** | kirim teksnya ke agent dengan instruksi memanggil `ask_followups` |
| **Langsung ngoding** | kirim teksnya apa adanya ke agent |
| **Buka template** | `onSelectSample` yang sudah ada |

## Yang TIDAK boleh disentuh

- Prompt Bahasa Indonesia di server — nol karakter, termasuk aturan ronde pertama yang
  wajib menanyakan apakah aplikasinya benar-benar butuh LLM.
- Bentuk `session.input.answersToFollowUp` yang tersimpan (tetap ber-key teks).
- `Step2PRD`, `Step3AgentTasks`.
- Logika `planFeaturesEdited` dan tombol selaraskan ulang — ikut pindah ke `PlanView`
  **tanpa perubahan perilaku**, termasuk pemulihan `featuresBackup` saat batal menyunting
  (alasannya ada sebagai komentar di `Step1Plan.tsx:72-76`).

## Selesai kalau

1. `npm run lint` dan `npm run build` bersih.
2. Alur penuh tanpa pernah membuka form: ketik ide di composer → pertanyaan muncul di
   transcript → jawab di kartu → plan terisi di pane Plan.
3. Jalur manual masih utuh: "Isi manual" → form → klarifikasi → plan.
4. Sesi lama yang jawabannya tersimpan ber-key teks **tetap terbaca**; buka satu sesi
   lama dan pastikan jawabannya muncul.
5. Isi prompt yang dikirim ke `/api/generate-plan` tetap ber-key teks pertanyaan —
   verifikasi dengan melihat body request di tab Network, bukan dengan membaca kode.
6. Klarifikasi bertingkat (ronde 2) masih menambah pertanyaan tanpa menghilangkan jawaban
   ronde 1.

## Berhenti dan lapor kalau

- Pemecahan `Step1Plan` ternyata menuntut perubahan prop pada komponen step — itu berarti
  ada kopling yang tidak terbaca dari luar; laporkan sebelum mengubah kontraknya.
