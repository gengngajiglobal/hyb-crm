/* Diambil dari apps-laporan-guru/Index.html. Kod link dibaca dari URL ?k= */
(function () { var k = (new URLSearchParams(location.search).get('k') || '').replace(/[^a-f0-9]/gi, '').slice(0, 64); document.body.setAttribute('data-k', k); })();
(function () {
var K = document.body.getAttribute('data-k') || (window.PREVIEW_GURU ? 'demo0000000000000000000000000000' : '');
var D = null, SIAP = null, PEL = {};
var F = { guru: '', tempatId: '', tarikh: '', hadir: {}, topik: '', isu: '', bil: '' };
var HARI = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];
var app = document.getElementById('app');

function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function tk(s) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? new Date(+m[1], m[2] - 1, +m[3]) : null; }
function pad(n) { return (n < 10 ? '0' : '') + n; }
function fmt(s) { var d = tk(s); return d ? pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() : s; }
function tempat(id) { return D.tempat.filter(function (t) { return t.id === id; })[0]; }
function $(id) { return document.getElementById(id); }
function cap(s) { return String(s || '').toLowerCase().replace(/(^|\s|-)\S/g, function (c) { return c.toUpperCase(); }); }

function panggil(fn, args, ok, gagal) {
  if (window.HYB_RPC) { HYB_RPC(fn, args, ok, gagal); } else if (window.google && google.script && google.script.run) {
    var r = google.script.run.withSuccessHandler(function (s) { ok(JSON.parse(s)); }).withFailureHandler(function (e) { gagal((e && e.message) || String(e)); });
    r[fn].apply(r, args);
  } else {
    setTimeout(function () { try { ok(window.SIM_GURU[fn].apply(null, args)); } catch (e) { gagal(e.message); } }, 300);
  }
}
function mesej(tajuk, teks) {
  app.innerHTML = '<div class="pesan"><div class="card"><h2>' + esc(tajuk) + '</h2><p style="color:var(--ink-2);margin:0">' + esc(teks) + '</p></div></div>';
}

/* simpan apa yang dah ditaip sebelum render semula */
function simpanBorang() {
  if (!$('frm')) return;
  F.guru = $('f_guru').value; F.tarikh = $('f_tarikh').value; F.topik = $('f_topik').value; F.isu = $('f_isu').value;
  if ($('f_bil')) F.bil = $('f_bil').value;
}

function pilihTempat(id) {
  F.tempatId = id; F.hadir = {};
  var t = tempat(id);
  if (id && !PEL[id]) {
    PEL[id] = 'muat';
    panggil('muatPelajar', [K, id], function (list) { PEL[id] = list; if (F.tempatId === id) { semuaHadir(); render(); } },
      function (m) { PEL[id] = null; alert(m); });
  } else if (id) semuaHadir();
}
// Muat semula senarai pelajar (contoh: admin baru tambah pelajar). Tanda kehadiran lama dikekalkan; pelajar baru ditanda hadir.
function segarPelajar(id) {
  if (!id) return;
  var lama = F.hadir, adaLama = {};
  (PEL[id] && PEL[id].forEach ? PEL[id] : []).forEach(function (p) { adaLama[p.id] = 1; });
  PEL[id] = 'muat';
  panggil('muatPelajar', [K, id], function (list) {
    PEL[id] = list;
    if (F.tempatId !== id) return;
    simpanBorang(); F.hadir = {};
    var baru = list.filter(function (p) { return !adaLama[p.id]; });
    list.forEach(function (p) { if (!adaLama[p.id] || lama[p.id]) F.hadir[p.id] = 1; });
    render();
    if ($('ferr')) $('ferr').innerHTML = '<div class="err">Senarai pelajar dikemas kini' + (baru.length ? ': ' + esc(baru.map(function (p) { return p.nama; }).join(', ')) + ' baru ditambah (ditanda hadir)' : '') + '. Semak kehadiran, kemudian tekan Hantar laporan sekali lagi.</div>';
  }, function (m) { PEL[id] = null; alert(m); });
}
function semuaHadir() { var L = PEL[F.tempatId]; F.hadir = {}; if (L && L.forEach) L.forEach(function (p) { F.hadir[p.id] = 1; }); }
function padanGuru(nama) {
  var n = function (s) { return String(s || '').toLowerCase().replace(/^\s*(ust\.?|ustaz|ustazah|ustzh\.?|cikgu|cg\.?)\s+/, '').trim(); };
  return D.senaraiGuru.filter(function (g) { return n(g) && n(g) === n(nama); })[0] || '';
}

function render() {
  if (SIAP) return renderSiap();
  var h = '', tunggu = D.belum;
  h += '<div class="card"><div class="card-b hai">Assalamualaikum, <b>' + esc(D.guru.nama) + '</b>. Isi laporan selepas setiap kelas. Admin HYB akan terima terus.</div></div>';
  if (tunggu.length) {
    h += '<div class="card"><div class="card-h"><h2>Kelas anda belum dilaporkan</h2><span class="c">' + tunggu.length + '</span></div><div class="card-b"><div class="sesi">' +
      tunggu.slice(0, 5).map(function (s) {
        var t = tempat(s.tempatId) || {}, d = tk(s.tarikh), on = F.tempatId === s.tempatId && F.tarikh === s.tarikh;
        return '<button type="button" data-sesi="' + esc(s.tempatId + '|' + s.tarikh) + '"' + (on ? ' class="on"' : '') + '><div class="dbox"><b>' + d.getDate() + '</b><span>' + HARI[d.getDay()].slice(0, 3) + '</span></div>' +
          '<div class="t"><b>' + esc(t.nama || s.tempatId) + '</b><span>' + HARI[d.getDay()] + ', ' + fmt(s.tarikh) + '</span></div><span class="go">' + (on ? 'Dipilih' : 'Isi') + '</span></button>';
      }).join('') + '</div>' + (tunggu.length > 5 ? '<div class="help" style="margin-top:8px">+' + (tunggu.length - 5) + ' lagi kelas lama belum dilaporkan.</div>' : '') + '</div></div>';
  }
  var saya = D.tempat.filter(function (t) { return t.saya; }), lain = D.tempat.filter(function (t) { return !t.saya; });
  var opt = function (t) { return '<option value="' + esc(t.id) + '"' + (F.tempatId === t.id ? ' selected' : '') + '>' + esc(t.nama + (t.hariMasa ? ' (' + t.hariMasa + ')' : '')) + '</option>'; };
  var t0 = tempat(F.tempatId), ganti = t0 && F.guru && padanGuru(t0.guru) !== F.guru;

  h += '<form class="card" id="frm" novalidate><div class="card-h"><h2>Laporan kelas</h2></div><div class="card-b"><div id="ferr"></div>' +
    '<div class="fld"><label for="f_guru">1. Nama guru yang mengajar</label><select id="f_guru" required><option value="">Pilih nama guru</option>' +
    D.senaraiGuru.map(function (g) { return '<option' + (F.guru === g ? ' selected' : '') + '>' + esc(g) + '</option>'; }).join('') + '</select></div>' +
    '<div class="fld"><label for="f_tempat">2. Tempat kelas</label><select id="f_tempat" required><option value="">Pilih tempat</option>' +
    (saya.length ? '<optgroup label="Kelas saya">' + saya.map(opt).join('') + '</optgroup>' : '') +
    (lain.length ? '<optgroup label="Tempat lain (ganti guru)">' + lain.map(opt).join('') + '</optgroup>' : '') + '</select>' +
    (ganti ? '<div class="help tag">Ganti guru: kelas ini biasanya diajar oleh ' + esc(t0.guru || 'guru lain') + '.</div>' : '') + '</div>' +
    '<div class="fld"><label for="f_tarikh">3. Tarikh kelas</label><input type="date" id="f_tarikh" required max="' + esc(D.hariIni) + '" value="' + esc(F.tarikh || D.hariIni) + '"></div>' +
    '<div class="fld"><label>Kehadiran pelajar</label>' + blokHadir() + '</div>' +
    '<div class="fld"><label for="f_topik">4. Aktiviti / topik</label><textarea id="f_topik" required maxlength="500" placeholder="Contoh: Suloh m/s 12-14, bacaan surah Al-Fil, adab makan">' + esc(F.topik) + '</textarea>' +
    '<div class="chips">' + ['Suloh m/s ', 'Usolli: ', 'Adab: ', 'Ulangkaji'].map(function (c) { return '<button type="button" data-chip="' + esc(c) + '">+ ' + esc(c.replace(/[: ]+$/, '')) + '</button>'; }).join('') + '</div></div>' +
    '<div class="fld"><label for="f_isu">Isu atau perhatian <span style="font-weight:400;color:var(--mute)">(jika ada)</span></label><textarea id="f_isu" maxlength="500" placeholder="Contoh: Bilik digunakan program masjid">' + esc(F.isu) + '</textarea></div>' +
    '<button class="btn" type="submit" id="f_btn">Hantar laporan</button></div></form>';

  h += '<div class="card"><div class="card-h"><h2>Laporan terkini kelas anda</h2></div><div class="card-b">' + (D.laporan.length ? '<ul class="lap">' + D.laporan.slice(0, 5).map(function (l) {
    var t = tempat(l.tempatId) || {};
    return '<li><div class="h">' + esc(fmt(l.tarikh)) + ' · ' + esc(t.nama || l.tempatId) + '<span>' + esc(l.hadir) + ' hadir</span></div><div class="s">' + esc(l.topik) + (l.isu ? ' · Isu: ' + esc(l.isu) : '') + '</div></li>';
  }).join('') + '</ul>' : '<div class="empty">Belum ada laporan.</div>') + '</div></div>';
  h += '<div class="foot">Link ini peribadi untuk anda. Jangan kongsi dengan orang lain.</div>';
  app.innerHTML = h;
}

function blokHadir() {
  if (!F.tempatId) return '<div class="empty">Pilih tempat dahulu untuk lihat senarai pelajar.</div>';
  var L = PEL[F.tempatId];
  if (L === 'muat') return '<div class="empty"><span class="spin sm"></span> Memuatkan senarai pelajar...</div>';
  if (!L) return '<div class="empty">Senarai pelajar tak dapat dimuat.</div>';
  if (!L.length) return '<div class="help" style="margin:0 0 6px">Tiada pelajar aktif dalam rekod untuk tempat ini. Isi bilangan hadir.</div><input type="number" id="f_bil" inputmode="numeric" min="0" max="200" value="' + esc(F.bil) + '" placeholder="Bilangan hadir">';
  var n = L.filter(function (p) { return F.hadir[p.id]; }).length;
  return '<div class="hd-bar"><b id="hd_n">' + n + '/' + L.length + ' hadir</b><button type="button" data-semua="1">Semua hadir</button><button type="button" data-semua="0">Kosongkan</button></div>' +
    '<div class="help" style="margin:0 0 8px">Ketik nama pelajar yang <b>tidak hadir</b> untuk buang tanda.</div><div class="hd">' +
    L.map(function (p) { var on = !!F.hadir[p.id]; return '<label class="hp' + (on ? ' on' : '') + '"><input type="checkbox" data-hp="' + esc(p.id) + '"' + (on ? ' checked' : '') + '><span>' + esc(cap(p.nama)) + '</span><em>' + (on ? 'Hadir' : 'Tidak hadir') + '</em></label>'; }).join('') + '</div>';
}

function renderSiap() {
  app.innerHTML = '<div class="card ok"><div class="tick">✓</div><h2>Laporan diterima</h2><p>' + esc(SIAP) + '</p>' +
    (D.belum.length ? '<p style="margin-top:-8px;font-size:14px">Masih ada ' + D.belum.length + ' kelas anda belum dilaporkan.</p>' : '') +
    '<button class="btn" data-lagi>' + (D.belum.length ? 'Isi laporan seterusnya' : 'Isi laporan lain') + '</button></div>';
}

function mula(tid, tarikh) {
  F = { guru: padanGuru(D.guru.nama) || '', tempatId: '', tarikh: tarikh || '', hadir: {}, topik: '', isu: '', bil: '' };
  if (tid) pilihTempat(tid);
}

document.addEventListener('click', function (e) {
  var s = e.target.closest('[data-sesi]');
  if (s) {
    simpanBorang();
    var x = s.getAttribute('data-sesi').split('|');
    if (F.tempatId !== x[0]) pilihTempat(x[0]);
    F.tarikh = x[1]; render();
    $('frm').scrollIntoView({ behavior: 'smooth' });
    return;
  }
  var c = e.target.closest('[data-chip]');
  if (c) { var ta = $('f_topik'); ta.value = (ta.value ? ta.value.replace(/\s*$/, ', ') : '') + c.getAttribute('data-chip'); ta.focus(); return; }
  var sm = e.target.closest('[data-semua]');
  if (sm) { simpanBorang(); if (sm.getAttribute('data-semua') === '1') semuaHadir(); else F.hadir = {}; render(); $('hd_n').scrollIntoView({ block: 'center' }); return; }
  if (e.target.closest('[data-lagi]')) {
    SIAP = null;
    if (D.belum.length) mula(D.belum[0].tempatId, D.belum[0].tarikh); else mula(F.tempatId);
    render(); window.scrollTo(0, 0);
  }
});
document.addEventListener('change', function (e) {
  var el = e.target;
  if (el.id === 'f_tempat') { simpanBorang(); pilihTempat(el.value); render(); return; }
  if (el.id === 'f_guru') { F.guru = el.value; F.guruUbah = true; simpanBorang(); render(); return; }
  if (el.hasAttribute && el.hasAttribute('data-hp')) {
    var id = el.getAttribute('data-hp');
    if (el.checked) F.hadir[id] = 1; else delete F.hadir[id];
    var lb = el.closest('.hp'); lb.classList.toggle('on', el.checked); lb.querySelector('em').textContent = el.checked ? 'Hadir' : 'Tidak hadir';
    var L = PEL[F.tempatId]; $('hd_n').textContent = L.filter(function (p) { return F.hadir[p.id]; }).length + '/' + L.length + ' hadir';
  }
});
document.addEventListener('submit', function (e) {
  if (e.target.id !== 'frm') return;
  e.preventDefault();
  simpanBorang();
  var L = PEL[F.tempatId];
  var p = { guru: F.guru, tempatId: F.tempatId, tarikh: F.tarikh, topik: F.topik.trim(), isu: F.isu.trim(),
    hadirId: L && L.length ? L.filter(function (x) { return F.hadir[x.id]; }).map(function (x) { return x.id; }) : [], hadir: F.bil,
    lihatId: L && L.map ? L.map(function (x) { return x.id; }) : [] };
  var salah = !p.guru ? 'Pilih nama guru.' : !p.tempatId ? 'Pilih tempat.' : !p.tarikh ? 'Isi tarikh kelas.' : p.tarikh > D.hariIni ? 'Tarikh tidak boleh pada masa depan.' :
    (L === 'muat' || !L) ? 'Tunggu senarai pelajar dimuat.' :
    (!L.length && (p.hadir === '' || +p.hadir < 0 || +p.hadir > 200 || +p.hadir % 1)) ? 'Isi bilangan hadir (nombor 0 hingga 200).' : !p.topik ? 'Isi aktiviti / topik kelas.' : '';
  var err = $('ferr');
  if (salah) { err.innerHTML = '<div class="err">' + esc(salah) + '</div>'; err.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  var b = $('f_btn'); b.disabled = true; b.textContent = 'Menghantar...';
  panggil('hantarLaporan', [K, JSON.stringify(p)], function (res) { D = res.data; SIAP = res.mesej; PEL = {}; render(); window.scrollTo(0, 0); },
    function (m) {
      b.disabled = false; b.textContent = 'Hantar laporan'; err.innerHTML = '<div class="err">' + esc(m) + '</div>'; err.scrollIntoView({ block: 'center' });
      if (/Senarai pelajar dah berubah/.test(m)) segarPelajar(F.tempatId);
    });
});

if (window.PREVIEW_GURU) $('banner').textContent = window.PREVIEW_GURU.banner;
if (!K) { mesej('Link tidak lengkap', 'Buka link penuh yang dihantar oleh admin HYB. Kalau hilang, minta link baru.'); return; }
panggil('muatGuru', [K], function (d) {
  D = d;
  if (!D.tempat.length) { mesej('Tiada kelas', 'Belum ada tempat kelas dalam rekod. Hubungi admin HYB.'); return; }
  var mine = D.tempat.filter(function (t) { return t.saya; });
  if (D.belum.length) mula(D.belum[0].tempatId, D.belum[0].tarikh);
  else mula(mine.length === 1 ? mine[0].id : '');
  render();
}, function (m) { mesej('Tak dapat buka', m); });
})();
