import { SUPPORT_EMAIL } from '@/lib/legal/contact';
import type { LegalDocument } from '@/lib/legal/types';

/**
 * The Bahasa Melayu Privacy Policy — a clause-for-clause translation of PRIVACY_POLICY_EN.
 *
 * Kept beside the English document rather than in the short-string dictionary in lib/i18n.ts: these
 * are whole structured documents, not interface labels, and the two must stay comparable section by
 * section. Section ids, numbering, block order and `lastUpdated` are identical to the English, so a
 * reader switching language lands on the same clause.
 *
 * When the English text changes, change this in the same edit. Names, product names, addresses and
 * dates are deliberately left untranslated.
 */

export const PRIVACY_POLICY_MS: LegalDocument = {
  lastUpdated: '2026-09-15',
  language: 'ms-MY',
  intro: [
    {
      type: 'paragraph',
      text: 'BookFlow menghormati privasi anda. Dasar Privasi ini menerangkan cara kami mengumpul, menggunakan, menyimpan dan mengendalikan maklumat apabila anda menggunakan aplikasi BookFlow dan perkhidmatan berkaitan, seperti halaman web yang digunakan oleh pelanggan anda untuk melihat invois yang anda kongsikan.',
    },
    {
      type: 'paragraph',
      text: 'Dengan menggunakan BookFlow, anda mengakui amalan yang diterangkan dalam Dasar Privasi ini. Jika anda tidak bersetuju dengannya, sila jangan gunakan BookFlow.',
    },
  ],
  sections: [
    {
      id: 'information-we-collect',
      title: '1. Maklumat Yang Kami Kumpulkan',
      blocks: [
        { type: 'subheading', text: 'Maklumat akaun' },
        {
          type: 'paragraph',
          text: 'Untuk mencipta dan mengurus akaun anda, kami memproses nama, alamat e-mel dan pengecam akaun anda. Log masuk disediakan oleh penyedia pengesahan kami, Clerk. Jika anda mendaftar dengan alamat e-mel dan kata laluan, kata laluan anda dikendalikan oleh Clerk — BookFlow tidak menyimpan kata laluan anda dalam pangkalan datanya sendiri. Jika anda log masuk dengan Apple atau Google, kami menerima butiran akaun asas yang dikongsi oleh penyedia tersebut, seperti nama dan alamat e-mel anda. Clerk juga merekodkan maklumat tentang sesi log masuk anda, seperti jenis peranti atau pelayar, lokasi anggaran dan alamat IP, yang boleh anda semak di bawah Sesi aktif.',
        },
        { type: 'subheading', text: 'Maklumat perniagaan' },
        {
          type: 'paragraph',
          text: 'Anda boleh menambah maklumat yang digunakan untuk menjalankan ruang kerja BookFlow anda, termasuk:',
        },
        {
          type: 'bullets',
          items: [
            'Nama perniagaan, nombor pendaftaran SSM, jenis perniagaan, nombor telefon, alamat e-mel, alamat dan laman web anda',
            'Logo perniagaan anda',
            'Butiran bank dan DuitNow yang anda pilih untuk dipaparkan pada invois',
            'Tetapan invois, arahan pembayaran dan terma',
            'Perkhidmatan atau pakej, beserta harga dan tetapan depositnya',
          ],
        },
        { type: 'subheading', text: 'Maklumat pelanggan dan tempahan' },
        {
          type: 'paragraph',
          text: 'Anda boleh menambah maklumat tentang pelanggan dan kerja anda sendiri, termasuk nama pelanggan, alamat e-mel, nombor telefon, lokasi dan nota, serta butiran tempahan seperti perkhidmatan, tarikh, masa mula dan tamat, lokasi, harga, deposit, status dan nota. Lihat seksyen 3 untuk tanggungjawab anda apabila anda menambah maklumat tentang orang lain.',
        },
        { type: 'subheading', text: 'Maklumat kewangan dan invois' },
        {
          type: 'paragraph',
          text: 'Anda boleh merekodkan invois, jumlah invois, tarikh akhir pembayaran, deposit, pembayaran, kaedah pembayaran dan status pembayaran, serta pendapatan dan perbelanjaan.',
        },
        {
          type: 'paragraph',
          text: 'BookFlow tidak memproses pembayaran kad atau bank antara anda dan pelanggan anda. Pembayaran direkodkan secara manual oleh anda, dan BookFlow tidak mengumpul atau menyimpan butiran kad kredit atau kad debit.',
        },
        { type: 'subheading', text: 'Invois yang anda kongsi' },
        {
          type: 'paragraph',
          text: 'Apabila anda berkongsi invois, BookFlow mencipta pautan selamat kepada salinan invois tersebut. Sesiapa yang mempunyai pautan itu boleh melihat invois tersebut — termasuk butiran dan logo perniagaan anda, nama dan butiran hubungan pelanggan anda, serta jumlah invois — dan boleh menerima atau menolaknya. Pautan tamat tempoh selepas 30 hari.',
        },
        { type: 'subheading', text: 'Sokongan dan maklum balas' },
        {
          type: 'paragraph',
          text: 'Apabila anda menggunakan Hubungi sokongan atau Hantar maklum balas, kami menyimpan topik atau jenis maklum balas dan mesej yang anda tulis, dipautkan kepada akaun anda, bersama-sama versi aplikasi, platform dan, bagi permintaan sokongan, versi sistem pengendalian anda.',
        },
        { type: 'subheading', text: 'Maklumat teknikal dan penggunaan' },
        {
          type: 'paragraph',
          text: 'Kami memproses maklumat teknikal seperti versi aplikasi, platform dan sistem pengendalian anda, serta maklumat tentang cara aplikasi digunakan — sebagai contoh, apabila tempahan atau invois dicipta, apabila skrin seperti Bantuan & sokongan dibuka, dan apabila aplikasi dibuka atau dikemas kini. Peristiwa penggunaan menerangkan tindakan tersebut, bukan kandungan rekod anda.',
        },
        {
          type: 'paragraph',
          text: 'Kami juga menggunakan perkhidmatan pemantauan ralat untuk mengesan kerosakan dan ralat. Perkhidmatan ini mengumpul butiran diagnostik seperti maklumat peranti dan aplikasi, alamat IP anda dan aktiviti aplikasi terkini apabila masalah berlaku, dan merekodkan sampel sesi aplikasi — serta sesi yang mengalami ralat — sebagai rakaman skrin yang teks dan imejnya ditutup.',
        },
        { type: 'subheading', text: 'Maklumat yang disimpan pada peranti anda' },
        {
          type: 'paragraph',
          text: 'BookFlow menyimpan sebahagian maklumat pada peranti anda supaya ia berfungsi dengan betul, seperti sesi log masuk anda, pilihan analitik anda, dan peringatan tempahan yang dijadualkan dengan sistem notifikasi peranti anda. Peringatan BookFlow ialah notifikasi setempat; BookFlow tidak menggunakan token notifikasi tolak.',
        },
      ],
    },
    {
      id: 'how-we-use-information',
      title: '2. Cara Kami Menggunakan Maklumat',
      blocks: [
        { type: 'paragraph', text: 'Kami menggunakan maklumat untuk:' },
        {
          type: 'bullets',
          items: [
            'Menyediakan ciri-ciri BookFlow dan menyimpan rekod perniagaan yang anda cipta',
            'Mencipta, mengesahkan dan melindungi akaun anda',
            'Mengurus pelanggan, tempahan, invois, pembayaran, pendapatan dan perbelanjaan anda',
            'Mencipta pautan invois, PDF dan laporan apabila anda memintanya',
            'Menyediakan BookFlow Pro dan menyemak status langganan anda',
            'Membalas permintaan sokongan dan menyemak maklum balas',
            'Memahami ciri yang digunakan, membaiki masalah dan menambah baik kebolehpercayaan serta pengalaman pengguna',
            'Mengesan, mencegah dan menyiasat ralat, penyalahgunaan dan isu keselamatan',
            'Mematuhi kewajipan undang-undang di mana ia terpakai',
          ],
        },
        {
          type: 'paragraph',
          text: 'Kami tidak menjual maklumat anda, dan kami tidak menggunakan rekod perniagaan yang anda masukkan untuk menunjukkan iklan kepada anda.',
        },
      ],
    },
    {
      id: 'customer-information',
      title: '3. Maklumat Pelanggan Yang Anda Tambah ke BookFlow',
      blocks: [
        {
          type: 'paragraph',
          text: 'BookFlow membolehkan anda memasukkan maklumat peribadi tentang pelanggan anda — seperti nama, butiran hubungan, lokasi, butiran tempahan dan nota — supaya anda boleh mengurus tempahan, invois dan kerja berkaitan.',
        },
        {
          type: 'paragraph',
          text: 'Anda bertanggungjawab untuk memastikan anda dibenarkan mengumpul dan menggunakan maklumat ini serta memasukkannya ke dalam BookFlow, termasuk memberitahu pelanggan anda cara anda menggunakan maklumat mereka di mana undang-undang menghendakinya. Tambah hanya apa yang anda perlukan untuk menjalankan perniagaan anda.',
        },
        {
          type: 'paragraph',
          text: 'BookFlow memproses maklumat pelanggan anda semata-mata untuk menyediakan ciri yang anda gunakan, seperti menyimpan rekod mereka, menyediakan invois dan mencipta pautan invois yang anda pilih untuk dikongsi.',
        },
      ],
    },
    {
      id: 'service-providers',
      title: '4. Penyedia Perkhidmatan',
      blocks: [
        {
          type: 'paragraph',
          text: 'Kami menggunakan penyedia perkhidmatan yang dipercayai untuk menjalankan BookFlow. Setiap satu menerima hanya maklumat yang diperlukan untuk menyediakan perkhidmatannya dan mengendalikannya di bawah terma privasinya sendiri:',
        },
        {
          type: 'definitions',
          items: [
            { term: 'Clerk', text: 'Pendaftaran akaun, log masuk, pengurusan kata laluan dan pengurusan sesi.' },
            {
              term: 'Supabase',
              text: 'Pangkalan data, storan fail dan fungsi pelayan. Rekod ruang kerja, logo perniagaan, pautan invois yang dikongsi, permintaan sokongan dan maklum balas anda disimpan di sini.',
            },
            { term: 'RevenueCat', text: 'Menguruskan status dan kelayakan langganan BookFlow Pro, menggunakan pengecam akaun anda.' },
            { term: 'PostHog', text: 'Analitik produk (lihat seksyen 5).' },
            { term: 'Sentry', text: 'Pemantauan ralat dan kerosakan (lihat seksyen 1).' },
            { term: 'Expo', text: 'Mengehos halaman web yang digunakan oleh pelanggan anda untuk melihat invois yang anda kongsikan.' },
            {
              term: 'Apple',
              text: 'Pengedaran App Store, pembelian dalam aplikasi pada iOS, dan Sign in with Apple jika anda memilihnya.',
            },
            {
              term: 'Google',
              text: 'Pengedaran Google Play, pembelian dalam aplikasi pada Android, dan Sign in with Google jika anda memilihnya.',
            },
          ],
        },
        {
          type: 'paragraph',
          text: 'Jika anda berkongsi invois melalui WhatsApp atau aplikasi lain, aplikasi tersebut mengendalikan mesej itu di bawah termanya sendiri.',
        },
      ],
    },
    {
      id: 'analytics',
      title: '5. Analitik',
      blocks: [
        {
          type: 'paragraph',
          text: 'Kami menggunakan analitik produk untuk memahami cara ciri-ciri BookFlow digunakan dan untuk menambah baik aplikasi. Peristiwa analitik merekodkan tindakan seperti log masuk, mencipta tempahan atau invois, merekodkan pembayaran, membuka skrin tertentu dan membuka aplikasi, bersama butiran seperti versi aplikasi dan platform anda.',
        },
        {
          type: 'paragraph',
          text: 'Analitik dipautkan kepada pengecam akaun BookFlow anda, jadi ia bukan tanpa nama. Kami tidak menghantar kandungan rekod pelanggan, invois, mesej sokongan atau maklum balas anda kepada analitik.',
        },
        {
          type: 'paragraph',
          text: 'Anda boleh mematikan analitik pada bila-bila masa dengan Kongsi analitik aplikasi di Tetapan > Keselamatan & privasi. Tetapan ini terpakai pada peranti tempat anda mengubahnya. Ia tidak menjejaskan pemantauan ralat, yang kami gunakan untuk memastikan BookFlow berfungsi.',
        },
        { type: 'action', label: 'Buka Keselamatan & privasi', action: 'securityPrivacy' },
      ],
    },
    {
      id: 'subscriptions',
      title: '6. Langganan',
      blocks: [
        {
          type: 'paragraph',
          text: 'Langganan BookFlow Pro dibeli melalui Apple App Store atau Google Play, bergantung pada peranti anda. Apple atau Google memproses pembayaran dan mengendalikan maklumat pengebilan anda di bawah amalan privasinya sendiri. BookFlow tidak menerima atau menyimpan butiran penuh kad pembayaran anda.',
        },
        {
          type: 'paragraph',
          text: 'Kami menggunakan RevenueCat untuk mengesahkan status langganan anda dan membuka ciri Pro. RevenueCat menerima pengecam akaun BookFlow anda dan maklumat pembelian daripada gedung, seperti produk, tarikh pembelian dan pembaharuan serta status langganan.',
        },
      ],
    },
    {
      id: 'storage-security',
      title: '7. Penyimpanan dan Keselamatan Data',
      blocks: [
        {
          type: 'paragraph',
          text: 'Kami menggunakan langkah teknikal dan organisasi yang munasabah yang direka untuk melindungi maklumat anda. Ini termasuk:',
        },
        {
          type: 'bullets',
          items: [
            'Sambungan yang disulitkan (HTTPS) antara aplikasi dan penyedia perkhidmatan kami',
            'Log masuk akaun melalui Clerk',
            'Peraturan akses pangkalan data yang mengehadkan setiap akaun kepada rekodnya sendiri',
            'Mengekalkan operasi berhak istimewa, seperti pemadaman akaun, pada pelayan dan bukan dalam aplikasi',
          ],
        },
        {
          type: 'paragraph',
          text: 'Sebahagian maklumat boleh dilihat oleh orang lain secara reka bentuk: sesiapa yang mempunyai pautan invois yang anda kongsikan boleh melihat invois tersebut sehingga pautan itu tamat tempoh, dan logo perniagaan anda disimpan sebagai imej yang boleh diakses secara awam supaya ia dapat dipaparkan pada invois tersebut.',
        },
        {
          type: 'paragraph',
          text: 'Tiada kaedah penyimpanan atau penghantaran elektronik yang benar-benar selamat, dan kami tidak dapat menjamin keselamatan mutlak. Sila rahsiakan butiran log masuk anda dan beritahu kami jika anda percaya akaun anda telah dikompromi.',
        },
      ],
    },
    {
      id: 'retention',
      title: '8. Pengekalan Data',
      blocks: [
        {
          type: 'paragraph',
          text: 'Kami menyimpan maklumat anda selama mana ia diperlukan untuk menyediakan BookFlow, menyelenggara akaun anda dan memenuhi keperluan operasi atau undang-undang yang sah. Rekod ruang kerja anda kekal dalam akaun anda sehingga anda memadamkannya atau memadamkan akaun anda.',
        },
        {
          type: 'bullets',
          items: [
            'Invois yang anda pindahkan ke Tong sampah akan dibuang secara kekal selepas 30 hari, pada kali berikutnya BookFlow dibuka selepas tempoh tersebut.',
            'Pautan invois yang dikongsi berhenti berfungsi selepas 30 hari.',
            'Permintaan sokongan dan maklum balas disimpan sehingga akaun anda dipadamkan, melainkan kami perlu menyimpannya lebih lama atas sebab undang-undang.',
          ],
        },
        {
          type: 'paragraph',
          text: 'Sebahagian maklumat mungkin kekal untuk tempoh terhad dalam sandaran, log atau sistem penyedia perkhidmatan kami di mana ini perlu dari segi teknikal, dan data analitik atau pemantauan ralat mungkin disimpan selama tempoh perkhidmatan tersebut mengekalkannya.',
        },
      ],
    },
    {
      id: 'choices-deletion',
      title: '9. Pilihan Anda dan Pemadaman Akaun',
      blocks: [
        { type: 'subheading', text: 'Kawalan privasi' },
        {
          type: 'paragraph',
          text: 'Di Tetapan > Keselamatan & privasi anda boleh mengurus cara anda log masuk, menukar kata laluan anda (jika akaun anda mempunyainya), menyemak dan log keluar peranti lain, mematikan analitik, dan memadamkan akaun anda.',
        },
        { type: 'subheading', text: 'Memadam akaun anda' },
        {
          type: 'paragraph',
          text: 'Anda boleh memadamkan akaun anda di Tetapan > Keselamatan & privasi > Padam akaun. BookFlow akan meminta anda mengesahkan dua kali sebelum apa-apa dipadamkan.',
        },
        {
          type: 'paragraph',
          text: 'Pemadaman membuang akaun BookFlow anda dan data BookFlow yang berkaitan mengikut proses pemadaman kami: pelanggan, tempahan, invois (termasuk Tong sampah), pembayaran, pendapatan dan perbelanjaan, perkhidmatan, peringatan dan notifikasi, profil perniagaan dan tetapan invois, logo perniagaan yang dimuat naik, pautan invois yang dikongsi, permintaan sokongan dan maklum balas, rekod langganan anda dengan RevenueCat, dan akaun log masuk anda dengan Clerk. Maklumat mungkin dikekalkan di mana undang-undang menghendakinya atau buat sementara di mana ia perlu dari segi teknikal, seperti yang diterangkan dalam seksyen 8.',
        },
        {
          type: 'paragraph',
          text: 'Memadamkan akaun BookFlow anda tidak membatalkan langganan yang dibilkan melalui Apple App Store atau Google Play. Sila batalkan BookFlow Pro dalam tetapan langganan App Store atau Google Play anda untuk menghentikan caj pada masa hadapan.',
        },
        { type: 'action', label: 'Buka Keselamatan & privasi', action: 'securityPrivacy' },
        { type: 'subheading', text: 'Mengeksport data anda' },
        {
          type: 'paragraph',
          text: 'Pelanggan langganan BookFlow Pro boleh menggunakan Eksport data & laporan untuk memuat turun laporan tempahan, invois, pembayaran pelanggan, pendapatan, perbelanjaan serta untung rugi mereka bagi julat tarikh yang dipilih, sebagai fail PDF, CSV atau Excel. Jika anda tidak dapat menggunakan eksport dan ingin mendapatkan salinan maklumat anda, hubungi kami.',
        },
        { type: 'action', label: 'Buka Eksport data & laporan', action: 'exportData' },
      ],
    },
    {
      id: 'children',
      title: '10. Privasi Kanak-Kanak',
      blocks: [
        {
          type: 'paragraph',
          text: 'BookFlow ialah aplikasi perniagaan dan produktiviti untuk orang yang menjalankan perkhidmatan mereka sendiri. Ia tidak direka untuk atau ditujukan kepada kanak-kanak, dan kami tidak dengan sengaja mengumpul maklumat peribadi daripada kanak-kanak bagi penggunaan BookFlow oleh mereka sendiri. Jika anda percaya seorang kanak-kanak telah mencipta akaun, sila hubungi kami.',
        },
      ],
    },
    {
      id: 'international',
      title: '11. Pemprosesan Data Antarabangsa',
      blocks: [
        {
          type: 'paragraph',
          text: 'Penyedia perkhidmatan kami mengendalikan infrastruktur di beberapa negara. Oleh itu, maklumat anda mungkin disimpan atau diproses di luar Malaysia, termasuk di negara yang undang-undang perlindungan datanya mungkin berbeza daripada Malaysia. Kami memilih penyedia yang menerangkan perlindungan bagi data yang mereka proses.',
        },
      ],
    },
    {
      id: 'rights',
      title: '12. Hak Privasi Anda',
      blocks: [
        {
          type: 'paragraph',
          text: 'BookFlow dibina untuk pengguna di Malaysia. Tertakluk kepada undang-undang yang terpakai, seperti Akta Perlindungan Data Peribadi 2010 Malaysia di mana ia terpakai, anda mungkin mempunyai hak untuk:',
        },
        {
          type: 'bullets',
          items: [
            'Meminta akses kepada maklumat peribadi yang kami simpan tentang anda',
            'Meminta kami membetulkan maklumat yang tidak tepat, tidak lengkap atau sudah lapuk',
            'Menarik balik persetujuan anda di mana kami bergantung kepadanya',
            'Meminta kami memadamkan maklumat anda di mana ia terpakai',
            'Melaksanakan hak lain yang diperuntukkan oleh undang-undang yang terpakai',
          ],
        },
        {
          type: 'paragraph',
          text: 'Anda boleh mengemas kini profil perniagaan dan rekod pelanggan anda sendiri dalam aplikasi, dan memadamkan akaun anda di Tetapan > Keselamatan & privasi. Untuk permintaan lain — termasuk perubahan kepada nama atau alamat e-mel anda — hubungi kami. Kami mungkin perlu mengesahkan identiti anda sebelum bertindak atas sesuatu permintaan.',
        },
        {
          type: 'paragraph',
          text: 'Jika pelanggan anda bertanya tentang maklumat yang anda masukkan mengenai mereka, sila kendalikan permintaan mereka sebagai perniagaan yang mengumpulnya; kami akan membantu setakat yang munasabah.',
        },
      ],
    },
    {
      id: 'changes',
      title: '13. Perubahan kepada Dasar Privasi Ini',
      blocks: [
        {
          type: 'paragraph',
          text: 'Kami mungkin mengemas kini Dasar Privasi ini apabila BookFlow atau keperluan undang-undang berubah. Tarikh “Kemas kini terakhir” di bahagian atas menunjukkan bila ia terakhir berubah. Jika kami membuat perubahan yang material, kami akan memberitahu anda melalui aplikasi atau cara lain yang sesuai.',
        },
      ],
    },
    {
      id: 'contact',
      title: '14. Hubungi Kami',
      blocks: [
        { type: 'paragraph', text: 'Jika anda mempunyai soalan tentang Dasar Privasi ini atau maklumat anda, hubungi kami:' },
        { type: 'email', label: 'E-mel', address: SUPPORT_EMAIL },
        { type: 'action', label: 'Hubungi sokongan', action: 'contactSupport' },
      ],
    },
  ],
};
