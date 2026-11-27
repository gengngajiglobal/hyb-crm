-- CRM HYB: function bacaan utama (Fasa 1, 27/11/2026)
-- crm_data() pulangkan JSON yang SAMA bentuk dengan getData() Apps Script lama,
-- supaya App.html boleh guna tanpa ubah logik paparan. Satu panggilan sahaja.

alter table tetapan add column if not exists url_app_guru text not null default '';
alter table tetapan add column if not exists url_app_daftar text not null default '';
alter table tetapan add column if not exists import_terakhir timestamptz;

-- Format tarikh/masa sama macam bersih_ / bersihMasa_ dalam Code.gs (zon Asia/Kuala_Lumpur)
create or replace function _t(d date) returns text language sql immutable as $$
  select coalesce(to_char(d, 'YYYY-MM-DD'), '');
$$;
create or replace function _m(ts timestamptz) returns text language sql stable as $$
  select coalesce(to_char(ts at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD"T"HH24:MI'), '');
$$;
-- Nombor kosong dalam Sheet = '' (bukan null)
create or replace function _n(x numeric) returns jsonb language sql immutable as $$
  select case when x is null then '""'::jsonb else to_jsonb(x) end;
$$;

create or replace function crm_data()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  u akses_crm;
  t tetapan;
  out jsonb;
  lihat boolean;
  boleh_link boolean;
begin
  u := pengguna_semasa();
  if u.emel is null then
    raise exception 'Tiada akses. Minta manager tambah emel anda dalam senarai akses CRM.' using errcode = '42501';
  end if;
  select * into t from tetapan where id = 1;
  lihat := u.peranan = 'Lihat';
  boleh_link := u.peranan in ('Manager','Ketua','Staf');

  out := jsonb_build_object(
    'user', jsonb_build_object('emel', u.emel, 'nama', u.nama, 'peranan', u.peranan, 'tempat', '[]'::jsonb),
    'dijana', to_char(now() at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD"T"HH24:MI:SS'),
    'tetapan', jsonb_build_object(
      'yuranStandard', t.yuran_standard, 'guru', t.guru, 'masjid', t.masjid, 'kapasiti', t.kapasiti,
      'minBuka', t.min_buka, 'sasaran', t.sasaran, 'target', t.target,
      'pulangModal', case when t.yuran_standard > 0 then ceil((t.guru + t.masjid) / t.yuran_standard) else 0 end,
      'yuranAwal', t.yuran_awal),
    'senarai', (select coalesce(jsonb_object_agg(jenis, v), '{}'::jsonb) from (
        select jenis, jsonb_agg(nilai order by susunan, nilai) v from senarai group by jenis) s),
    'bulanList', (select coalesce(jsonb_agg(nama order by susunan), '[]'::jsonb) from bulan_yuran),
    'bulanDipantau', t.bulan_dipantau,
    'ringkasan', '[]'::jsonb,
    'tempat', (select coalesce(jsonb_agg(jsonb_build_object(
        'baris', x.susunan, 'id', x.id, 'nama', x.nama, 'kawasan', x.kawasan, 'pic', x.pic, 'telPic', x.tel_pic,
        'guru', x.guru, 'telGuru', x.tel_guru, 'hariMasa', x.hari_masa, 'tarikhMula', _t(x.tarikh_mula),
        'status', x.status, 'owner', x.owner, 'tindakan', x.tindakan, 'tarikhTindakan', _t(x.tarikh_tindakan),
        'catatan', x.catatan, 'yuran', _n(x.yuran), 'kosKhas', _n(x.kos_khas), 'sheet', '{}'::jsonb)
        order by x.susunan, x.id), '[]'::jsonb) from tempat x),
    'pelajar', (select coalesce(jsonb_agg(jsonb_build_object(
        'baris', p.susunan, 'id', p.id, 'nama', p.nama, 'umur', coalesce(to_jsonb(p.umur), '""'::jsonb),
        'ibuBapa', p.ibu_bapa, 'tel', p.tel, 'tempatId', coalesce(p.tempat_id, ''),
        'tempatNama', coalesce(tp.nama, case when p.tempat_id is null then '' else 'ID tempat tak wujud' end),
        'tarikhDaftar', _t(p.tarikh_daftar), 'sumber', p.sumber, 'status', p.status,
        'tarikhBerhenti', _t(p.tarikh_berhenti), 'sebabBerhenti', p.sebab_berhenti, 'catatan', p.catatan,
        'yuran', (select coalesce(jsonb_object_agg(b.nama, coalesce(y.status, '')), '{}'::jsonb)
                  from bulan_yuran b left join yuran y on y.pelajar_id = p.id and y.bulan = b.nama))
        order by p.susunan, p.id), '[]'::jsonb)
        from pelajar p left join tempat tp on tp.id = p.tempat_id),
    'laporan', (select coalesce(jsonb_agg(jsonb_build_object(
        'tarikh', _t(l.tarikh), 'tempatId', l.tempat_id, 'tempatNama', coalesce(tp.nama, 'ID tempat tak wujud'),
        'guru', l.guru, 'hadir', coalesce(to_jsonb(l.hadir), '""'::jsonb), 'topik', l.topik, 'isu', l.isu, 'oleh', l.oleh)
        order by l.id), '[]'::jsonb)
        from (select * from laporan_kelas order by id desc limit 1000) l left join tempat tp on tp.id = l.tempat_id),
    'kehadiran', (select coalesce(jsonb_agg(jsonb_build_object(
        'tarikh', _t(k.tarikh), 'tempatId', k.tempat_id, 'pelajarId', k.pelajar_id, 'status', k.status)
        order by k.id), '[]'::jsonb)
        from (select * from kehadiran order by id desc limit 8000) k),
    'lokasi', (select coalesce(jsonb_object_agg(tempat_id, jsonb_build_object('lat', lat, 'lng', lng, 'sumber', sumber)), '{}'::jsonb) from lokasi),
    'guru', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', g.id, 'nama', g.nama, 'tel', g.tel, 'emel', g.emel, 'gelaran', g.gelaran, 'kawasan', g.kawasan,
        'status', g.status, 'sumber', g.sumber, 'tarikhMohon', _t(g.tarikh_mohon), 'tarikhTemuduga', _t(g.tarikh_temuduga),
        'tarikhMula', _t(g.tarikh_mula), 'kelayakan', g.kelayakan, 'catatan', g.catatan) order by g.id), '[]'::jsonb) from guru g),
    'aksesGuru', case when boleh_link then (select coalesce(jsonb_object_agg(guru_id, jsonb_build_object('dicipta', _m(dicipta), 'oleh', oleh)), '{}'::jsonb)
        from (select distinct on (guru_id) * from akses_guru where aktif order by guru_id, dicipta desc) a) else '{}'::jsonb end,
    'urlAppGuru', t.url_app_guru <> '',
    'statusGuru', '["Calon","Temuduga","Latihan","Aktif","Simpanan","Tidak diteruskan"]'::jsonb,
    'log', (select coalesce(jsonb_agg(jsonb_build_object(
        'tarikh', _m(g.masa), 'jenis', g.jenis, 'ref', g.ref, 'interaksi', g.interaksi, 'oleh', g.oleh,
        'tindakan', g.tindakan, 'tarikhTindakan', _t(g.tarikh_tindakan)) order by g.id), '[]'::jsonb)
        from (select * from log order by id desc limit 1000) g),
    'daftar', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', d.id, 'dihantar', _m(d.dihantar), 'status', d.status, 'tempatId', d.tempat_id, 'tempatNama', d.tempat_nama,
        'nama', d.nama, 'lahir', case when lihat then '' else _t(d.lahir) end, 'umur', coalesce(to_jsonb(d.umur), '""'::jsonb),
        'jantina', d.jantina, 'ibuBapa', d.ibu_bapa,
        'tel', case when lihat then '' else d.tel end, 'emel', case when lihat then '' else d.emel end,
        'kawasan', d.kawasan, 'kesihatan', case when lihat then '' else d.kesihatan end,
        'sumber', d.sumber, 'mesej', case when lihat then '' else d.mesej end, 'gambar', d.gambar, 'pdpa', d.pdpa,
        'kumpulan', d.kumpulan, 'pelajarId', d.pelajar_id, 'oleh', d.oleh, 'diproses', _m(d.diproses), 'catatan', d.catatan)
        order by d.dihantar), '[]'::jsonb)
        from (select * from pendaftaran order by dihantar desc limit 1500) d),
    'urlAppDaftar', t.url_app_daftar,
    'bayaran', (select coalesce(jsonb_agg(jsonb_build_object(
        'masa', _m(r.masa), 'pelajarId', r.ref_id, 'tempatId', r.tempat_id, 'bulan', r.bulan, 'status', r.status,
        'amaun', r.amaun, 'oleh', r.oleh, 'sumber', r.sumber) order by r.masa, r.id), '[]'::jsonb)
        from (select * from rekod_bayaran
              where masa >= now() - interval '400 days' and sumber <> 'Baki awal' and amaun <> 0
              order by masa desc, id desc limit 5000) r),
    'bayaranMula', coalesce(
        nullif((select _m(min(masa)) from rekod_bayaran where sumber = 'Baki awal'), ''),
        (select _m(min(masa)) from rekod_bayaran)),
    'penaja', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id, 'nama', s.nama, 'tempatId', s.tempat_id, 'jenis', s.jenis, 'amaun', s.amaun, 'aktif', s.aktif, 'catatan', s.catatan)
        order by s.id), '[]'::jsonb) from penaja s),
    'sewa', jsonb_build_object(
      'tetapan', (select coalesce(jsonb_agg(jsonb_build_object(
          'tempatId', w.tempat_id, 'penerima', w.penerima, 'amaun', w.amaun, 'aktif', w.aktif, 'cara', w.cara, 'catatan', w.catatan)
          order by w.tempat_id), '[]'::jsonb) from sewa_masjid w),
      'rekod', (select coalesce(jsonb_agg(jsonb_build_object(
          'masa', _m(r.masa), 'tempatId', r.tempat_id, 'bulan', r.bulan, 'status', r.status, 'amaun', r.amaun,
          'resit', r.resit, 'cara', r.cara, 'rujukan', r.rujukan, 'oleh', r.oleh, 'catatan', r.catatan)
          order by r.id), '[]'::jsonb) from rekod_bayaran_masjid r)),
    'amaran', '[]'::jsonb,
    'importTerakhir', _m(t.import_terakhir)
  );
  return out;
end $$;

revoke all on function crm_data() from public, anon;
grant execute on function crm_data() to authenticated;
