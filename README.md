# Instagram Non-Followers Finder 2.1.1

Userscript satu file dengan pencarian, filter, whitelist, hasil per akun, export CSV, dan unfollow terpilih.

## Atribusi dan kelanjutan proyek

Saya adalah original author script ini di [Greasy Fork](https://greasyfork.org/en/scripts/537246-instagram-non-followers-finder). Repository ini memakai akun GitHub baru karena akun lama kehilangan akses autentikasi dan tidak bisa digunakan untuk login lagi. Kode dipindahkan ke akun baru supaya pengembangan dan update tetap bisa dilanjutkan.

## Instalasi

Ganti seluruh isi script di Tampermonkey dengan `ig-finder.user.js`, simpan, nonaktifkan salinan versi lama, lalu reload Instagram. Header panel harus menampilkan **FINDER v2.1.1**. Mulai dengan batas 10 akun untuk memeriksa koneksi.

`ig-finder.js` adalah source; `ig-finder.user.js` salinan instalasi. `ig-finder.v1.3.0.backup.js` menyimpan versi asli. URL auto-update lama dilepas supaya build lokal tidak tertimpa versi remote.

## Perubahan scan

Query hash GraphQL lama sudah dilepas. Scan mengambil `users` dari `/api/v1/friendships/{account}/following/` dan melanjutkan pagination dengan `next_max_id` sebagai parameter `max_id`.

Jika daftar tidak menyertakan status follow-back boolean, script meminta `/api/v1/friendships/show/{id}/`. `followed_by` berarti akun itu mengikuti pengguna, sedangkan `following` berarti pengguna mengikuti akun itu. Status hilang tidak dianggap false: akun tersebut tidak masuk hasil unfollow dan scan ditandai parsial.

Halaman pertama kosong diverifikasi lewat `/api/v1/users/{account}/info/`. Hasil nol diterima hanya jika ID profil cocok dan `following_count` benar-benar nol. Jumlah positif, identitas tidak cocok, atau data tidak lengkap menghasilkan error tanpa menimpa hasil tersimpan sebelumnya. Halaman lanjutan kosong atau berulang juga ditolak sebagai scan lengkap.

Pemeriksaan per akun membutuhkan request tambahan. Jeda pengaturan berlaku sebelum pemeriksaan tersebut dan di antara halaman.

## Penggunaan

- Batas scan adalah jumlah following diperiksa, bukan jumlah hasil non-followers.
- Jeda/Lanjutkan/Stop tersedia untuk scan dan antrean unfollow. Stop membatalkan request scan langsung; request unfollow berjalan diselesaikan dahulu. Menutup panel tidak menghentikan proses.
- Whitelist menerima username dengan/tanpa @, dipisahkan koma, spasi, atau baris baru. Tidak ada whitelist tersembunyi.
- Pencarian berdasarkan username/nama, filter verifikasi, urutan A-Z/Z-A, dan 50 akun per halaman.
- Unfollow hanya untuk akun dipilih setelah konfirmasi. Pilihan yang tidak cocok filter dibersihkan. Hasil sukses dihapus dari daftar dan penyimpanan.
- CSV mencakup seluruh hasil sesuai filter, waktu scan, serta penanda parsial.
- Pengaturan dan hasil tersimpan per akun. Muat hasil tersimpan mendukung format lama; scan ulang untuk data terbaru.

## Transport dan diagnosis

GET memakai `GM_xmlhttpRequest` jika tersedia, terbatas ke www.instagram.com; pengelola script tanpa API itu memakai fetch. `@sandbox DOM` memungkinkan eksekusi di konteks ekstensi. Unfollow tetap memakai fetch sesi halaman tanpa pengulangan POST otomatis.

Timeout 25 detik melepaskan proses meskipun transport atau pembacaan body macet. HTTP error, rate limit, challenge, dan pergantian akun menghentikan proses.

Status terlihat di atas panel. Detail scan otomatis terbuka saat gagal, menampilkan tahap, transport, jumlah request, HTTP, dan ringkasan respons. Cookie, token, serta isi respons akun tidak dicetak. Awalan console: `[IG Finder v2.1.1]`.

## Referensi dan batasan

Referensi dicek 14 September 2026:

- [instagrapi user/friendships](https://github.com/subzeroid/instagrapi/blob/master/instagrapi/mixins/user.py): pola following REST, pagination, pemeriksaan hubungan, dan info profil.
- [Instagram Follower Checker](https://github.com/HenryLok0/Instagram_Follower_Checker): penggunaan daftar REST di domain web Instagram.
- [Tampermonkey request](https://www.tampermonkey.net/documentation.php?locale=en&q=GM_xmlhttpRequest) dan [sandbox](https://www.tampermonkey.net/documentation.php?locale=en&q=sandbox).

Endpoint tersebut bukan API publik stabil. Referensi implementasi lain tidak menjamin akses pada setiap akun/browser. Belum diuji langsung pada sesi Instagram pengguna. Jeda tidak menjamin bebas pembatasan. Hasil adalah snapshot akun diperiksa.

## Tes lokal

Jalankan `node --check ig-finder.js` dan `node check.cjs`. Tes memakai DOM dan respons simulasi tanpa dependency, request Instagram, atau unfollow nyata. Cakupan: limit, pagination REST, ID pk, arah hubungan, hasil kosong keliru, akun benar-benar kosong, status hilang, pause/stop, penyimpanan, pergantian akun, unfollow, request ekstensi, dan timeout macet.

Setelah mengedit source: `Copy-Item -LiteralPath ig-finder.js -Destination ig-finder.user.js`.
