/**
 * Carian Google untuk peta CRM HYB (versi Supabase).
 * Sama macam CRM lama: guna servis Maps Apps Script (percuma, tiada API key).
 *  - cari:   nama tempat / alamat -> senarai pin (maks 5, dalam Malaysia sahaja)
 *  - pautan: link pendek maps.app.goo.gl -> URL penuh Google Maps (CRM baca koordinat dari URL)
 *
 * Keselamatan: setiap permintaan mesti bawa token login Supabase pengguna. Token disemak dengan
 * Supabase, dan emel mesti aktif dalam akses_crm. Tanpa token sah, tiada carian dibuat.
 *
 * Pasang (sekali, dalam projek "Import CRM HYB ke Supabase"):
 *  1. Tambah fail baru (+ > Script), nama "PetaGoogle". Tampal fail ini. Simpan.
 *  2. Deploy > New deployment > ikon gear > Web app.
 *     Execute as: Me. Who has access: Anyone. Deploy, benarkan akses.
 *  3. Salin Web app URL (berakhir /exec) dan beri kepada Claude untuk dimasukkan dalam config.js.
 *  Guna SUPABASE_URL dan SUPABASE_SERVICE_KEY yang sudah ada dalam Script Properties.
 */

function doPost(e) {
  try {
    const b = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    semakTokenPeta_(String(b.token || ''));
    if (b.jenis === 'cari') return balasPeta_(cariGooglePeta_(b.q));
    if (b.jenis === 'pautan') return balasPeta_(bukaPautanPeta_(b.url));
    throw new Error('Permintaan tidak dikenali.');
  } catch (err) {
    return balasPeta_({ ok: false, ralat: err.message });
  }
}

function doGet() {
  return balasPeta_({ ok: true, nota: 'Carian Google CRM HYB. Guna dari dalam CRM.' });
}

function balasPeta_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/* Token Supabase -> emel -> mesti aktif dalam akses_crm. Keputusan disimpan 10 minit. */
function semakTokenPeta_(token) {
  if (!/^[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+$/.test(token)) throw new Error('Sila log masuk semula.');
  const cache = CacheService.getScriptCache();
  const kunci = 'tok_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token));
  if (cache.get(kunci) === 'ok') return;
  const props = PropertiesService.getScriptProperties();
  const url = String(props.getProperty('SUPABASE_URL') || '').replace(/\/+$/, '');
  const key = props.getProperty('SUPABASE_SERVICE_KEY');
  if (!url || !key) throw new Error('Carian Google belum disediakan (Script Properties).');
  const u = UrlFetchApp.fetch(url + '/auth/v1/user', {
    headers: { apikey: key, Authorization: 'Bearer ' + token }, muteHttpExceptions: true,
  });
  if (u.getResponseCode() !== 200) throw new Error('Sesi tamat. Sila log masuk semula.');
  const emel = String(JSON.parse(u.getContentText()).email || '').toLowerCase();
  if (!emel) throw new Error('Sila log masuk semula.');
  const a = UrlFetchApp.fetch(url + '/rest/v1/akses_crm?select=emel&aktif=eq.true&emel=eq.' + encodeURIComponent(emel), {
    headers: { apikey: key, Authorization: 'Bearer ' + key }, muteHttpExceptions: true,
  });
  if (a.getResponseCode() !== 200 || !JSON.parse(a.getContentText()).length) throw new Error('Tiada akses CRM.');
  cache.put(kunci, 'ok', 600);
}

function lokasiSahPeta_(lat, lng) {
  return typeof lat === 'number' && typeof lng === 'number' && lat > 0.5 && lat < 7.6 && lng > 99.5 && lng < 119.5;
}

function cariGooglePeta_(q) {
  q = String(q || '').trim().slice(0, 200);
  if (!q) return { ok: true, hasil: [] };
  const r = Maps.newGeocoder().setRegion('my').setLanguage('ms').geocode(q);
  const hasil = (r.results || []).slice(0, 5).map(function (x) {
    const loc = x.geometry && x.geometry.location;
    const comp = x.address_components || [];
    const ada = function (c, jenis) { return (c.types || []).some(function (t) { return jenis.indexOf(t) > -1; }); };
    const est = comp.filter(function (c) { return ada(c, ['establishment', 'point_of_interest', 'place_of_worship']); })[0];
    const kaw = comp.filter(function (c) { return ada(c, ['sublocality', 'sublocality_level_1', 'locality']); })[0];
    const alamat = String(x.formatted_address || '');
    const vp = x.geometry && x.geometry.viewport;
    return {
      nama: est ? est.long_name : alamat.split(',')[0],
      alamat: alamat, kawasan: kaw ? kaw.long_name : '',
      lat: loc ? loc.lat : null, lng: loc ? loc.lng : null,
      osm: 'Google ' + (x.place_id || ''),
      bbox: vp ? [vp.southwest.lat, vp.southwest.lng, vp.northeast.lat, vp.northeast.lng] : null,
    };
  }).filter(function (x) { return lokasiSahPeta_(x.lat, x.lng); });
  return { ok: true, hasil: hasil };
}

/* Link pendek Google Maps: ikut redirect untuk dapat URL penuh. */
function bukaPautanPeta_(url) {
  url = String(url || '').trim();
  if (!/^https:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)\//.test(url)) throw new Error('Bukan link pendek Google Maps.');
  for (let i = 0; i < 4; i++) {
    const res = UrlFetchApp.fetch(url, { followRedirects: false, muteHttpExceptions: true });
    const h = res.getHeaders(), loc = h.Location || h.location;
    if (!loc) break;
    url = String(loc);
    if (!/goo\.gl/.test(url)) break;
  }
  if (!/^https:\/\/(www\.)?google\.[a-z.]+\/maps|^https:\/\/maps\.google\./.test(url)) {
    throw new Error('Link tak dapat dibaca. Buka link dalam Google Maps dan salin URL penuh.');
  }
  return { ok: true, url: url };
}
