# Tugas: Fase 9 — progres generate yang jujur, modal dihapus

> Konteks besarnya ada di [`PLAN.md`](PLAN.md); aturan yang berlaku untuk semua fase
> ada di [`README.md`](README.md). Baca keduanya sebelum mulai.

**Prasyarat:** Fase 1 (provider layer punya `streamLlm`) dan fase 5 (shell) sudah mendarat.

Fase kecil. Bisa dikerjakan kapan saja setelah fase 5.

## Masalah yang diselesaikan

Dua hal, dan keduanya terlihat setiap kali pengguna menekan tombol generate.

**Pertama, angkanya dikarang.** `src/components/GenerationProgress.tsx:41`:

```ts
const percent = Math.min(95, Math.round((1 - Math.exp(-elapsed / (expectedMs / 2.5))) * 100));
```

Itu kurva eksponensial atas waktu berjalan, dipatok di 95%. Tidak ada satu pun byte dari
server yang memengaruhinya. Bar yang bergerak mulus sampai 95% lalu diam di sana selama
dua menit adalah kebohongan yang mahal: pengguna menunggu sesuatu yang diyakininya hampir
selesai.

**Kedua, modalnya mengunci layar.** `GenerationDialog` memakai `fixed inset-0`, jadi
selama PRD digenerate — kadang dua menit — agent pane tidak bisa dipakai. Persis saat
pengguna mungkin ingin menanyakan sesuatu.

## Yang dibangun

### Server: route generate ikut streaming

Keempat route generate (`/api/followup-questions`, `/api/generate-plan`,
`/api/generate-prd`, `/api/generate-tasks`) mendapat mode streaming opsional. Aktif hanya
bila klien mengirim `Accept: text/event-stream`; tanpa itu, perilaku JSON sekarang
dipertahankan **persis** — itu yang menjaga jalur tool pipeline (fase 4) dan klien lama
tetap jalan.

Dalam mode streaming, pakai `streamLlm` alih-alih `callLlm` dan kirim:

| Event | Isi |
|---|---|
| `progress` | `{ chars }` — jumlah karakter yang sudah diterima, dikirim maksimal 4× per detik |
| `result` | payload JSON yang sama persis dengan mode non-streaming, **setelah** `parseJsonFromLlm` dan seluruh post-processing |
| `error` | `{ message }` dengan teks yang sama dengan mode non-streaming |

`parseJsonFromLlm` tetap jalan atas teks lengkapnya di akhir, bukan atas potongan.
Menguraikan JSON separuh jadi tidak masuk akal dan `looksTruncated` mengandalkan teks utuh.

Abort klien (`req.on("close")`) membatalkan fetch ke provider, sama seperti fase 3.

### Klien: strip inline menggantikan modal

- `src/components/GenerationDialog.tsx` (51 baris) **dihapus**.
- `src/components/GenerationProgress.tsx` menyusut jadi strip ~35 baris: nama tahap,
  jumlah karakter yang sudah masuk, waktu berjalan, tombol Batal.
- Strip dirender **di dalam pipeline pane**, di atas konten tab yang bersangkutan. Agent
  pane tetap hidup dan bisa dipakai.

**Tanpa persentase.** Tidak ada yang tahu panjang akhirnya; menebak adalah persis yang
dilakukan versi lama. `1.240 karakter · 0:38` itu informasi; `72%` itu bukan.

Tombol Batal tetap memakai `AbortController` yang sudah ada, dan `isAbort()` di
`src/lib/generate.ts` tetap membedakan pembatalan dari kegagalan sungguhan supaya
pembatalan tidak memunculkan banner error.

`src/lib/generate.ts` mendapat varian streaming dengan callback progres; tanda tangan
non-streaming yang ada **tetap dipertahankan** untuk pemanggil yang tidak butuh progres.

## Konsekuensi menyenangkan

Masalah `container-type` pada `GenerationDialog` yang dicatat di fase 5 hilang dengan
sendirinya — tidak ada lagi `fixed inset-0` di sana.

## Yang TIDAK boleh disentuh

- Prompt Bahasa Indonesia — nol karakter.
- `parseJsonFromLlm`, `looksTruncated`, dan seluruh post-processing tiap route.
- Bentuk respons JSON mode non-streaming.
- Modal detail task di `Step3AgentTasks` — itu fase 10.

## Selesai kalau

1. `npm run lint` dan `npm run build` bersih.
2. Keempat route masih membalas JSON identik ketika dipanggil **tanpa**
   `Accept: text/event-stream`. Bandingkan keluaran untuk input yang sama, sebelum dan
   sesudah.
3. Tool pipeline dari fase 4 masih bekerja (mereka memakai jalur non-streaming).
4. Menekan "Generate PRD" lalu **mengetik di agent pane sementara generate berjalan** —
   berhasil, tidak terblokir.
5. Angka karakter naik sungguhan selama generate, dan berhenti kalau endpoint-nya
   menggantung. Tidak ada lagi bar yang bergerak sendiri.
6. Tombol Batal benar-benar membatalkan: periksa di log server bahwa fetch ke provider
   ikut dibatalkan, bukan hanya UI-nya yang berhenti menunggu.
7. `grep -rn "GenerationDialog" src/` kosong.

## Berhenti dan lapor kalau

- Menambahkan mode streaming ternyata mengubah keluaran mode non-streaming dengan cara
  apa pun.
