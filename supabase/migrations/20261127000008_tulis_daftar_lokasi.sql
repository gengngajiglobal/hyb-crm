-- CRM HYB Fasa 2d: tulis Pendaftaran (sahkan / tolak) dan Lokasi peta (27/11/2026)
-- Sama logik dengan Code.gs: sahkanDaftar, tolakDaftar, simpanLokasi, buangLokasi.
-- Carian Google (cariGoogle, bukaPautanGoogle) perlu Edge Function: menyusul dalam Fasa 3.

-- ---------------------------------------------------------------- Pendaftaran
create or replace function _daftar_baru(did text) returns pendaftaran
language plpgsql security definer set search_path = public as $$
declare r pendaftaran;
begin
  select * into r from pendaftaran where id = did for update;
  if not found then raise exception 'Pendaftaran % tidak dijumpai.', did; end if;
  if r.status <> 'Baru' then
    raise exception '% dah diproses (%). Muat semula.', did, r.status || case when r.oleh <> '' then ' oleh ' || r.oleh else '' end;
  end if;
  return r;
end $$;

create or replace function _cap(s text) returns text language sql immutable as $$
  select initcap(lower(coalesce(s, '')));
$$;

-- p = {id, tempatId?, status?, catatan}
create or replace function sahkan_daftar(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u akses_crm := _penulis();
  r pendaftaran := _daftar_baru(p->>'id');
  tid text := coalesce(nullif(p->>'tempatId', ''), r.tempat_id);
  tnama text; st text; sb text := ''; ct text; pid text; nota text := _teks(p->>'catatan', 300);
begin
  select nama into tnama from tempat where id = tid;
  if not found then raise exception 'ID tempat tidak wujud.'; end if;
  st := _pilih(coalesce(nullif(p->>'status', ''), 'Daftar'), 'statusPelajar', 'Status pelajar');
  if st not in ('Daftar','Aktif','Lead') then raise exception 'Status pelajar baharu mesti Lead, Daftar atau Aktif.'; end if;
  if exists (select 1 from senarai where jenis = 'sumber' and nilai = r.sumber) then sb := r.sumber; end if;
  ct := array_to_string(array_remove(array[
    'Daftar online ' || r.id || case when r.kumpulan <> '' then ' (' || r.kumpulan || ')' else '' end,
    'Lahir ' || coalesce(to_char(r.lahir, 'DD/MM/YYYY'), '') || ', ' || r.jantina,
    case when r.kesihatan <> '' then 'Kesihatan: ' || r.kesihatan end,
    case when r.kawasan <> '' then 'Kawasan: ' || r.kawasan end,
    case when r.emel <> '' then 'Emel: ' || r.emel end,
    case when r.sumber <> '' and sb = '' then 'Sumber: ' || r.sumber end,
    'Gambar: ' || coalesce(nullif(r.gambar, ''), '-'),
    nullif(nota, '')], null), '. ');

  perform pg_advisory_xact_lock(hashtext('hyb_id_pelajar'));
  pid := _id_baru('pelajar', 'HYB-P', 3);
  insert into pelajar (id, nama, umur, ibu_bapa, tel, tempat_id, tarikh_daftar, sumber, status, catatan, susunan)
  values (pid, _teks(r.nama, 120), case when r.umur between 3 and 18 then r.umur end, _teks(r.ibu_bapa, 120), _tel(r.tel), tid,
          _hari_ini(), sb, st, left(ct, 1000), coalesce((select max(susunan) from pelajar), 0) + 1);

  update pendaftaran set status = 'Disahkan', tempat_id = tid, tempat_nama = case when tid <> r.tempat_id then tnama else tempat_nama end,
    pelajar_id = pid, oleh = _oleh(u), diproses = now(), catatan = nota
  where id = r.id;
  perform _log(u, 'Pelajar', pid, 'Pendaftaran online ' || r.id || ' disahkan: ' || r.nama || ' di ' || tid || ' (' || st || ')'
    || case when tid <> r.tempat_id then ', tukar dari ' || r.tempat_id else '' end);
  return jsonb_build_object('ok', true, 'id', pid, 'mesej', _cap(r.nama) || ' kini pelajar ' || pid);
end $$;

-- p = {id, status: 'Ditolak'|'Pendua', catatan}
create or replace function tolak_daftar(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u akses_crm := _penulis();
  r pendaftaran := _daftar_baru(p->>'id');
  st text := case when p->>'status' = 'Pendua' then 'Pendua' else 'Ditolak' end;
  sebab text := _teks(p->>'catatan', 300);
begin
  if st = 'Ditolak' and sebab = '' then raise exception 'Sebab tolak wajib diisi.'; end if;
  update pendaftaran set status = st, oleh = _oleh(u), diproses = now(), catatan = sebab where id = r.id;
  perform _log(u, 'Ibu bapa', r.tempat_id, 'Pendaftaran online ' || r.id || ' (' || r.nama || ') ditanda ' || st
    || case when sebab <> '' then ': ' || sebab else '' end);
  return jsonb_build_object('ok', true, 'id', r.id, 'mesej', r.id || ' ditanda ' || st);
end $$;

-- ---------------------------------------------------------------- Lokasi
-- p = {id, lat, lng, sumber}
create or replace function simpan_lokasi(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u akses_crm := _penulis();
  tid text := btrim(coalesce(p->>'id', ''));
  la double precision; ln double precision; ada boolean;
begin
  if tid !~ '^HYB-T\d+$' then raise exception 'ID tempat tidak sah.'; end if;
  begin
    la := round((p->>'lat')::numeric, 6); ln := round((p->>'lng')::numeric, 6);
  exception when others then raise exception 'Lokasi di luar Malaysia. Pin semula di peta.';
  end;
  if la is null or ln is null or not (la > 0.5 and la < 7.6 and ln > 99.5 and ln < 119.5) then
    raise exception 'Lokasi di luar Malaysia. Pin semula di peta.';
  end if;
  if not exists (select 1 from tempat where id = tid) then raise exception 'Tempat % tidak wujud.', tid; end if;
  ada := exists (select 1 from lokasi where tempat_id = tid);
  insert into lokasi (tempat_id, lat, lng, sumber, dikemas, oleh)
  values (tid, la, ln, _teks(coalesce(nullif(p->>'sumber', ''), 'Manual'), 60), now(), _oleh(u))
  on conflict (tempat_id) do update set lat = excluded.lat, lng = excluded.lng, sumber = excluded.sumber,
    dikemas = excluded.dikemas, oleh = excluded.oleh;
  perform _log(u, 'Tempat', tid, case when ada then 'Lokasi dikemas kini' else 'Lokasi dipin' end
    || ' di peta (' || to_char(la, 'FM990.00000') || ', ' || to_char(ln, 'FM990.00000') || ')');
  return jsonb_build_object('ok', true, 'id', tid, 'mesej', 'Lokasi ' || tid || ' disimpan.');
end $$;

-- p = {id}
create or replace function buang_lokasi(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u akses_crm := _penulis(); tid text := btrim(coalesce(p->>'id', ''));
begin
  delete from lokasi where tempat_id = tid;
  if found then perform _log(u, 'Tempat', tid, 'Pin lokasi dibuang dari peta'); end if;
  return jsonb_build_object('ok', true, 'id', tid, 'mesej', 'Pin ' || tid || ' dibuang.');
end $$;

-- ---------------------------------------------------------------- hak akses
do $$
declare f text;
begin
  execute 'revoke all on function _daftar_baru(text) from public, anon, authenticated';
  foreach f in array array['sahkan_daftar(jsonb)','tolak_daftar(jsonb)','simpan_lokasi(jsonb)','buang_lokasi(jsonb)']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
