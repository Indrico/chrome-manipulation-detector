# Dataset pilot Manipulation Detector

Dataset ini mencakup Ad Hominem, Dilema Palsu, dan Tekanan Rasa Bersalah. `synthetic.jsonl` berisi 800 contoh orisinal yang disusun dengan bantuan AI. Ada 80 keluarga contoh, masing-masing dengan 10 variasi topik. Keluarga dan topik sintetis dipisahkan antarbagiannya. Variasi dalam satu keluarga berkorelasi, sehingga jumlah baris tidak sama dengan jumlah kasus independen. Set ini terpisah dari 160 contoh regresi ekstensi.

| Bagian     | Sintetis tersedia | Target tulisan manusia | Target total |
| ---------- | ----------------: | ---------------------: | -----------: |
| Train      |               540 |                    660 |        1.200 |
| Validation |               120 |                    180 |          300 |
| Holdout    |               140 |                    360 |          500 |
| **Total**  |           **800** |              **1.200** |    **2.000** |

## Sumber teks dan atribusi

- Simpan kontribusi sukarela dalam `local/contribution.jsonl`. Catat izin untuk pelatihan dan evaluasi serta izin publikasi secara terpisah. Gunakan kode rujukan anonim, dan simpan bukti izin di tempat terpisah dengan akses terbatas.
- Simpan korpus tulisan manusia berlisensi dalam `local/licensed.jsonl` setelah diperiksa dan diberi label. Catat penerbit, nama dataset, lisensi, URL sumber, revisi, dan rujukan anonim untuk tiap contoh. Periksa lisensi di sumber asal, termasuk syarat pelatihan, adaptasi, dan distribusi. Lisensi MIT kode proyek berlaku pada kode proyek.
- Kumpulkan teks di luar ekstensi. Hapus nama pribadi, kontak, nomor akun, tautan, lokasi persis, dan rincian lain yang mengidentifikasi orang, termasuk dalam kutipan dan alasan. Tinjau penghapusan itu sebelum merekam offset. Validator membantu menemukan pola URL, alamat email, dan nama akun yang jelas.
- Masukkan 200 contoh holdout manusia dengan `sampling: "unselected"` dari arus contoh yang relevan dengan penggunaan ekstensi. Ambil contoh sebelum menyaring menurut label, kata kunci, atau kecocokan aturan. Sisa 160 contoh holdout manusia memakai `"targeted"` untuk mengisi cakupan label dan kasus sulit. Data di luar domain seperti percakapan chatbot hanya cocok sebagai contoh `targeted` jika relevan.

Folder `local/` diabaikan Git dan berada di luar sumber paket Chrome. Simpan semua varian dari satu percakapan, parafrasa dekat, atau sumber berulang yang bisa membocorkan jawaban dengan `groupId` yang sama. Gunakan satu bagian per grup. Tetapkan holdout sebelum model dilatih dan gunakan validasi untuk memilih model dan ambangnya.

Seleksi awal memasukkan tiga contoh negatif train dari OpenAssistant Conversations (OASST1) versi `fdf72ae0827c1cda404aff25b6603abec9e3399b`, berlisensi Apache-2.0. Setiap baris mencatat rujukan sumber dan alasan label yang ditambahkan dalam pilot. Salinan lisensi sumber disimpan di `local/openassistant-oasst1.LICENSE`. Percakapan dengan asisten ini memberi contoh pembanding untuk pelatihan. Estimasi kesalahan pada unggahan media sosial memerlukan contoh holdout dari domain tersebut. [OpenAssistant Conversations](https://huggingface.co/datasets/OpenAssistant/oasst1)

### Arsip diskusi Wikipedia bahasa Indonesia

`local/wiki-candidates.jsonl` menyimpan kandidat dari arsip Warung Kopi dan halaman pembicaraan artikel. Setiap baris mencatat kategori arsip, URL revisi yang mengarah ke riwayat kontribusi, dan atribusi Kontributor Wikipedia bahasa Indonesia. Ekstraksi mengambil satu komentar, menghapus tanda tangan dan tautan, menyamarkan akun yang tertaut, serta merapikan spasi. Beberapa data berlabel menyertakan petikan balasan yang relevan dari revisi yang sama. Pertahankan atribusi dan syarat lisensi CC BY-SA 4.0 saat mendistribusikan kutipan atau adaptasinya. [Ketentuan Penggunaan Wikimedia](https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use) · [Lisensi CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)

Kandidat adalah antrean pelabelan. Sebelum memilih satu kandidat, periksa kembali nama pribadi, rujukan akun, teks yang terpotong, dan konteks sumber. Simpan hasil penilaian di `local/licensed.jsonl` dengan ID dan grup dari kandidat, tanpa bidang `archiveCategory`. Tambahkan `split`, `sampling`, `labels`, dan `rationale` setelah menilai ketiga pola. ID yang sudah ada di `licensed.jsonl` menandai kandidat yang selesai diberi label awal. Validator menghitung baris lengkap di `licensed.jsonl`.

Label awal Wikipedia dibuat dengan bantuan AI berdasarkan isi tiap teks. Sebanyak 657 contoh masuk train dan 180 masuk validation, dengan halaman diskusi dipisahkan lewat `groupId`. Data ini terutama memberi contoh pembanding, kasus ambigu, dan konteks yang belum cukup. Topik dan gaya diskusi penyuntingan berbeda dari unggahan X.

### Komentar berita dan forum Indonesia

Holdout lokal berisi 360 komentar dari korpus _Indonesian Online News Comment: Abusive Text Identification_ versi 1.0, terbitan Ade Romadhony melalui Telkom University Dataverse dengan dedikasi CC0 1.0. Komentar asal membahas berita terpilih pada 2019 dari Kompas, Kaskus, dan Detik. Rujukan tiap baris merujuk pada urutan rekaman di berkas CSV penerbit. Teks dirapikan dan identitas yang ditemukan disamarkan. Seluruh korpus disimpan dalam satu grup dan hanya digunakan untuk holdout. [Korpus Telkom University Dataverse](https://doi.org/10.34820/FK2/DQEVRR)

Sebanyak 200 komentar diambil secara acak dari rekaman yang memenuhi syarat panjang, privasi, dan duplikasi sebelum pelabelan pola retorika. `sampling: "unselected"` mengacu pada pengambilan sampel di dalam korpus ini. Sisa 160 komentar dipilih untuk kasus yang mirip pola dan diperiksa satu per satu. Label pelecehan dari penerbit tidak digunakan sebagai label pola retorika. Beberapa topik mendominasi korpus, jadi hasilnya mengukur performa pada korpus komentar berita tersebut. Pengukuran performa di X membutuhkan data uji dari domain X.

### Status dataset lokal

Seluruh 2.000 baris tersedia, termasuk 800 contoh sintetis dan 1.200 tulisan manusia berlisensi. `local/review-queue.jsonl` mencatat penempatan 1.102 contoh tambahan, dan `local/licensed.jsonl` menyimpan label awal yang disusun dengan bantuan AI. Periksa status dengan `npm run dataset:pilot`. Eksperimen model lokal bisa dilatih dan diukur dengan label awal. Pemeriksaan ketat untuk holdout yang ditinjau tersedia secara terpisah.

## Panduan pelabelan

| Pola                  | Tandai saat                                                                  | Contoh pembanding                                                                                |
| --------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Ad Hominem            | Serangan terhadap orang dipakai untuk menyingkirkan argumennya.              | Hinaan tanpa hubungan dengan argumen, kritik metode, atau hinaan diri sendiri.                   |
| Dilema Palsu          | Pilihan yang masuk akal disingkirkan dan posisi dipersempit menjadi dua.     | Voting dengan dua opsi yang memang tersedia, atau keputusan sementara dengan alternatif terbuka. |
| Tekanan Rasa Bersalah | Rasa malu, utang budi, atau kewajiban moral dipakai untuk menekan keputusan. | Permintaan bantuan yang memberi ruang menolak, atau ungkapan kecewa tanpa tuntutan.              |

Nilai ketiga pola pada setiap contoh. Pilih `present` jika hubungan dalam teks memenuhi definisi. Gunakan `ambiguous` bila teks yang tersedia mendukung lebih dari satu tafsir yang masuk akal, dan `insufficient_context` bila bagian percakapan yang diperlukan hilang. Kosongkan label kategori yang sudah ditinjau dan tidak muncul. Tinjau kutipan, penanda sarkasme, dan contoh edukasi sesuai fungsi kalimat bagi penulis.

Satu kalimat bisa memenuhi lebih dari satu pola. Jika teks memaksa pilihan dan mengaitkan penolakan dengan tuduhan seperti tidak peduli atau ingin merusak kerja sama, periksa Dilema Palsu dan Tekanan Rasa Bersalah masing-masing. Tandai keduanya saat pilihan lain disingkirkan dan tuduhan itu dipakai untuk menekan persetujuan. Untuk keluhan yang hanya menyatakan kecewa, cari hubungan antara keluhan itu dan tindakan yang diminta sebelum memberi label `present` pada Tekanan Rasa Bersalah.

Untuk `present`, tandai kutipan teks utama yang menunjukkan pola. Simpan offset UTF-16 dengan awal inklusif dan akhir eksklusif. Konteks yang tersedia masuk ke `input.context` dengan sumber `quoted_post` atau `reply_target`. Kutipan bukti tetap di `input.text`. Tulis alasan yang menjelaskan hubungan yang dinilai.

## Peninjauan independen

Jalankan paket kalibrasi terlebih dahulu. Kedua peninjau menilai 30 contoh validasi secara terpisah, lalu mendiskusikan perbedaan cara menilai. Hasil kalibrasi tidak menambah jumlah tinjauan holdout.

```sh
npm run dataset:review -- prepare calibration
npm run dataset:review -- compare calibration reviewer-a reviewer-b
```

Setiap perintah `prepare` membuat folder di `local/review/` dengan `packet.jsonl`, `worksheet.jsonl`, dan `key.jsonl`. Berikan kedua berkas pertama kepada tiap peninjau. Koordinator menyimpan kunci dan label awal. Paket mencantumkan teks, konteks yang tersedia, dan ID acak. Gunakan salinan lembar kerja untuk setiap peninjau dan simpan hasilnya dengan kode anonim yang berbeda, misalnya `reviewer-a.jsonl` dan `reviewer-b.jsonl`. Kedua orang menyelesaikan lembar kerja sebelum membandingkan jawaban.

Isi ketiga keputusan dan alasan di setiap baris. Pakai `absent` jika pola tidak tampak. Untuk `present`, salin kutipan yang muncul persis satu kali di teks utama ke `quotes`. Perintah perbandingan menghitung offset UTF-16 dari kutipan tersebut.

```json
{
  "reviewId": "review-example",
  "judgments": {
    "ad-hominem": "present",
    "false-dilemma": "absent",
    "guilt-tripping": "absent"
  },
  "quotes": { "ad-hominem": "Abaikan usulnya. Dia bodoh." },
  "rationale": "Hinaan dipakai untuk menyingkirkan usul."
}
```

Setelah kalibrasi, kedua orang menilai 140 contoh sintetis dan 200 komentar yang dipilih acak.

```sh
npm run dataset:review -- prepare fixed
npm run dataset:review -- compare fixed reviewer-a reviewer-b
npm run dataset:review -- finalize fixed reviewer-a reviewer-b
```

`compare` menampilkan ID yang berbeda label atau kutipan. Bahas setiap perbedaan setelah kedua penilaian diterima. Simpan keputusan bersama untuk ID tersebut dalam `resolutions.jsonl` dengan format lembar kerja. Gunakan `ambiguous` atau `insufficient_context` sesuai bukti. `finalize` memerlukan hasil lengkap dari keduanya serta keputusan bersama untuk setiap perbedaan. Perintah menyimpan label akhir dan kode peninjau di `accepted.jsonl` dalam folder paket. Sidik jari input mengikat hasil tinjauan ke teks dan konteks yang dinilai.

Hitung selisih dari 80 dengan kolom `reviewedHoldoutPositivesByCategory` setelah 340 contoh tetap selesai. Pertahankan semua contoh tetap. Dari 160 contoh terarah yang tersedia, pertahankan kandidat yang relevan dan ganti slot yang kurang membantu dengan kandidat berlisensi atau kontribusi sukarela. Pertahankan kuota 160, kelompokkan percakapan dan parafrasa dekat, dan simpan atribusi atau izin. Jika kandidat yang memadai belum tersedia, tunggu sumber tambahan sebelum mengunci set uji. Setelah kandidat dipilih, kedua peninjau menilai paket terarah dengan alur yang sama.

```sh
npm run dataset:review -- prepare targeted
npm run dataset:review -- compare targeted reviewer-a reviewer-b
npm run dataset:review -- finalize targeted reviewer-a reviewer-b
npm run dataset:pilot -- --require-complete
```

Paket yang sudah dibuat dipertahankan saat perintah dijalankan ulang. Jika set terarah perlu diubah setelah peninjauan, arsipkan seluruh folder paket terarah di luar `local/review/targeted/` sebelum menyiapkan paket baru. Pakai label akhir dari `accepted.jsonl` untuk evaluasi.

## Format dan validasi

Simpan satu objek UTF-8 per baris JSONL. Contoh ini memakai label positif tunggal. Beberapa kategori dapat hadir dalam objek `labels` yang sama.

```json
{
  "id": "contoh-001",
  "source": "synthetic",
  "groupId": "keluarga-001",
  "split": "train",
  "language": "id",
  "sampling": "targeted",
  "input": { "text": "Abaikan usulnya. Dia bodoh." },
  "labels": {
    "ad-hominem": {
      "judgment": "present",
      "evidence": {
        "start": 0,
        "end": 27,
        "text": "Abaikan usulnya. Dia bodoh."
      }
    }
  },
  "rationale": "Hinaan dipakai untuk menyingkirkan usul."
}
```

Kontribusi menambahkan objek `permission` berisi `reference`, `directSubmission: true`, `training: true`, `evaluation: true`, dan nilai boolean `publication`. Data berlisensi menambahkan objek `attribution` berisi `dataset`, `publisher`, `license`, `url`, `revision`, dan `reference`. Pengelola data mencatat kedua jenis metadata ini sesudah pemeriksaan sumber.

```sh
npm run dataset:pilot
npm run dataset:pilot -- --require-complete
```

Perintah pertama memvalidasi struktur dan melaporkan kemajuan. `holdoutPositivesByCategory` memakai label akhir untuk contoh yang selesai ditinjau dan label awal untuk sisanya. Perintah kedua mensyaratkan kuota lengkap, minimal 80 positif yang telah disepakati per kategori, 200 holdout manusia dengan label sampling `unselected`, dan 500 hasil tinjauan. Validasi memeriksa metadata izin dan tinjauan, duplikat teks setelah normalisasi, pembagian grup, dan kutipan bukti yang cocok. Peninjau tetap memeriksa apakah sumber sah, identitas sudah dihapus, dan label bisa dipertanggungjawabkan.

## Pelatihan dan evaluasi model lokal

Jalankan `npm run model:pilot` untuk melatih opsi **Model lokal (eksperimental)** dari bagian train, memilih ambang pada validation, dan membandingkan aturan dengan hasil gabungan pada holdout. Perintah dapat memakai label awal yang lengkap atau label yang sudah ditinjau jika tersedia. `npm run model:pilot -- --validation-only` menjalankan pelatihan dan pemilihan ambang tanpa membuka hasil holdout atau menulis model. Laporan lokal merinci hasil per kategori, jenis sampel, dan waktu pemrosesan.

Target awal model lokal adalah maksimal 10 MB tambahan dan latensi p95 maksimal 100 ms per unggahan pendek setelah model dimuat pada CPU perangkat uji proyek. Evaluasi awal memakai 2.000 contoh pilot dan mengukur kesesuaian dengan label dataset. [Metodologi dan hasil](../../docs/DETECTION-METHODOLOGY.md#experimental-local-model)
