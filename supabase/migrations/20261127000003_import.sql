-- CRM HYB: import penuh dari Sheet (Fasa 1 BETA, 27/11/2026)
-- Dipanggil oleh skrip import/ImportKeSupabase.gs dengan service_role key.
-- Ganti SEMUA data operasi dengan salinan terkini Sheet dalam satu transaksi.
-- akses_crm TIDAK disentuh kecuali baris baru ditambah (supaya peranan yang diubah dalam Supabase kekal).
-- Selepas cutover, function ini dibuang (Supabase jadi sumber data utama).

create or replace function import_penuh(d jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare n jsonb := '{}'::jsonb;
begin
  truncate yuran, rekod_bayaran, laporan_kelas, kehadiran, log, akses_guru, lokasi, pendaftaran,
           penaja, sewa_masjid, rekod_bayaran_masjid, senarai, bulan_yuran restart identity;
  delete from pelajar; delete from guru; delete from tempat;

  update tetapan set
    yuran_standard = coalesce((d->'tetapan'->>'yuranStandard')::numeric, yuran_standard),
    guru           = coalesce((d->'tetapan'->>'guru')::numeric, guru),
    masjid         = coalesce((d->'tetapan'->>'masjid')::numeric, masjid),
    kapasiti       = coalesce((d->'tetapan'->>'kapasiti')::numeric, kapasiti),
    min_buka       = coalesce((d->'tetapan'->>'minBuka')::numeric, min_buka),
    sasaran        = coalesce((d->'tetapan'->>'sasaran')::numeric, sasaran),
    target         = coalesce((d->'tetapan'->>'target')::numeric, target),
    yuran_awal     = coalesce((d->'tetapan'->>'yuranAwal')::numeric, yuran_awal),
    bulan_dipantau = coalesce(d->'tetapan'->>'bulanDipantau', bulan_dipantau),
    import_terakhir = now()
  where id = 1;

  insert into senarai (jenis, nilai, susunan)
    select distinct on (jenis, nilai) jenis, nilai, susunan from jsonb_to_recordset(d->'senarai') as x(jenis text, nilai text, susunan int)
    where coalesce(nilai, '') <> '';
  insert into bulan_yuran select * from jsonb_to_recordset(d->'bulan') as x(nama text, susunan int);

  insert into tempat (id, nama, kawasan, pic, tel_pic, guru, tel_guru, hari_masa, tarikh_mula, status, owner,
                      tindakan, tarikh_tindakan, catatan, yuran, kos_khas, susunan)
    select id, coalesce(nama, ''), coalesce(kawasan, ''), coalesce(pic, ''), coalesce(tel_pic, ''), coalesce(guru, ''),
           coalesce(tel_guru, ''), coalesce(hari_masa, ''), tarikh_mula, coalesce(status, ''), coalesce(owner, ''),
           coalesce(tindakan, ''), tarikh_tindakan, coalesce(catatan, ''), yuran, kos_khas, susunan
    from jsonb_to_recordset(d->'tempat') as x(id text, nama text, kawasan text, pic text, tel_pic text, guru text,
      tel_guru text, hari_masa text, tarikh_mula date, status text, owner text, tindakan text, tarikh_tindakan date,
      catatan text, yuran numeric, kos_khas numeric, susunan int);

  insert into pelajar (id, nama, umur, ibu_bapa, tel, tempat_id, tarikh_daftar, sumber, status, tarikh_berhenti,
                       sebab_berhenti, catatan, susunan)
    select id, coalesce(nama, ''), umur, coalesce(ibu_bapa, ''), coalesce(tel, ''),
           nullif(x.tempat_id, ''), tarikh_daftar, coalesce(sumber, ''),
           coalesce(status, ''), tarikh_berhenti, coalesce(sebab_berhenti, ''), coalesce(catatan, ''), susunan
    from jsonb_to_recordset(d->'pelajar') as x(id text, nama text, umur int, ibu_bapa text, tel text, tempat_id text,
      tarikh_daftar date, sumber text, status text, tarikh_berhenti date, sebab_berhenti text, catatan text, susunan int);

  insert into yuran (pelajar_id, bulan, status)
    select pelajar_id, bulan, status from jsonb_to_recordset(d->'yuran') as x(pelajar_id text, bulan text, status text)
    where coalesce(status, '') <> '' and exists (select 1 from pelajar p where p.id = x.pelajar_id);

  insert into rekod_bayaran (masa, ref_id, tempat_id, bulan, status, amaun, oleh, sumber)
    select masa, ref_id, coalesce(tempat_id, ''), bulan, coalesce(status, ''), coalesce(amaun, 0), coalesce(oleh, ''), coalesce(sumber, '')
    from jsonb_to_recordset(d->'bayaran') as x(masa timestamptz, ref_id text, tempat_id text, bulan text, status text,
      amaun numeric, oleh text, sumber text);

  insert into laporan_kelas (tarikh, tempat_id, guru, hadir, topik, isu, oleh)
    select tarikh, tempat_id, coalesce(guru, ''), hadir, coalesce(topik, ''), coalesce(isu, ''), coalesce(oleh, '')
    from jsonb_to_recordset(d->'laporan') as x(tarikh date, tempat_id text, guru text, hadir int, topik text, isu text, oleh text);

  insert into kehadiran (tarikh, tempat_id, pelajar_id, nama_pelajar, status, guru, oleh)
    select tarikh, tempat_id, pelajar_id, coalesce(nama_pelajar, ''), coalesce(status, ''), coalesce(guru, ''), coalesce(oleh, '')
    from jsonb_to_recordset(d->'kehadiran') as x(tarikh date, tempat_id text, pelajar_id text, nama_pelajar text,
      status text, guru text, oleh text);

  insert into log (masa, jenis, ref, interaksi, oleh, tindakan, tarikh_tindakan)
    select coalesce(masa, now()), coalesce(jenis, ''), coalesce(ref, ''), coalesce(interaksi, ''), coalesce(oleh, ''),
           coalesce(tindakan, ''), tarikh_tindakan
    from jsonb_to_recordset(d->'log') as x(masa timestamptz, jenis text, ref text, interaksi text, oleh text,
      tindakan text, tarikh_tindakan date);

  insert into guru (id, nama, tel, emel, gelaran, kawasan, status, sumber, tarikh_mohon, tarikh_temuduga,
                    tarikh_mula, kelayakan, catatan)
    select id, coalesce(nama, ''), coalesce(tel, ''), coalesce(emel, ''), coalesce(gelaran, ''), coalesce(kawasan, ''),
           coalesce(nullif(status, ''), 'Calon'), coalesce(sumber, ''), tarikh_mohon, tarikh_temuduga, tarikh_mula,
           coalesce(kelayakan, ''), coalesce(catatan, '')
    from jsonb_to_recordset(d->'guru') as x(id text, nama text, tel text, emel text, gelaran text, kawasan text,
      status text, sumber text, tarikh_mohon date, tarikh_temuduga date, tarikh_mula date, kelayakan text, catatan text);

  insert into akses_guru (guru_id, hash_kod, dicipta, oleh, aktif)
    select guru_id, hash_kod, coalesce(dicipta, now()), coalesce(oleh, ''), coalesce(aktif, false)
    from jsonb_to_recordset(d->'aksesGuru') as x(guru_id text, hash_kod text, dicipta timestamptz, oleh text, aktif boolean)
    where exists (select 1 from guru g where g.id = x.guru_id);

  insert into lokasi (tempat_id, lat, lng, sumber, dikemas, oleh)
    select distinct on (tempat_id) tempat_id, lat, lng, coalesce(sumber, ''), coalesce(dikemas, now()), coalesce(oleh, '')
    from jsonb_to_recordset(d->'lokasi') as x(tempat_id text, lat float8, lng float8, sumber text, dikemas timestamptz, oleh text)
    where lat is not null and lng is not null order by tempat_id, dikemas desc nulls last;

  insert into pendaftaran
    select (jsonb_populate_record(null::pendaftaran,
             '{"tempat_id":"","tempat_nama":"","nama":"","jantina":"","ibu_bapa":"","tel":"","emel":"","kawasan":"","kesihatan":"","sumber":"","mesej":"","gambar":"","pdpa":"","kumpulan":"","pelajar_id":"","oleh":"","catatan":"","status":"Baru"}'::jsonb || jsonb_build_object('dihantar', now()) || jsonb_strip_nulls(e))).*
    from jsonb_array_elements(coalesce(d->'pendaftaran', '[]'::jsonb)) e;

  insert into penaja (id, nama, tempat_id, jenis, amaun, aktif, catatan)
    select id, coalesce(nama, ''), coalesce(tempat_id, ''), coalesce(nullif(jenis, ''), 'Tetap'), coalesce(amaun, 0),
           coalesce(aktif, true), coalesce(catatan, '')
    from jsonb_to_recordset(d->'penaja') as x(id text, nama text, tempat_id text, jenis text, amaun numeric, aktif boolean, catatan text);

  insert into sewa_masjid (tempat_id, penerima, amaun, aktif, cara, catatan)
    select tempat_id, coalesce(penerima, ''), coalesce(amaun, 0), coalesce(aktif, true), coalesce(cara, ''), coalesce(catatan, '')
    from jsonb_to_recordset(d->'sewa') as x(tempat_id text, penerima text, amaun numeric, aktif boolean, cara text, catatan text);

  insert into rekod_bayaran_masjid (masa, tempat_id, bulan, status, amaun, resit, cara, rujukan, oleh, catatan)
    select coalesce(masa, now()), tempat_id, bulan, status, coalesce(amaun, 0), coalesce(resit, ''), coalesce(cara, ''),
           coalesce(rujukan, ''), coalesce(oleh, ''), coalesce(catatan, '')
    from jsonb_to_recordset(d->'sewaRekod') as x(masa timestamptz, tempat_id text, bulan text, status text, amaun numeric,
      resit text, cara text, rujukan text, oleh text, catatan text);

  insert into akses_crm (emel, nama, peranan, aktif, catatan)
    select lower(emel), coalesce(nama, ''), peranan, coalesce(aktif, true), coalesce(catatan, '')
    from jsonb_to_recordset(d->'akses') as x(emel text, nama text, peranan text, aktif boolean, catatan text)
    where peranan in ('Manager','Ketua','Staf','Lihat') and position('@' in coalesce(emel, '')) > 1
  on conflict (emel) do nothing;

  select jsonb_build_object(
    'tempat', (select count(*) from tempat), 'pelajar', (select count(*) from pelajar), 'yuran', (select count(*) from yuran),
    'bayaran', (select count(*) from rekod_bayaran), 'laporan', (select count(*) from laporan_kelas),
    'kehadiran', (select count(*) from kehadiran), 'log', (select count(*) from log), 'guru', (select count(*) from guru),
    'penaja', (select count(*) from penaja), 'sewa', (select count(*) from sewa_masjid),
    'pendaftaran', (select count(*) from pendaftaran), 'akses', (select count(*) from akses_crm)) into n;
  return n;
end $$;

revoke all on function import_penuh(jsonb) from public, anon, authenticated;
grant execute on function import_penuh(jsonb) to service_role;
