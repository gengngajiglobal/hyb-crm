/* Diambil dari apps-pendaftaran/Index.html. ?t=HYB-Txx (pilih kelas), ?s=Sumber (jejak iklan) */
(function () { var q = new URLSearchParams(location.search); document.body.setAttribute('data-t', (q.get('t') || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 20)); document.body.setAttribute('data-s', (q.get('s') || '').replace(/[<>"'&]/g, '').slice(0, 40)); })();
(function () {
var Q = { t: document.body.getAttribute('data-t') || '', s: document.body.getAttribute('data-s') || '' };
if (window.PREVIEW_DAFTAR) { Q.t = Q.t || PREVIEW_DAFTAR.t || ''; Q.s = Q.s || PREVIEW_DAFTAR.s || ''; }
var D = null, HANTAR = false;
var F = { tempatId: '', anak: [{ nama: '', lahir: '', jantina: '', kesihatan: '' }], ibuBapa: '', tel: '', emel: '', kawasan: '', sumber: '', mesej: '', gambar: '', pdpa: false, cari: '' };
var app = document.getElementById('app');

function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function $(id) { return document.getElementById(id); }
function tk(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(+m[1], m[2] - 1, +m[3]) : null; }
function umur(s) {
  var l = tk(s), k = tk(D.hariIni); if (!l || !k) return null;
  var u = k.getFullYear() - l.getFullYear();
  if (k.getMonth() < l.getMonth() || (k.getMonth() === l.getMonth() && k.getDate() < l.getDate())) u--;
  return u;
}
function telOk(v) { var d = String(v || '').replace(/\D/g, ''); if (d.indexOf('60') === 0) d = d.slice(1); return /^01\d{8,9}$/.test(d); }
function tempat(id) { return D.tempat.filter(function (t) { return t.id === id; })[0]; }

function panggil(fn, args, ok, gagal) {
  if (window.HYB_RPC) { HYB_RPC(fn, args, ok, gagal); } else if (window.google && google.script && google.script.run) {
    var r = google.script.run.withSuccessHandler(function (s) { ok(JSON.parse(s)); }).withFailureHandler(function (e) { gagal((e && e.message) || String(e)); });
    r[fn].apply(r, args);
  } else if (window.SIM_DAFTAR) {
    setTimeout(function () { try { ok(window.SIM_DAFTAR[fn].apply(null, args)); } catch (e) { gagal(e.message); } }, 400);
  } else gagal('Tiada sambungan ke sistem.');
}

/* simpan apa yang dah ditaip sebelum render semula */
function baca() {
  if (!$('frm')) return;
  F.anak.forEach(function (a, i) {
    a.nama = $('a_nama_' + i).value; a.lahir = $('a_lahir_' + i).value; a.kesihatan = $('a_kes_' + i).value;
  });
  F.ibuBapa = $('f_ibu').value; F.tel = $('f_tel').value; F.emel = $('f_emel').value; F.kawasan = $('f_kawasan').value;
  F.sumber = $('f_sumber').value; F.mesej = $('f_mesej').value; F.pdpa = $('f_pdpa').checked;
  if ($('f_cari')) F.cari = $('f_cari').value;
}

function render(err, fokus) {
  var t = tempat(F.tempatId), h = '';
  h += '<div class="card intro"><b>Assalamualaikum ibu bapa.</b> Halaqah Ya Bunayya ialah kelas mengaji Al-Quran, solat dan adab untuk anak-anak <b>7 hingga 12 tahun</b> di masjid dan surau berhampiran. Isi borang ini untuk daftar, staf HYB akan hubungi tuan/puan melalui WhatsApp untuk pengesahan.' +
    '<ul><li>Ambil masa lebih kurang 3 minit.</li><li>Boleh daftar adik-beradik sekali gus.</li></ul></div>';

  h += '<form id="frm" novalidate autocomplete="on">';
  // 1. Kelas
  h += '<div class="card"><div class="card-h"><span class="n">1</span><h2>Pilih kelas</h2></div><div class="card-b">';
  if (!D.tempat.length) h += '<div class="err">Tiada kelas dibuka untuk pendaftaran buat masa ini. Sila hubungi HYB.</div>';
  else {
    if (D.tempat.length > 6) h += '<div class="cari"><input id="f_cari" type="search" placeholder="Cari kawasan atau nama masjid / surau" value="' + esc(F.cari) + '"></div>';
    var q = F.cari.toLowerCase().trim();
    var list = D.tempat.filter(function (x) { return !q || x.id === F.tempatId || (x.nama + ' ' + x.kawasan).toLowerCase().indexOf(q) > -1; });
    h += '<div class="tlist" id="tlist">' + list.map(function (x) {
      var on = x.id === F.tempatId;
      return '<label class="topt' + (on ? ' on' : '') + '"><input type="radio" name="tempat" value="' + esc(x.id) + '"' + (on ? ' checked' : '') + '>' +
        '<span class="t"><b>' + esc(x.nama) + '</b><span class="m">' + esc([x.kawasan, x.hariMasa].filter(String).join(' · ') || 'Hari & masa akan dimaklumkan') + '</span><br>' +
        (x.recruitment ? '<span class="tag b">Kelas baru, sedang terima pendaftaran</span>' : '<span class="tag g">Kelas sedang berjalan</span>') +
        (x.penuh ? '<span class="tag y">Penuh, masuk senarai menunggu</span>' : (x.hampir ? '<span class="tag y">Tempat terhad</span>' : '')) +
        '</span><span class="y">RM' + esc(x.yuran) + '<span class="m" style="font-weight:400">/bulan</span></span></label>';
    }).join('') + (list.length ? '' : '<div class="help">Tiada kelas sepadan dengan carian. Cuba nama kawasan lain.</div>') + '</div>';
  }
  h += '</div></div>';

  // 2. Anak
  h += '<div class="card"><div class="card-h"><span class="n">2</span><h2>Maklumat anak</h2></div><div class="card-b">';
  F.anak.forEach(function (a, i) {
    var u = umur(a.lahir);
    h += '<div class="anak">' + (F.anak.length > 1 ? '<div class="anak-h"><b>Anak ' + (i + 1) + '</b><button type="button" data-buang="' + i + '">Buang</button></div>' : '') +
      '<div class="fld"><label class="l" for="a_nama_' + i + '">Nama penuh anak <span class="req">*</span></label><input id="a_nama_' + i + '" value="' + esc(a.nama) + '" autocomplete="off" placeholder="Seperti dalam MyKid / sijil lahir"></div>' +
      '<div class="fld"><label class="l" for="a_lahir_' + i + '">Tarikh lahir <span class="req">*</span></label><input id="a_lahir_' + i + '" type="date" value="' + esc(a.lahir) + '" max="' + esc(D.hariIni) + '" data-lahir="' + i + '">' +
      '<div class="help' + (u != null && (u < 7 || u > 12) ? ' w' : '') + '" id="a_umur_' + i + '">' + (u == null ? '' : 'Umur ' + u + ' tahun' + (u < 7 || u > 12 ? '. Kelas HYB untuk 7-12 tahun, staf akan semak dahulu.' : '')) + '</div></div>' +
      '<div class="fld"><label class="l">Jantina <span class="req">*</span></label><div class="seg">' +
      ['Lelaki', 'Perempuan'].map(function (j) { return '<label class="' + (a.jantina === j ? 'on' : '') + '"><input type="radio" name="jantina_' + i + '" value="' + j + '" data-jantina="' + i + '"' + (a.jantina === j ? ' checked' : '') + '>' + j + '</label>'; }).join('') + '</div></div>' +
      '<div class="fld"><label class="l" for="a_kes_' + i + '">Masalah kesihatan, alahan atau keperluan khas (jika ada)</label><input id="a_kes_' + i + '" value="' + esc(a.kesihatan) + '" autocomplete="off" placeholder="Contoh: asma, alahan kacang. Kosongkan jika tiada."><div class="help">Untuk keselamatan anak semasa kelas sahaja.</div></div></div>';
  });
  if (F.anak.length < D.maksAnak) h += '<button type="button" class="tambah" data-tambah>+ Tambah adik-beradik</button>';
  h += '</div></div>';

  // 3. Ibu bapa
  h += '<div class="card"><div class="card-h"><span class="n">3</span><h2>Maklumat ibu / bapa / penjaga</h2></div><div class="card-b">' +
    '<div class="fld"><label class="l" for="f_ibu">Nama ibu / bapa / penjaga <span class="req">*</span></label><input id="f_ibu" value="' + esc(F.ibuBapa) + '" autocomplete="name"></div>' +
    '<div class="row2"><div class="fld"><label class="l" for="f_tel">No. telefon (WhatsApp) <span class="req">*</span></label><input id="f_tel" type="tel" inputmode="tel" value="' + esc(F.tel) + '" placeholder="012-345 6789" autocomplete="tel"></div>' +
    '<div class="fld"><label class="l" for="f_emel">Emel</label><input id="f_emel" type="email" value="' + esc(F.emel) + '" placeholder="Pilihan" autocomplete="email"></div></div>' +
    '<div class="fld"><label class="l" for="f_kawasan">Kawasan tempat tinggal <span class="req">*</span></label><input id="f_kawasan" value="' + esc(F.kawasan) + '" placeholder="Contoh: Taman Melati, Kajang" autocomplete="address-level2"></div>' +
    '</div></div>';

  // 4. Lain-lain
  var sumberOpt = (D.sumber || []).slice();
  if (F.sumber && sumberOpt.indexOf(F.sumber) < 0) sumberOpt.push(F.sumber);
  h += '<div class="card"><div class="card-h"><span class="n">4</span><h2>Sikit lagi</h2></div><div class="card-b">' +
    '<div class="fld"><label class="l" for="f_sumber">Dari mana tuan/puan tahu tentang HYB?</label><select id="f_sumber"><option value="">Pilih...</option>' +
    sumberOpt.map(function (s) { return '<option' + (s === F.sumber ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select></div>' +
    '<div class="fld"><label class="l">Benarkan gambar anak (tanpa nama) dikongsi di media sosial HYB? <span class="req">*</span></label><div class="seg">' +
    ['Ya', 'Tidak'].map(function (g) { return '<label class="' + (F.gambar === g ? 'on' : '') + '"><input type="radio" name="gambar" value="' + g + '" data-gambar' + (F.gambar === g ? ' checked' : '') + '>' + (g === 'Ya' ? 'Ya, benarkan' : 'Tidak') + '</label>'; }).join('') + '</div></div>' +
    '<div class="fld"><label class="l" for="f_mesej">Soalan atau mesej untuk kami</label><textarea id="f_mesej" placeholder="Pilihan">' + esc(F.mesej) + '</textarea></div>' +
    '<input class="hp" id="f_web" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">' +
    '</div></div>';

  // 5. Yuran + PDPA + hantar
  var n = F.anak.length, yb = t ? t.yuran : null;
  h += '<div class="card"><div class="card-h"><span class="n">5</span><h2>Yuran dan persetujuan</h2></div><div class="card-b">' +
    '<div class="yuran"><div><span>Yuran pendaftaran<small>Sekali bayar, setiap anak</small></span><b>RM' + D.yuranDaftar + (n > 1 ? ' × ' + n : '') + '</b></div>' +
    '<div><span>Yuran bulanan<small>' + (t ? esc(t.nama) : 'Ikut kelas yang dipilih') + '</small></span><b>' + (yb ? 'RM' + yb + (n > 1 ? ' × ' + n : '') + '/bulan' : '–') + '</b></div>' +
    '<div class="j"><span>Bayaran pertama (anggaran)<small>Cara bayaran akan dimaklumkan oleh staf HYB. Tiada bayaran di borang ini.</small></span><b>' + (yb ? 'RM' + (D.yuranDaftar + yb) * n : 'RM' + D.yuranDaftar * n + ' + yuran bulan') + '</b></div></div>' +
    '<div class="pdpa" tabindex="0"><h3>Notis Perlindungan Data Peribadi</h3>' +
    '<p>Maklumat dalam borang ini dikumpul oleh Geng Ngaji Global (Halaqah Ya Bunayya) untuk:</p>' +
    '<ul><li>memproses pendaftaran dan menguruskan kelas anak tuan/puan;</li><li>menghubungi tuan/puan tentang jadual kelas, kehadiran, perkembangan anak dan yuran;</li><li>menjaga keselamatan anak semasa kelas (maklumat kesihatan).</li></ul>' +
    '<p>Maklumat hanya boleh dilihat oleh staf HYB yang menguruskan pendaftaran dan yuran. Guru kelas hanya melihat nama anak untuk rekod kehadiran. Kami tidak menjual atau berkongsi maklumat ini dengan pihak luar untuk tujuan pemasaran.</p>' +
    '<p>Tuan/puan boleh meminta untuk melihat, membetulkan atau memadam maklumat ini, atau menarik balik persetujuan, dengan menghubungi staf HYB. Maklumat disimpan selagi anak berdaftar dengan HYB dan dipadam apabila tidak lagi diperlukan.</p></div>' +
    '<label class="chk"><input type="checkbox" id="f_pdpa"' + (F.pdpa ? ' checked' : '') + '><span>Saya ibu / bapa / penjaga sah kepada anak di atas. Saya telah membaca notis di atas dan <b>bersetuju</b> maklumat ini (termasuk maklumat kesihatan) digunakan untuk tujuan yang dinyatakan. <span class="req">*</span></span></label>' +
    '</div></div>';

  h += '<div>' + (err ? '<div class="err" id="ferr">' + esc(err) + '</div>' : '') +
    '<button type="submit" class="btn" id="fsub"' + (HANTAR ? ' disabled' : '') + '>' + (HANTAR ? 'Menghantar...' : 'Hantar pendaftaran') + '</button></div></form>';
  h += '<div class="foot">Halaqah Ya Bunayya · Geng Ngaji Global</div>';
  app.innerHTML = h;
  if (err && $('ferr')) $('ferr').scrollIntoView({ block: 'center', behavior: 'smooth' });
  if (fokus && $(fokus)) { var el = $(fokus); el.focus(); if (el.setSelectionRange && el.type === 'search') el.setSelectionRange(el.value.length, el.value.length); }
}

function semak() {
  var bad = [], msg = '';
  var tanda = function (id, m) { bad.push(id); if (!msg) msg = m; };
  if (!F.tempatId) { msg = 'Sila pilih kelas.'; }
  F.anak.forEach(function (a, i) {
    var lbl = F.anak.length > 1 ? ' (anak ' + (i + 1) + ')' : '';
    if (a.nama.trim().length < 3) tanda('a_nama_' + i, 'Nama anak' + lbl + ' wajib diisi.');
    var u = umur(a.lahir);
    if (u == null) tanda('a_lahir_' + i, 'Tarikh lahir' + lbl + ' wajib diisi.');
    else if (u < 4 || u > 15) tanda('a_lahir_' + i, 'Tarikh lahir' + lbl + ' tidak sah (umur ' + u + ' tahun).');
    if (!a.jantina && !msg) msg = 'Jantina' + lbl + ' wajib dipilih.';
  });
  if (F.ibuBapa.trim().length < 3) tanda('f_ibu', 'Nama ibu / bapa wajib diisi.');
  if (!telOk(F.tel)) tanda('f_tel', 'No. telefon tidak sah. Contoh: 012-345 6789.');
  if (F.emel.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(F.emel.trim())) tanda('f_emel', 'Emel tidak sah.');
  if (!F.kawasan.trim()) tanda('f_kawasan', 'Kawasan tempat tinggal wajib diisi.');
  if (!F.gambar && !msg) msg = 'Sila pilih kebenaran gambar.';
  if (!F.pdpa && !msg) msg = 'Sila tandakan persetujuan notis perlindungan data peribadi.';
  return { bad: bad, msg: msg };
}

function hantar() {
  baca();
  var s = semak();
  if (s.msg) {
    render(s.msg);
    s.bad.forEach(function (id) { if ($(id)) $(id).classList.add('bad'); });
    return;
  }
  HANTAR = true; render();
  var payload = {
    tempatId: F.tempatId, ibuBapa: F.ibuBapa, tel: F.tel, emel: F.emel, kawasan: F.kawasan, sumber: F.sumber, mesej: F.mesej,
    gambar: F.gambar, pdpa: F.pdpa, website: $('f_web') ? $('f_web').value : '',
    anak: F.anak.map(function (a) { return { nama: a.nama, lahir: a.lahir, jantina: a.jantina, kesihatan: a.kesihatan }; })
  };
  panggil('hantarPendaftaran', [JSON.stringify(payload)], function (r) { HANTAR = false; berjaya(r); },
    function (m) { HANTAR = false; render(m); });
}

function berjaya(r) {
  var n = r.anak.length, t = r.tempat;
  var wa = r.waAdmin ? 'https://wa.me/' + r.waAdmin + '?text=' + encodeURIComponent('Assalamualaikum, saya baru daftar ' + r.anak.join(', ') + ' di kelas HYB ' + t.nama + ' (rujukan ' + r.rujukan.join(', ') + ').') : '';
  app.innerHTML = '<div class="card ok"><div class="tick">✓</div><h2>Pendaftaran diterima</h2>' +
    '<p>Terima kasih. Pendaftaran <b>' + esc(r.anak.join(', ')) + '</b> untuk kelas <b>' + esc(t.nama) + '</b> dah kami terima.</p>' +
    '<div>' + r.rujukan.map(function (x) { return '<span class="ref">' + esc(x) + '</span>'; }).join('') + '</div>' +
    '<ol class="langkah"><li>Staf HYB akan semak dan hubungi tuan/puan melalui WhatsApp untuk sahkan tempat dan tarikh mula.</li>' +
    '<li>Bayaran: yuran pendaftaran RM' + r.yuranDaftar + ' seorang dan yuran bulanan RM' + esc(t.yuran) + ' seorang. Cara bayaran dimaklumkan semasa pengesahan.</li>' +
    '<li>' + (t.recruitment ? 'Kelas ini sedang mengumpul pelajar. Kami akan maklumkan tarikh kelas pertama.' : 'Hadir ke kelas pertama ' + (t.hariMasa ? '(' + esc(t.hariMasa) + ')' : '') + ' selepas pengesahan.') + '</li></ol>' +
    (wa ? '<a class="btn wa" href="' + esc(wa) + '" target="_blank" rel="noopener">WhatsApp staf HYB</a><div style="height:10px"></div>' : '') +
    '<button class="btn sec" data-lagi>Daftar anak lain</button></div>';
  window.scrollTo(0, 0);
}

/* ---------- events ---------- */
app.addEventListener('change', function (e) {
  var el = e.target;
  if (el.name === 'tempat') { baca(); F.tempatId = el.value; render(); return; }
  if (el.hasAttribute('data-jantina')) { baca(); F.anak[+el.getAttribute('data-jantina')].jantina = el.value; render(); return; }
  if (el.hasAttribute('data-gambar')) { baca(); F.gambar = el.value; render(); return; }
  if (el.hasAttribute('data-lahir')) {
    var i = +el.getAttribute('data-lahir'), u = umur(el.value), h = $('a_umur_' + i);
    F.anak[i].lahir = el.value;
    h.className = 'help' + (u != null && (u < 7 || u > 12) ? ' w' : '');
    h.textContent = u == null ? '' : 'Umur ' + u + ' tahun' + (u < 7 || u > 12 ? '. Kelas HYB untuk 7-12 tahun, staf akan semak dahulu.' : '');
    if (F.tempatId) { baca(); }
  }
  if (el.id === 'f_pdpa') F.pdpa = el.checked;
});
app.addEventListener('input', function (e) {
  if (e.target.classList.contains('bad')) e.target.classList.remove('bad');
  if (e.target.id === 'f_cari') { baca(); render('', 'f_cari'); }
});
app.addEventListener('click', function (e) {
  var b = e.target.closest('[data-tambah],[data-buang],[data-lagi]');
  if (!b) return;
  if (b.hasAttribute('data-lagi')) {
    F.anak = [{ nama: '', lahir: '', jantina: '', kesihatan: '' }]; F.pdpa = false; F.mesej = '';
    render(); window.scrollTo(0, 0); return;
  }
  baca();
  if (b.hasAttribute('data-tambah')) { F.anak.push({ nama: '', lahir: '', jantina: '', kesihatan: '' }); render('', 'a_nama_' + (F.anak.length - 1)); }
  else { F.anak.splice(+b.getAttribute('data-buang'), 1); render(); }
});
app.addEventListener('submit', function (e) { e.preventDefault(); if (!HANTAR) hantar(); });

panggil('muatBorang', [], function (d) {
  D = d;
  if (Q.t && tempat(Q.t)) F.tempatId = Q.t;
  if (Q.s) F.sumber = Q.s;
  if (window.PREVIEW_DAFTAR && PREVIEW_DAFTAR.banner) $('banner').textContent = PREVIEW_DAFTAR.banner;
  render();
}, function (m) {
  app.innerHTML = '<div class="card ok"><h2>Borang tidak dapat dibuka</h2><p>' + esc(m) + '</p><p>Cuba lagi sebentar, atau hubungi staf HYB.</p></div>';
});
})();
