# CRM HYB (versi Supabase)

CRM Halaqah Ya Bunayya, Geng Ngaji Global. Paparan sama dengan CRM Apps Script lama, tetapi data
disimpan dalam Supabase supaya laju.

- `index.html`, `app.js`, `styles.css`: paparan CRM (dihoskan GitHub Pages).
- `sambungan.js`: sambungan ke Supabase (login Google + panggilan database).
- `config.js`: URL projek Supabase dan anon key (selamat didedahkan, data dilindungi RLS).
- `supabase/migrations/`: struktur database. Setiap perubahan = fail baru, diapply automatik oleh GitHub Action.
- `import/ImportKeSupabase.gs`: salin data dari Sheet ke Supabase semasa BETA.
- `PANDUAN-UPDATE.md`: cara buat perubahan pada masa depan.

Repo ini mengandungi KOD sahaja. Tiada data pelajar, tiada kunci rahsia.
