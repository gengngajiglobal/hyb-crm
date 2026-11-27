-- CRM HYB Fasa 2a: tulis Kutipan yuran (27/11/2026)
-- Sama logik dengan Code.gs: kemaskiniYuran, tukarTarikhBayar, terimaTajaan, batalTajaan,
-- bayarPendaftaran, batalPendaftaran. Lejar rekod_bayaran dikemas kini terus dalam transaksi
-- yang sama (ganti selarasBayaran_ yang dulu jalan setiap kali CRM dibuka).
-- Semua function: security definer, semak peranan dalam akses_crm, hanya untuk authenticated.

-- ---------------------------------------------------------------- pembantu
create or replace function _penulis() returns akses_crm
language plpgsql stable security definer set search_path = public as $$
declare u akses_crm;
begin
  u := pengguna_semasa();
  if u.emel is null then raise exception 'Tiada akses.' using errcode = '42501'; end if;
  if u.peranan not in ('Manager','Ketua','Staf') then
    raise exception 'Peranan % tidak boleh ubah data ini.', u.peranan using errcode = '42501';
  end if;
  return u;
end $$;

create or replace function _oleh(u akses_crm) returns text language sql immutable as $$
  select left(coalesce(nullif(u.nama, ''), u.emel), 80);
$$;

create or replace function _hari_ini() returns date language sql stable as $$
  select (now() at time zone 'Asia/Kuala_Lumpur')::date;
$$;

-- 'YYYY-MM-DD' atau 'DD/MM/YYYY' -> date (null jika kosong)
create or replace function _tarikh(v text) returns date language plpgsql immutable as $$
declare m text[];
begin
  if coalesce(trim(v), '') = '' then return null; end if;
  m := regexp_match(trim(v), '^(\d{4})-(\d{2})-(\d{2})$');
  if m is not null then return make_date(m[1]::int, m[2]::int, m[3]::int); end if;
  m := regexp_match(trim(v), '^(\d{1,2})/(\d{1,2})/(\d{4})$');
  if m is not null then return make_date(m[3]::int, m[2]::int, m[1]::int); end if;
  raise exception 'Format tarikh tidak sah: %', v;
exception when datetime_field_overflow or invalid_datetime_format then
  raise exception 'Format tarikh tidak sah: %', v;
end $$;

-- Tarikh bayar -> 12:00 tengah hari waktu Malaysia
create or replace function _tengah_hari(d date) returns timestamptz language sql immutable as $$
  select (d::timestamp + time '12:00') at time zone 'Asia/Kuala_Lumpur';
$$;

-- Tarikh lepas yang sah (wajib), dengan had tahun minimum
create or replace function _tarikh_lepas(v text, label text, min_tahun int) returns date
language plpgsql stable as $$
declare d date := _tarikh(v);
begin
  if d is null then raise exception '% wajib diisi.', label; end if;
  if d > _hari_ini() then raise exception '% tidak boleh pada masa depan.', label; end if;
  if d < make_date(min_tahun, 1, 1) then raise exception '% terlalu lama.', label; end if;
  return d;
end $$;

create or replace function _nombor(v jsonb) returns numeric language plpgsql immutable as $$
begin
  if v is null or v = 'null'::jsonb or v = '""'::jsonb then return null; end if;
  return trim_scale(round((v #>> '{}')::numeric, 2));
exception when invalid_text_representation then
  raise exception 'Amaun tidak sah: %', v #>> '{}';
end $$;

create or replace function _log(u akses_crm, jenis text, ref text, interaksi text) returns void
language sql security definer set search_path = public as $$
  insert into log (masa, jenis, ref, interaksi, oleh) values (now(), jenis, coalesce(ref, ''), left(interaksi, 1000), _oleh(u));
$$;

create or replace function _yuran_tempat(tid text) returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(nullif((select yuran from tempat where id = tid), 0), (select yuran_standard from tetapan where id = 1));
$$;

-- Kunci lejar supaya dua staf tekan serentak tak buat rekod berganda
create or replace function _kunci_lejar() returns void language sql as $$
  select pg_advisory_xact_lock(hashtext('hyb_rekod_bayaran'));
$$;

-- ---------------------------------------------------------------- kemaskiniYuran
-- p = {bulan, ubah:[{id, dari, ke, amaun}], tarikhBayar, sebab}
create or replace function kemaskini_yuran(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u akses_crm := _penulis();
  bln text := p->>'bulan';
  tb date;
  masa_bayar timestamptz;
  x jsonb;
  ke text; dari text; sekarang text; pid text; tid text;
  a numeric; net int; amaun_akhir numeric;
  jumlah int := 0;
  konflik text[] := '{}';
  kira jsonb := '{}'::jsonb;
  ada_amaun text[] := '{}';
  ringkas text; mesej text;
  status_sah text[];
begin
  if not exists (select 1 from bulan_yuran where nama = bln) then
    raise exception 'Lajur % tidak dijumpai.', bln;
  end if;
  if jsonb_typeof(p->'ubah') <> 'array' or jsonb_array_length(p->'ubah') = 0 then raise exception 'Tiada perubahan.'; end if;
  if jsonb_array_length(p->'ubah') > 2000 then raise exception 'Terlalu banyak perubahan sekali gus.'; end if;

  tb := _tarikh(p->>'tarikhBayar');
  if tb is null or tb = _hari_ini() then masa_bayar := now();
  else
    if tb > _hari_ini() then raise exception 'Tarikh bayar tidak boleh pada masa depan.'; end if;
    if tb < date '2026-01-01' then raise exception 'Tarikh bayar terlalu lama.'; end if;
    masa_bayar := _tengah_hari(tb);
  end if;

  select array_agg(nilai) into status_sah from senarai where jenis = 'statusYuran';
  perform _kunci_lejar();

  for x in select * from jsonb_array_elements(p->'ubah') loop
    pid := x->>'id';
    ke := coalesce(x->>'ke', '');
    if ke <> '' and not (ke = any(coalesce(status_sah, '{}'))) then
      raise exception 'Status yuran "%" tiada dalam Tetapan.', ke;
    end if;
    a := null;
    if ke = 'Dibayar' then
      a := _nombor(x->'amaun');
      if a is not null and (a <= 0 or a > 5000) then raise exception 'Amaun bayaran tidak sah untuk %.', pid; end if;
      if a is not null then ada_amaun := ada_amaun || (pid || ' RM' || a); end if;
    end if;

    select tempat_id into tid from pelajar where id = pid;
    if not found then konflik := konflik || (pid || ' (tak dijumpai)'); continue; end if;
    tid := coalesce(tid, '');

    select coalesce(status, '') into sekarang from yuran where pelajar_id = pid and bulan = bln for update;
    sekarang := coalesce(sekarang, '');
    dari := x->>'dari';
    if dari is not null and sekarang <> dari then konflik := konflik || pid; continue; end if;
    if sekarang = ke then continue; end if;

    if ke = '' then delete from yuran where pelajar_id = pid and bulan = bln;
    else
      insert into yuran (pelajar_id, bulan, status, dikemas) values (pid, bln, ke, now())
      on conflict (pelajar_id, bulan) do update set status = excluded.status, dikemas = now();
    end if;
    jumlah := jumlah + 1;
    kira := jsonb_set(kira, array[coalesce(nullif(ke, ''), '(kosong)')],
                      to_jsonb(coalesce((kira->>coalesce(nullif(ke, ''), '(kosong)'))::int, 0) + 1));

    -- Lejar (sama macam selarasBayaran_)
    select coalesce(sum(sign(amaun)), 0) into net from rekod_bayaran where ref_id = pid and bulan = bln;
    if ke = 'Dibayar' and net <= 0 then
      insert into rekod_bayaran (masa, ref_id, tempat_id, bulan, status, amaun, oleh, sumber)
      values (masa_bayar, pid, tid, bln, 'Dibayar', coalesce(a, _yuran_tempat(tid)), _oleh(u), 'CRM');
    elsif ke <> 'Dibayar' and net > 0 then
      select amaun into amaun_akhir from rekod_bayaran where ref_id = pid and bulan = bln and amaun > 0 order by masa desc, id desc limit 1;
      insert into rekod_bayaran (masa, ref_id, tempat_id, bulan, status, amaun, oleh, sumber)
      values (now(), pid, tid, bln, coalesce(nullif(ke, ''), '(kosong)'), -coalesce(amaun_akhir, _yuran_tempat(tid), 0), _oleh(u), 'CRM');
    end if;
  end loop;

  if jumlah > 0 then
    select string_agg(k || ' ' || v, ', ') into ringkas from jsonb_each_text(kira) as e(k, v);
    perform _log(u, 'Pelajar', case when jsonb_array_length(p->'ubah') = 1 then p->'ubah'->0->>'id' else '' end,
      bln || ': ' || jumlah || ' status dikemas kini (' || ringkas || ')'
      || case when array_length(ada_amaun, 1) > 0 then '. Amaun: ' || array_to_string(ada_amaun, ', ') else '' end
      || case when coalesce(p->>'sebab', '') <> '' then '. ' || left(p->>'sebab', 200) else '' end);
  end if;

  mesej := case when jumlah > 0 then jumlah || ' status yuran dikemas kini' else 'Tiada perubahan' end;
  if array_length(konflik, 1) > 0 then
    mesej := mesej || '. ' || array_length(konflik, 1) || ' dilangkau kerana dah diubah oleh orang lain: '
      || array_to_string(konflik[1:5], ', ') || case when array_length(konflik, 1) > 5 then '…' else '' end;
  end if;
  return jsonb_build_object('ok', true, 'id', '', 'mesej', mesej);
end $$;

-- ---------------------------------------------------------------- tukarTarikhBayar
-- p = {id, bulan, tarikh, amaun, sebab}
create or replace function tukar_tarikh_bayar(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u akses_crm := _penulis();
  d date := _tarikh_lepas(p->>'tarikh', 'Tarikh bayar', 2026);
  baru numeric := _nombor(p->'amaun');
  pid text := p->>'id'; bln text := p->>'bulan'; tid text;
  r rekod_bayaran; tukar boolean;
begin
  if baru is not null and (baru <= 0 or baru > 5000) then raise exception 'Amaun bayaran tidak sah.'; end if;
  select coalesce(tempat_id, '') into tid from pelajar where id = pid;
  if not found then raise exception 'ID % tidak dijumpai.', pid; end if;
  if coalesce((select status from yuran where pelajar_id = pid and bulan = bln), '') <> 'Dibayar' then
    raise exception '% belum ditanda Dibayar untuk %.', pid, bln;
  end if;
  perform _kunci_lejar();
  select * into r from rekod_bayaran where ref_id = pid and bulan = bln and amaun > 0 order by masa desc, id desc limit 1;
  if not found then
    insert into rekod_bayaran (masa, ref_id, tempat_id, bulan, status, amaun, oleh, sumber)
    values (now(), pid, tid, bln, 'Dibayar', _yuran_tempat(tid), _oleh(u), 'CRM') returning * into r;
  end if;
  tukar := baru is not null and baru <> r.amaun;
  update rekod_bayaran set masa = _tengah_hari(d),
    amaun = case when tukar then baru else amaun end,
    sumber = case when sumber = 'Baki awal' then 'CRM (tarikh diisi)' else sumber end
  where id = r.id;
  perform _log(u, 'Pelajar', pid, bln || ': tarikh bayar ditetapkan ' || to_char(d, 'DD/MM/YYYY')
    || case when tukar then '; amaun RM' || r.amaun || ' → RM' || baru
         || case when coalesce(p->>'sebab', '') <> '' then ' (' || left(p->>'sebab', 200) || ')' else '' end else '' end);
  return jsonb_build_object('ok', true, 'id', pid,
    'mesej', case when tukar then 'Tarikh & amaun bayaran ' else 'Tarikh bayar ' end || pid || ' dikemas kini');
end $$;

-- ---------------------------------------------------------------- tajaan
-- p = {penajaId, bulan, amaun, tarikh}
create or replace function terima_tajaan(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u akses_crm := _penulis();
  pj penaja; a numeric := _nombor(p->'amaun'); d date; net numeric;
  bln text := coalesce(p->>'bulan', '');
begin
  select * into pj from penaja where id = p->>'penajaId';
  if not found then raise exception 'Penaja % tidak dijumpai.', p->>'penajaId'; end if;
  if bln !~ '^Yuran \S+ \d{4}$' then raise exception 'Bulan yuran tidak sah.'; end if;
  if a is null or a <= 0 or a > 100000 then raise exception 'Amaun tidak sah.'; end if;
  d := _tarikh_lepas(p->>'tarikh', 'Tarikh terima', 2026);
  perform _kunci_lejar();
  select coalesce(sum(amaun), 0) into net from rekod_bayaran where ref_id = pj.id and bulan = bln;
  if net > 0 then
    insert into rekod_bayaran (masa, ref_id, tempat_id, bulan, status, amaun, oleh, sumber)
    values (now(), pj.id, pj.tempat_id, bln, 'Tajaan dibatalkan', -net, _oleh(u), 'Tajaan (pembetulan)');
  end if;
  insert into rekod_bayaran (masa, ref_id, tempat_id, bulan, status, amaun, oleh, sumber)
  values (_tengah_hari(d), pj.id, pj.tempat_id, bln, 'Tajaan', a, _oleh(u), 'Tajaan: ' || pj.nama);
  perform _log(u, 'Tempat', pj.tempat_id, bln || ': tajaan ' || pj.nama || ' RM' || a || ' diterima ' || to_char(d, 'DD/MM/YYYY')
    || case when net > 0 then ' (ganti rekod lama RM' || net || ')' else '' end);
  return jsonb_build_object('ok', true, 'id', pj.id, 'mesej', 'Tajaan ' || pj.nama || ' ' || replace(bln, 'Yuran ', '') || ' direkod');
end $$;

-- p = {penajaId, bulan}
create or replace function batal_tajaan(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u akses_crm := _penulis(); net numeric; tid text;
  sid text := p->>'penajaId'; bln text := p->>'bulan';
begin
  perform _kunci_lejar();
  select coalesce(sum(amaun), 0), max(tempat_id) into net, tid from rekod_bayaran where ref_id = sid and bulan = bln;
  if not (net > 0) then raise exception 'Tiada tajaan direkod untuk bulan ini.'; end if;
  insert into rekod_bayaran (masa, ref_id, tempat_id, bulan, status, amaun, oleh, sumber)
  values (now(), sid, coalesce(tid, ''), bln, 'Tajaan dibatalkan', -net, _oleh(u), 'Tajaan (dibatalkan)');
  perform _log(u, 'Tempat', tid, bln || ': tajaan ' || sid || ' RM' || net || ' dibatalkan');
  return jsonb_build_object('ok', true, 'id', sid, 'mesej', 'Tajaan dibatalkan');
end $$;

-- ---------------------------------------------------------------- yuran pendaftaran
-- p = {id, amaun, tarikh}
create or replace function bayar_pendaftaran(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u akses_crm := _penulis(); pid text := p->>'id'; tid text;
  a numeric := _nombor(p->'amaun'); d date; net numeric;
begin
  select coalesce(tempat_id, '') into tid from pelajar where id = pid;
  if not found then raise exception 'ID % tidak dijumpai.', pid; end if;
  if a is null or a <= 0 or a > 1000 then raise exception 'Amaun tidak sah.'; end if;
  d := _tarikh_lepas(p->>'tarikh', 'Tarikh bayar', 2025);
  perform _kunci_lejar();
  select coalesce(sum(amaun), 0) into net from rekod_bayaran where ref_id = pid and bulan = 'Yuran pendaftaran';
  if net > 0 then
    insert into rekod_bayaran (masa, ref_id, tempat_id, bulan, status, amaun, oleh, sumber)
    values (now(), pid, tid, 'Yuran pendaftaran', 'Pendaftaran dibatalkan', -net, _oleh(u), 'Pendaftaran (pembetulan)');
  end if;
  insert into rekod_bayaran (masa, ref_id, tempat_id, bulan, status, amaun, oleh, sumber)
  values (_tengah_hari(d), pid, tid, 'Yuran pendaftaran', 'Pendaftaran', a, _oleh(u), 'Pendaftaran');
  perform _log(u, 'Pelajar', pid, 'Yuran pendaftaran RM' || a || ' dibayar ' || to_char(d, 'DD/MM/YYYY')
    || case when net > 0 then ' (ganti rekod lama RM' || net || ')' else '' end);
  return jsonb_build_object('ok', true, 'id', pid, 'mesej', 'Yuran pendaftaran ' || pid || ' direkod');
end $$;

-- p = {id}
create or replace function batal_pendaftaran(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u akses_crm := _penulis(); pid text := p->>'id'; net numeric; tid text;
begin
  perform _kunci_lejar();
  select coalesce(sum(amaun), 0), max(tempat_id) into net, tid from rekod_bayaran where ref_id = pid and bulan = 'Yuran pendaftaran';
  if not (net > 0) then raise exception 'Tiada yuran pendaftaran direkod untuk %.', pid; end if;
  insert into rekod_bayaran (masa, ref_id, tempat_id, bulan, status, amaun, oleh, sumber)
  values (now(), pid, coalesce(tid, ''), 'Yuran pendaftaran', 'Pendaftaran dibatalkan', -net, _oleh(u), 'Pendaftaran (dibatalkan)');
  perform _log(u, 'Pelajar', pid, 'Yuran pendaftaran RM' || net || ' dibatalkan');
  return jsonb_build_object('ok', true, 'id', pid, 'mesej', 'Yuran pendaftaran dibatalkan');
end $$;

-- ---------------------------------------------------------------- hak akses
do $$
declare f text;
begin
  foreach f in array array['_penulis()','_oleh(akses_crm)','_log(akses_crm,text,text,text)','_yuran_tempat(text)']
  loop execute format('revoke all on function %s from public, anon, authenticated', f); end loop;
  foreach f in array array['kemaskini_yuran(jsonb)','tukar_tarikh_bayar(jsonb)','terima_tajaan(jsonb)',
    'batal_tajaan(jsonb)','bayar_pendaftaran(jsonb)','batal_pendaftaran(jsonb)']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
