# Panduan update CRM HYB (untuk Ka)

## Tukar rupa, skrin atau cara kerja CRM
1. Minta dalam projek Claude HYB, contoh: "Dalam Kutipan Yuran, tambah butang eksport".
2. Claude buat perubahan dan buka Pull Request (PR) dalam repo ini. Untuk perubahan besar, Claude bagi link preview dulu.
3. Buka link PR yang Claude bagi. Tekan **Merge pull request**, kemudian **Confirm merge**.
4. Tunggu 1-2 minit. GitHub Pages kemas kini sendiri. Team cuma refresh CRM.

Kalau perubahan itu bermasalah: buka PR yang sama, tekan **Revert**, kemudian Merge PR revert itu. CRM kembali ke versi sebelum.

## Tukar struktur database (tambah lajur, table baru)
Claude letak fail baru dalam `supabase/migrations/` dalam PR yang sama. Bila Ka merge, GitHub Action
"Migrasi database" apply perubahan ke Supabase secara automatik. Semak tab **Actions** dalam repo: tanda hijau = berjaya.
Migration hanya tambah atau ubah. Ia tidak padam data melainkan Ka arahkan.

## Tukar data biasa
Yuran tempat, sewa masjid, penaja, akses staf dan lain-lain diubah terus dalam CRM. Tak perlu code.

## Tambah staf baru
Buat masa ini: Supabase > Table Editor > akses_crm > Insert row. Isi emel (huruf kecil), nama, peranan
(Manager / Ketua / Staf / Lihat), aktif = true. Untuk buang akses, tukar aktif = false. Staf log masuk dengan butang
Google menggunakan emel itu. Tak perlu share Sheet lagi. (Skrin urus akses dalam CRM akan ditambah.)

## Perkara yang JANGAN dibuat
- Jangan tampal service_role key Supabase dalam mana-mana fail repo atau chat.
- Jangan ubah table terus dalam Supabase Table Editor semasa team sedang guna, kecuali Claude minta.
