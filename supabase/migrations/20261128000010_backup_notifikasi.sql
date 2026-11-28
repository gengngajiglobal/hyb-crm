-- Fasa 4 persediaan: backup malam (Supabase -> Sheet salinan) dan emel notifikasi pendaftaran.
-- Dua-dua dipanggil oleh skrip harian Apps Script dengan service key. Tiada akses anon/authenticated.

alter table pendaftaran add column if not exists dimaklum timestamptz;
-- Pendaftaran sedia ada sudah dimaklumkan oleh borang lama.
update pendaftaran set dimaklum = now() where dimaklum is null;

-- Semua jadual, satu objek JSON: { "tempat": [...], "pelajar": [...], ... }
create or replace function eksport_penuh()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  t text;
  hasil jsonb := '{}'::jsonb;
  baris jsonb;
begin
  foreach t in array array['tetapan','senarai','bulan_yuran','tempat','pelajar','yuran','rekod_bayaran',
    'laporan_kelas','kehadiran','log','guru','akses_guru','lokasi','pendaftaran','penaja','sewa_masjid',
    'rekod_bayaran_masjid','akses_crm'] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from %I x', t) into baris;
    hasil := hasil || jsonb_build_object(t, baris);
  end loop;
  return jsonb_build_object('masa', to_char(now() at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD HH24:MI'), 'jadual', hasil);
end $$;

-- Pendaftaran baru yang belum diemel (7 hari terakhir). Tiada telefon/kesihatan (PDPA).
create or replace function pendaftaran_untuk_emel()
returns jsonb
language sql security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', d.id, 'nama', d.nama, 'umur', d.umur, 'tempat_id', d.tempat_id,
           'tempat_nama', coalesce(nullif(t.nama, ''), d.tempat_nama), 'hari_masa', coalesce(t.hari_masa, ''),
           'kumpulan', d.kumpulan) order by d.dihantar, d.id), '[]'::jsonb)
  from pendaftaran d left join tempat t on t.id = d.tempat_id
  where d.dimaklum is null and d.dihantar > now() - interval '7 days';
$$;

create or replace function tanda_dimaklum(ids text[])
returns int
language sql security definer set search_path = public
as $$
  with u as (update pendaftaran set dimaklum = now() where id = any(ids) and dimaklum is null returning 1)
  select count(*)::int from u;
$$;

revoke all on function eksport_penuh() from public, anon, authenticated;
revoke all on function pendaftaran_untuk_emel() from public, anon, authenticated;
revoke all on function tanda_dimaklum(text[]) from public, anon, authenticated;
grant execute on function eksport_penuh() to service_role;
grant execute on function pendaftaran_untuk_emel() to service_role;
grant execute on function tanda_dimaklum(text[]) to service_role;
