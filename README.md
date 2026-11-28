# CRM HYB (versi Supabase)

CRM Halaqah Ya Bunayya, Geng Ngaji Global. Paparan sama dengan CRM Apps Script lama, tetapi data
disimpan dalam Supabase supaya laju.

- `index.html`, `app.js`, `styles.css`: paparan CRM (dihoskan GitHub Pages).
- `sambungan.js`: sambungan ke Supabase (login Google + panggilan database).
- `config.js`: URL projek Supabase dan anon key (selamat didedahkan, data dilindungi RLS).
- `supabase/migrations/`: struktur database. Setiap perubahan = fail baru, diapply automatik oleh GitHub Action.
- `import/ImportKeSupabase.gs`: import Sheet ke Supabase semasa BETA (ditutup selepas cutover 28/11/2026).
- `apps-script/SkripHarian.gs`: backup malam ke Sheet salinan + emel notifikasi pendaftaran.
- `apps-script/alih/`: versi alih untuk 3 app Apps Script lama (URL lama terus ke alamat baru).
- `PANDUAN-UPDATE.md`: cara buat perubahan pada masa depan.

Repo ini mengandungi KOD sahaja. Tiada data pelajar, tiada kunci rahsia.
