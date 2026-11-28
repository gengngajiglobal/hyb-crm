/**
 * Versi "alih" untuk Laporan Kelas HYB lama (cutover ke Supabase).
 * Pasang: dalam Code.gs projek lama, tukar nama "function doGet(" kepada "function doGetLama(".
 * Tambah fail baru Alih.gs, tampal fail ini, simpan. Deploy > Manage deployments > Edit (pensel)
 * > Version: New version > Deploy. URL lama kekal, terus buka alamat baru.
 * Rollback: Manage deployments > Edit > pilih versi sebelum ini.
 */
function doGet(e) {
  var p = (e && e.parameter) || {};
  var url = 'https://gengngajiglobal.github.io/hyb-crm/guru.html';
  var k = String(p.k || '').replace(/[^a-f0-9]/gi, '').slice(0, 64);
  if (k) url += '?k=' + k;
  return HtmlService.createHtmlOutput(htmlAlih_(url, 'Laporan Kelas HYB'))
    .setTitle('Laporan Kelas HYB')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function htmlAlih_(url, tajuk) {
  var u = String(url).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return '<div style="font-family:Nunito,Arial,sans-serif;max-width:460px;margin:12vh auto;padding:28px 22px;' +
    'text-align:center;border:1px solid #e3e8f2;border-radius:16px;color:#1F377A">' +
    '<h2 style="margin:0 0 10px">' + tajuk + '</h2>' +
    '<p style="color:#4a5675;line-height:1.5">Sistem HYB dah berpindah ke alamat baru yang lebih laju. Tekan butang di bawah untuk teruskan.</p>' +
    '<a id="pergi" href="' + u + '" target="_top" style="display:inline-block;margin-top:12px;padding:14px 26px;' +
    'background:#2F6FC4;color:#fff;border-radius:999px;text-decoration:none;font-weight:700;font-size:17px">Teruskan</a>' +
    '<p style="margin-top:18px;font-size:13px;color:#7a849c">Simpan link baru ini untuk kali seterusnya.</p></div>' +
    '<script>try{window.top.location.replace(' + JSON.stringify(String(url)) + ');}catch(e){}</script>';
}
