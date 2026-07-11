# Annida2Finance

> 🚀 Aplikasi manajemen keuangan pribadi berbasis web — modern, cepat, dan elegan.

## ✨ Fitur Utama

- 📊 **Dashboard interaktif** — grafik tren 6 bulan & breakdown pengeluaran per kategori
- 💸 **Pencatatan transaksi** — tambah, edit, hapus dengan filter & pencarian
- 💰 **Manajemen budget** — atur anggaran per kategori dengan progress bar visual
- 📄 **Laporan PDF** — generate & download laporan keuangan bulanan
- 🌙 **Dark / Light mode** — toggle tema yang tersimpan di browser
- 🔐 **Autentikasi Supabase** — login & register yang aman

## 🛠️ Tech Stack

| Layer | Teknologi |
|-------|-----------|
| Frontend | HTML5, CSS3, Vanilla JavaScript (ES Modules) |
| Auth & DB | Supabase (Auth + PostgreSQL + RLS) |
| Charts | Chart.js v4 |
| PDF Export | jsPDF |
| Icons | Emoji (universal) |

## 📁 Struktur Project

```
annida2finance/
├── index.html            ← Dashboard utama
├── login.html            ← Halaman autentikasi
├── assets/               ← Gambar & aset statis
├── css/
│   ├── global.css        ← Design system & komponen
│   ├── auth.css          ← Styling auth page
│   └── dashboard.css     ← Styling dashboard & semua page
├── js/
│   ├── supabase.js       ← Konfigurasi Supabase client ⚠️
│   ├── auth.js           ← Login, register, logout
│   ├── transactions.js   ← CRUD transaksi
│   ├── budget.js         ← Manajemen budget
│   ├── charts.js         ← Rendering grafik
│   ├── reports.js        ← Export PDF
│   └── app.js            ← Main controller dashboard
├── pages/
│   ├── transactions.html
│   ├── budget.html
│   └── reports.html
└── docs/
    └── schema.sql        ← Database schema Supabase
```

## ⚡ Setup & Konfigurasi

### 1. Setup Supabase Database

1. Buka [supabase.com](https://supabase.com) dan login ke project **Annida2 Finance**
2. Pergi ke **SQL Editor**
3. Copy semua isi file `docs/schema.sql` dan jalankan
4. Pastikan tidak ada error

### 2. Konfigurasi API Key

1. Di Supabase dashboard → **Settings** → **API**
2. Copy **anon public** key
3. Buka file `js/supabase.js`
4. Ganti `YOUR_SUPABASE_ANON_KEY_HERE` dengan key yang sudah dicopy

```js
const SUPABASE_ANON_KEY = 'eyJ...'; // ← paste di sini
```

### 3. Jalankan Aplikasi

Karena menggunakan ES Modules, kamu perlu server lokal:

**Cara termudah — VSCode Live Server:**
- Install extension "Live Server" di VSCode
- Klik kanan `index.html` → "Open with Live Server"

**Atau gunakan Python:**
```bash
python -m http.server 3000
# Buka http://localhost:3000
```

**Atau Node.js:**
```bash
npx serve .
```

## 🗄️ Database Schema

Aplikasi menggunakan 4 tabel:

| Tabel | Fungsi |
|-------|--------|
| `profiles` | Data profil user (dibuat otomatis saat register) |
| `categories` | Kategori transaksi (dibuat otomatis saat register) |
| `transactions` | Data semua transaksi |
| `budgets` | Data budget per kategori per bulan |

> **Row Level Security (RLS)** aktif — setiap user hanya bisa akses data mereka sendiri.

## 🔑 Environment Variables

> Tidak ada file `.env` karena ini pure frontend. Konfigurasi ada di `js/supabase.js`.

---

*Dibuat dengan ❤️ menggunakan Supabase + Vanilla JS*
