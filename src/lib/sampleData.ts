import { ProjectInput } from "../types";

export interface SampleProject {
  id: string;
  name: string;
  tagline: string;
  badge: string;
  input: ProjectInput;
}

export const SAMPLE_PROJECTS: SampleProject[] = [
  {
    id: "ai-code-reviewer",
    name: "AI Automated Code Reviewer",
    tagline: "Bot GitHub / GitLab untuk analisa PR, deteksi bug, dan rekomendasi refactoring otomatis.",
    badge: "AI Developer Tool",
    input: {
      title: "AI Automated Code Reviewer Bot",
      description: "Aplikasi bot otomatisasi peninjau kode (code review) yang terintegrasi dengan repository Git. Bot akan menganalisis Pull Request (PR) yang baru dibuka, mendeteksi potensi bug, security vulnerability, ketidaksesuaian coding standard, serta memberikan saran perbaikan langsung pada baris kode terkait.",
      targetAudience: "Developer team, Tech Leads, DevOps & QA Engineer",
      techStackPreference: "Node.js, Express, React, GitHub Webhook API, Gemini API",
      answersToFollowUp: {},
    },
  },
  {
    id: "saas-lms-ai",
    name: "SaaS Platform Kursus Online + Tutor AI",
    tagline: "Platform LMS dengan generator kuis otomatis dan AI Tutor personal 24/7.",
    badge: "EdTech SaaS",
    input: {
      title: "Smart LMS dengan AI Tutor Personal",
      description: "Platform kursus online terpadu yang memfasilitasi pengajar untuk mengunggah materi modul dan memungkinkan siswa belajar secara interaktif. Dilengkapi AI Tutor yang bisa menjawab pertanyaan siswa berdasarkan materi modul, membuat rangkuman kuis otomatis, serta melacak progres belajar pengguna.",
      targetAudience: "Siswa, Mahasiswa, Instruktur Kursus, & Lembaga Pelatihan",
      techStackPreference: "React, Tailwind, Express, PostgreSQL, Gemini API",
      answersToFollowUp: {},
    },
  },
  {
    id: "inventory-smart-pos",
    name: "Smart POS & Inventory Forecast",
    tagline: "Kasir digital UMKM dengan prediksi stok otomatis dan laporan keuangan AI.",
    badge: "Fintech & Retail",
    input: {
      title: "Smart POS & Inventory Forecast UMKM",
      description: "Sistem Kasir Point-of-Sale (POS) untuk toko ritel dan UMKM dengan fitur pemindaian barcode, pencatatan transaksi kasir, serta modul analisis AI untuk memprediksi stok barang yang hampir habis dan memberikan rekomendasi promosi berdasarkan tren penjualan mingguan.",
      targetAudience: "Pemilik Toko Ritel, Minimarket, Cafe, dan Staff Kasir UMKM",
      techStackPreference: "React, Express, SQLite/PostgreSQL, Gemini API",
      answersToFollowUp: {},
    },
  },
];
