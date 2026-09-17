import { SUPPORT_EMAIL } from '@/lib/legal/contact';
import type { LegalDocument } from '@/lib/legal/types';

/**
 * The Bahasa Melayu Terms of Service — a clause-for-clause translation of TERMS_OF_SERVICE_EN.
 *
 * Kept beside the English document rather than in the short-string dictionary in lib/i18n.ts: these
 * are whole structured documents, not interface labels, and the two must stay comparable section by
 * section. Section ids, numbering, block order and `lastUpdated` are identical to the English, so a
 * reader switching language lands on the same clause.
 *
 * Terminology is kept consistent with privacy-policy.ms.ts. When the English text changes, change
 * this in the same edit. Names, product names, addresses and dates are deliberately left
 * untranslated.
 */

export const TERMS_OF_SERVICE_MS: LegalDocument = {
  lastUpdated: '2026-09-15',
  language: 'ms-MY',
  intro: [
    {
      type: 'paragraph',
      text: 'Terma Perkhidmatan ini mengawal akses dan penggunaan anda terhadap BookFlow serta perkhidmatan berkaitannya, termasuk halaman web yang digunakan oleh pelanggan anda untuk melihat invois yang anda kongsikan. Dengan mencipta akaun atau menggunakan BookFlow, anda bersetuju dengan Terma ini.',
    },
    {
      type: 'paragraph',
      text: 'Jika anda tidak bersetuju dengan Terma ini, sila jangan gunakan BookFlow. Dalam Terma ini, “BookFlow”, “kami” bermaksud pengendali perkhidmatan BookFlow, dan “anda” bermaksud individu atau perniagaan yang menggunakannya.',
    },
  ],
  sections: [
    {
      id: 'eligibility',
      title: '1. Kelayakan',
      blocks: [
        {
          type: 'paragraph',
          text: 'Anda hanya boleh menggunakan BookFlow jika anda berkeupayaan dari segi undang-undang untuk memeterai perjanjian yang mengikat dan anda menggunakannya untuk tujuan yang sah. BookFlow bertujuan sebagai alat perniagaan dan produktiviti untuk pekerja bebas dan profesional persendirian. Jika anda menggunakan BookFlow bagi pihak sesebuah perniagaan, anda mengesahkan bahawa anda diberi kuasa untuk menerima Terma ini bagi pihaknya.',
        },
      ],
    },
    {
      id: 'account',
      title: '2. Akaun BookFlow Anda',
      blocks: [
        {
          type: 'paragraph',
          text: 'Anda memerlukan akaun untuk menggunakan BookFlow. Log masuk disediakan melalui penyedia pengesahan kami, Clerk, menggunakan alamat e-mel dan kata laluan atau Sign in with Apple atau Google. BookFlow tidak menyimpan kata laluan anda dalam pangkalan datanya sendiri.',
        },
        { type: 'paragraph', text: 'Anda bertanggungjawab untuk:' },
        {
          type: 'bullets',
          items: [
            'Memberikan maklumat akaun yang tepat dan mengemas kininya',
            'Memastikan butiran log masuk dan peranti anda selamat',
            'Aktiviti yang berlaku melalui akaun anda',
            'Memberitahu kami dengan segera jika anda percaya akaun anda telah dikompromi',
          ],
        },
        { type: 'paragraph', text: 'Anda tidak boleh:' },
        {
          type: 'bullets',
          items: [
            'Menyamar sebagai orang atau perniagaan lain',
            'Mengakses, atau cuba mengakses, akaun orang lain tanpa kebenaran',
            'Menjual, memindahkan atau berkongsi akses kepada akaun anda dengan cara yang membolehkan orang lain mengelak Terma ini atau had pelan anda',
            'Menggunakan akaun anda untuk aktiviti yang menyalahi undang-undang',
          ],
        },
        {
          type: 'paragraph',
          text: 'Anda boleh menyemak peranti yang log masuk ke akaun anda, menukar kata laluan anda (jika akaun anda mempunyainya) dan log keluar peranti lain di Tetapan > Keselamatan & privasi.',
        },
      ],
    },
    {
      id: 'service',
      title: '3. Perkhidmatan BookFlow',
      blocks: [
        {
          type: 'paragraph',
          text: 'BookFlow ialah aplikasi pengurusan perniagaan dan produktiviti. Bergantung pada pelan anda, ia menyediakan alat untuk:',
        },
        {
          type: 'bullets',
          items: [
            'Menyimpan rekod pelanggan',
            'Merekod tempahan, menjadualkannya dan menjejaki statusnya',
            'Menerima peringatan tempahan melalui notifikasi peranti anda',
            'Mencipta invois, memuat turunnya sebagai PDF dan berkongsinya melalui pautan',
            'Merekod deposit, pembayaran dan status pembayaran',
            'Menjejaki pendapatan dan perbelanjaan',
            'Melihat cerapan perniagaan dan mengeksport laporan',
            'Mencipta dan memulihkan fail sandaran ruang kerja anda',
            'Menghubungi sokongan dan menghantar maklum balas',
          ],
        },
        {
          type: 'paragraph',
          text: 'BookFlow bukan sebuah firma perakaunan, akauntan, penasihat cukai, penasihat kewangan, penasihat undang-undang, bank, pemproses pembayaran atau penyedia eskrow, dan tiada apa-apa dalam BookFlow merupakan nasihat profesional.',
        },
      ],
    },
    {
      id: 'business-responsibilities',
      title: '4. Tanggungjawab Perniagaan Anda',
      blocks: [
        {
          type: 'paragraph',
          text: 'BookFlow membantu anda menyusun maklumat, tetapi anda kekal bertanggungjawab untuk menjalankan perniagaan anda. Anda bertanggungjawab untuk:',
        },
        {
          type: 'bullets',
          items: [
            'Ketepatan maklumat pelanggan, tempahan, invois, pembayaran, pendapatan dan perbelanjaan yang anda masukkan',
            'Jumlah invois, cukai dan sebarang kewajipan pendaftaran atau pelaporan cukai',
            'Arahan pembayaran anda, termasuk butiran bank dan DuitNow yang anda paparkan pada invois',
            'Perkhidmatan atau produk yang anda sediakan',
            'Perjanjian dan urusan anda dengan pelanggan anda',
            'Mematuhi undang-undang yang terpakai kepada perniagaan anda',
          ],
        },
        {
          type: 'paragraph',
          text: 'BookFlow tidak mengesahkan sama ada invois, jumlah cukai, perbelanjaan, pembayaran atau rekod lain yang anda masukkan itu betul. BookFlow merekodkan jumlah seperti yang anda masukkan dan tidak mengira atau mengenakan cukai.',
        },
      ],
    },
    {
      id: 'customer-information',
      title: '5. Maklumat Pelanggan',
      blocks: [
        {
          type: 'paragraph',
          text: 'Anda boleh memasukkan maklumat tentang pelanggan anda ke dalam BookFlow, seperti nama, butiran hubungan, lokasi, butiran tempahan dan nota. Anda bertanggungjawab untuk mempunyai asas sah, kebenaran atau kuasa yang sesuai dari segi undang-undang untuk mengumpul dan menggunakan maklumat tersebut serta memasukkannya ke dalam BookFlow, dan untuk mengendalikan permintaan pelanggan anda mengenainya.',
        },
        {
          type: 'paragraph',
          text: 'Jangan masukkan maklumat yang anda tidak dibenarkan memprosesnya dari segi undang-undang. Dasar Privasi kami menerangkan cara BookFlow mengendalikan maklumat, termasuk maklumat tentang pelanggan anda.',
        },
        { type: 'action', label: 'Dasar Privasi', action: 'privacyPolicy' },
      ],
    },
    {
      id: 'bookings',
      title: '6. Tempahan',
      blocks: [
        {
          type: 'paragraph',
          text: 'BookFlow menyediakan alat untuk anda merekod dan mengurus tempahan. Butiran dan status tempahan adalah berdasarkan maklumat yang anda masukkan, dan sesetengah status mungkin dikemas kini secara automatik daripada rekod yang anda tambah, seperti deposit yang anda rekodkan. Peringatan tempahan dijadualkan pada peranti anda dan bergantung pada tetapan notifikasi peranti anda, jadi penyampaiannya tidak dijamin.',
        },
        {
          type: 'paragraph',
          text: 'BookFlow bukan pihak kepada mana-mana tempahan atau perjanjian perkhidmatan antara anda dan pelanggan anda. BookFlow tidak menjamin bahawa pelanggan akan hadir atau membayar, bahawa sesuatu perkhidmatan akan dilaksanakan, bahawa maklumat tempahan adalah betul, atau kualiti mana-mana perkhidmatan yang anda sediakan. Anda kekal bertanggungjawab atas hubungan anda dengan pelanggan anda.',
        },
      ],
    },
    {
      id: 'invoices',
      title: '7. Invois',
      blocks: [
        {
          type: 'paragraph',
          text: 'BookFlow menyediakan alat untuk mencipta, mengurus, memuat turun dan berkongsi invois. Invois dijana daripada maklumat dan tetapan yang anda masukkan, seperti butiran perniagaan, jumlah, tarikh akhir pembayaran, arahan pembayaran dan terma anda. Sila semak setiap invois sebelum anda menghantarnya.',
        },
        {
          type: 'paragraph',
          text: 'Apabila anda berkongsi invois, BookFlow mencipta pautan kepada salinannya. Sesiapa yang mempunyai pautan itu boleh melihat invois tersebut sehingga pautan itu tamat tempoh selepas 30 hari, dan boleh menandakannya sebagai diterima atau ditolak. Penerimaan atau penolakan yang dibuat melalui pautan itu direkodkan sebagai status invois dalam BookFlow; BookFlow tidak mengesahkan siapa yang memberi respons dan tidak mewujudkan sebarang perjanjian bagi pihak anda.',
        },
        {
          type: 'paragraph',
          text: 'BookFlow tidak menjamin bahawa sesuatu invois memenuhi setiap keperluan undang-undang atau cukai, adalah tepat, akan diterima oleh pelanggan anda, atau akan menghasilkan pembayaran. Dapatkan nasihat perakaunan, cukai atau undang-undang profesional di mana bersesuaian.',
        },
      ],
    },
    {
      id: 'payments',
      title: '8. Pembayaran dan Rekod Pembayaran',
      blocks: [
        {
          type: 'paragraph',
          text: 'BookFlow membolehkan anda merekodkan maklumat pembayaran, deposit dan status pembayaran bagi tujuan penyusunan. BookFlow tidak memproses atau memindahkan pembayaran antara anda dan pelanggan anda, dan ia tidak disambungkan kepada mana-mana bank atau gerbang pembayaran.',
        },
        {
          type: 'paragraph',
          text: 'Status seperti “Deposit Dibayar” atau “Telah dibayar”, dan sebarang pembayaran yang anda rekodkan, adalah berdasarkan maklumat yang anda masukkan — termasuk status yang dikemas kini secara automatik oleh BookFlow daripada maklumat tersebut. Ia tidak bermakna BookFlow telah mengesahkan bahawa sebarang wang benar-benar diterima. Sentiasa sahkan pembayaran dengan bank atau penyedia pembayaran anda.',
        },
      ],
    },
    {
      id: 'financial-records',
      title: '9. Rekod dan Laporan Kewangan',
      blocks: [
        {
          type: 'paragraph',
          text: 'BookFlow mungkin mengira dan memaparkan pendapatan, perbelanjaan, untung rugi, laporan dan cerapan perniagaan. Ini adalah berdasarkan data yang tersedia dalam BookFlow sahaja dan disediakan sebagai alat penyusunan dan maklumat.',
        },
        {
          type: 'paragraph',
          text: 'BookFlow tidak memberikan nasihat perakaunan, cukai atau kewangan, dan tidak menjamin bahawa mana-mana laporan adalah lengkap, betul atau sesuai untuk dikemukakan kepada LHDN (Lembaga Hasil Dalam Negeri Malaysia) atau mana-mana pihak berkuasa lain. Laporan mungkin membantu anda menyusun maklumat bagi tujuan cukai atau perakaunan, tetapi anda kekal bertanggungjawab untuk mengesahkan rekod anda.',
        },
      ],
    },
    {
      id: 'free-plan',
      title: '10. Pelan Percuma',
      blocks: [
        {
          type: 'paragraph',
          text: 'BookFlow menawarkan pelan Percuma. Ciri atau tahap penggunaan tertentu adalah terhad pada pelan Percuma, seperti bilangan pelanggan, tempahan atau invois yang boleh anda cipta. Had semasa ditunjukkan di dalam BookFlow.',
        },
        {
          type: 'paragraph',
          text: 'Kami mungkin mengubah ciri atau had pelan Percuma secara munasabah apabila BookFlow berkembang. Di mana sesuatu perubahan itu material, kami akan berusaha memberitahu anda terlebih dahulu melalui aplikasi atau cara lain yang sesuai. Rekod yang telah anda cipta tidak akan dipadamkan kerana sesuatu had berubah.',
        },
      ],
    },
    {
      id: 'pro',
      title: '11. BookFlow Pro',
      blocks: [
        {
          type: 'paragraph',
          text: 'BookFlow Pro ialah langganan berbayar yang bersifat pilihan. Ia mungkin merangkumi had penggunaan yang diperluas dan ciri tambahan, seperti cerapan perniagaan, penyesuaian invois, logo perniagaan pada invois, eksport data dan sandaran ruang kerja. Ciri yang disertakan adalah seperti yang diterangkan dalam aplikasi pada masa itu, dan akses anda ditentukan oleh langganan aktif anda.',
        },
        {
          type: 'paragraph',
          text: 'Harga semasa dan pilihan langganan yang tersedia dipaparkan sebelum anda membuat pembelian.',
        },
      ],
    },
    {
      id: 'billing',
      title: '12. Langganan dan Pengebilan',
      blocks: [
        {
          type: 'paragraph',
          text: 'BookFlow Pro dibeli sebagai langganan dalam aplikasi melalui Apple App Store pada iOS atau Google Play pada Android. Langganan adalah:',
        },
        {
          type: 'bullets',
          items: [
            'Dibilkan oleh Apple atau Google melalui akaun App Store atau Google Play anda',
            'Tertakluk kepada terma pembayaran dan langganan Apple atau Google yang terpakai',
            'Diuruskan melalui akaun App Store atau Google Play anda',
          ],
        },
        {
          type: 'paragraph',
          text: 'Langganan diperbaharui secara automatik melainkan dibatalkan selaras dengan peraturan gedung yang terpakai dan terma pembelian yang ditunjukkan pada masa pembelian. Apple atau Google memproses pembayaran; BookFlow tidak menerima atau menyimpan butiran kad pembayaran anda.',
        },
        {
          type: 'paragraph',
          text: 'Kami menggunakan RevenueCat untuk menguruskan status dan kelayakan langganan. Langganan anda mengikut akaun BookFlow anda, jadi anda boleh memulihkannya pada peranti lain dengan log masuk dan menggunakan Pulihkan pembelian.',
        },
      ],
    },
    {
      id: 'cancelling',
      title: '13. Membatalkan BookFlow Pro',
      blocks: [
        {
          type: 'paragraph',
          text: 'Anda boleh membatalkan BookFlow Pro melalui gedung tempat anda membelinya:',
        },
        {
          type: 'definitions',
          items: [
            { term: 'Apple App Store', text: 'dalam tetapan langganan Apple Account anda pada iPhone atau iPad anda.' },
            { term: 'Google Play', text: 'dalam bahagian Subscriptions di Google Play Store.' },
          ],
        },
        {
          type: 'paragraph',
          text: 'Anda juga boleh mencapai pengurusan langganan daripada Tetapan > Pelan BookFlow. Selepas pembatalan, ciri Pro secara amnya kekal tersedia sehingga akhir tempoh pengebilan semasa, seperti yang ditentukan oleh gedung.',
        },
        {
          type: 'paragraph',
          text: 'Memadamkan aplikasi BookFlow daripada peranti anda tidak membatalkan langganan anda. Memadamkan akaun BookFlow anda juga tidak membatalkan langganan yang dibilkan oleh Apple atau Google. Untuk menghentikan caj pada masa hadapan, batalkan melalui gedung.',
        },
      ],
    },
    {
      id: 'refunds',
      title: '14. Bayaran Balik',
      blocks: [
        {
          type: 'paragraph',
          text: 'Langganan dibeli melalui Apple atau Google, jadi kelayakan bayaran balik dan permintaan bayaran balik dikendalikan mengikut dasar gedung yang terpakai. Sila minta bayaran balik daripada Apple atau Google secara terus. Tiada apa-apa dalam Terma ini yang menghadkan sebarang hak bayaran balik yang mungkin anda miliki di bawah undang-undang yang terpakai.',
        },
      ],
    },
    {
      id: 'acceptable-use',
      title: '15. Penggunaan Yang Boleh Diterima',
      blocks: [
        { type: 'paragraph', text: 'Anda tidak boleh menggunakan BookFlow untuk:' },
        {
          type: 'bullets',
          items: [
            'Melanggar mana-mana undang-undang yang terpakai',
            'Melakukan penipuan atau menghantar invois yang mengelirukan',
            'Menyamar sebagai mana-mana orang atau perniagaan',
            'Menyebarkan perisian hasad atau kod berbahaya',
            'Memperoleh, atau cuba memperoleh, akses tanpa kebenaran kepada BookFlow, akaun lain atau sistem berkaitan',
            'Mengganggu atau menjejaskan BookFlow atau perkhidmatan yang menjadi sandarannya',
            'Menyalahgunakan perkhidmatan BookFlow, contohnya melalui permintaan automatik atau dengan mengelak had pelan',
            'Memuat naik kandungan yang anda tidak mempunyai kebenaran untuk menggunakannya',
            'Menyalahgunakan maklumat pelanggan anda atau menggunakannya bagi tujuan yang tidak dijangka oleh mereka',
            'Memudahkan sebarang aktiviti yang menyalahi undang-undang',
          ],
        },
      ],
    },
    {
      id: 'your-content',
      title: '16. Kandungan Anda',
      blocks: [
        {
          type: 'paragraph',
          text: '“Kandungan anda” bermaksud maklumat yang anda masukkan atau muat naik ke BookFlow, termasuk maklumat perniagaan, maklumat pelanggan, tempahan, invois, logo, nota, rekod pembayaran, pendapatan, perbelanjaan dan data perniagaan lain.',
        },
        {
          type: 'paragraph',
          text: 'Anda mengekalkan hak yang anda miliki terhadap kandungan anda. BookFlow tidak menuntut pemilikan ke atas data perniagaan atau pelanggan anda. Anda memberi BookFlow kebenaran untuk menyimpan, memproses, memaparkan dan menghantar kandungan anda hanya setakat yang perlu untuk mengendalikan dan menyediakan BookFlow — sebagai contoh, untuk menyegerakkan ruang kerja anda, menjana invois dan laporan, serta menunjukkan invois kepada seseorang yang anda kongsikannya.',
        },
        { type: 'subheading', text: 'Logo dan muat naik' },
        {
          type: 'paragraph',
          text: 'Anda mesti mempunyai hak yang diperlukan ke atas mana-mana logo, imej atau kandungan lain yang anda muat naik. Jangan muat naik kandungan yang melanggar harta intelek atau hak lain milik orang lain. Logo perniagaan anda disimpan sebagai imej yang boleh diakses secara awam supaya ia dapat dipaparkan pada invois yang anda kongsikan.',
        },
      ],
    },
    {
      id: 'our-ip',
      title: '17. Harta Intelek BookFlow',
      blocks: [
        {
          type: 'paragraph',
          text: 'Aplikasi, perisian, antara muka, nama, penjenamaan, logo, reka bentuk asli dan dokumentasi BookFlow dimiliki oleh BookFlow atau pemberi lesennya. Menggunakan BookFlow tidak memindahkan pemilikan mana-mana daripadanya kepada anda. Perisian dan perkhidmatan pihak ketiga yang digunakan dalam BookFlow kekal menjadi hak milik pemilik masing-masing dan digunakan di bawah lesen mereka.',
        },
      ],
    },
    {
      id: 'third-parties',
      title: '18. Perkhidmatan Pihak Ketiga',
      blocks: [
        { type: 'paragraph', text: 'BookFlow bergantung kepada perkhidmatan pihak ketiga untuk menyediakan sebahagian daripada aplikasi, termasuk:' },
        {
          type: 'definitions',
          items: [
            { term: 'Clerk', text: 'log masuk dan pengurusan akaun' },
            { term: 'Supabase', text: 'pangkalan data, storan fail dan fungsi pelayan' },
            { term: 'RevenueCat', text: 'status dan kelayakan langganan' },
            { term: 'PostHog', text: 'analitik produk' },
            { term: 'Sentry', text: 'pemantauan ralat dan kerosakan' },
            { term: 'Expo', text: 'pengehosan untuk halaman invois yang dilihat oleh pelanggan anda' },
            { term: 'Apple dan Google', text: 'pengedaran aplikasi, pembelian dalam aplikasi dan log masuk pilihan' },
          ],
        },
        {
          type: 'paragraph',
          text: 'Perkhidmatan ini mempunyai terma dan dasar privasinya sendiri. Kami tidak dapat mengawal setiap aspek ketersediaan atau operasinya. Jika anda berkongsi invois melalui WhatsApp atau aplikasi lain, terma aplikasi tersebut terpakai kepada penggunaan anda.',
        },
      ],
    },
    {
      id: 'availability',
      title: '19. Ketersediaan dan Perubahan',
      blocks: [
        {
          type: 'paragraph',
          text: 'Kami berusaha memastikan BookFlow boleh dipercayai, tetapi kami tidak berjanji bahawa ia akan sentiasa tersedia. Penyelenggaraan mungkin diperlukan, gangguan boleh berlaku, dan perkhidmatan pihak ketiga yang menjadi sandaran BookFlow mungkin mengalami gangguan. Sesetengah ciri, seperti penyegerakan, perkongsian invois dan langganan, memerlukan sambungan internet.',
        },
        {
          type: 'paragraph',
          text: 'BookFlow akan berubah dari semasa ke semasa. Kami mungkin menambah baik, mengubah suai atau menghentikan ciri di mana ia munasabah dan perlu. Jika kami membuang sesuatu ciri penting yang disertakan dalam BookFlow Pro, kami akan berusaha memberi anda notis yang munasabah, dan anda boleh membatalkan langganan anda melalui gedung.',
        },
      ],
    },
    {
      id: 'data-backups',
      title: '20. Data dan Sandaran',
      blocks: [
        {
          type: 'paragraph',
          text: 'Ruang kerja anda disimpan ke akaun BookFlow anda. Pelanggan langganan BookFlow Pro boleh mengeksport laporan dan mencipta fail sandaran ruang kerja yang boleh mereka simpan dan pulihkan kemudian.',
        },
        { type: 'action', label: 'Eksport data & laporan', action: 'exportData' },
        {
          type: 'paragraph',
          text: 'Invois yang anda pindahkan ke Tong sampah boleh dipulihkan selama 30 hari, selepas itu ia dibuang secara kekal. Selain itu, BookFlow tidak dapat menjamin bahawa rekod yang dipadam atau hilang boleh dipulihkan. Kami menggalakkan anda menyimpan salinan sendiri bagi rekod perniagaan yang penting.',
        },
        {
          type: 'paragraph',
          text: 'BookFlow bukan perkhidmatan arkib atau penyimpanan rekod yang direka untuk memenuhi keperluan pengekalan undang-undang. Anda bertanggungjawab untuk menyimpan rekod selama mana yang dikehendaki oleh undang-undang.',
        },
      ],
    },
    {
      id: 'suspension',
      title: '21. Penggantungan atau Penamatan',
      blocks: [
        {
          type: 'paragraph',
          text: 'Kami mungkin menyekat atau menggantung akses kepada BookFlow di mana ia munasabah dan perlu — sebagai contoh, bagi pelanggaran serius terhadap Terma ini, penipuan, ancaman keselamatan, penggunaan yang menyalahi undang-undang atau penyalahgunaan perkhidmatan. Di mana bersesuaian dan sah dari segi undang-undang, kami akan memberitahu anda sebabnya dan memberi anda peluang untuk memberi respons. Kami tidak akan menggantung atau menamatkan akaun secara sewenang-wenangnya.',
        },
        { type: 'paragraph', text: 'Anda boleh berhenti menggunakan BookFlow pada bila-bila masa.' },
      ],
    },
    {
      id: 'deletion',
      title: '22. Pemadaman Akaun',
      blocks: [
        {
          type: 'paragraph',
          text: 'Anda boleh memadamkan akaun anda di Tetapan > Keselamatan & privasi > Padam akaun. Memadamkan akaun anda membuang secara kekal akaun BookFlow anda dan data ruang kerja BookFlow anda, termasuk pelanggan, tempahan, invois, rekod pembayaran, pendapatan dan perbelanjaan anda. Ia tidak boleh dibatalkan, jadi eksport apa-apa yang anda ingin simpan terlebih dahulu.',
        },
        {
          type: 'paragraph',
          text: 'Memadamkan akaun BookFlow anda tidak membatalkan langganan yang dibilkan oleh Apple atau Google. Dasar Privasi menerangkan cara maklumat peribadi dikendalikan apabila sesuatu akaun dipadamkan.',
        },
        { type: 'action', label: 'Buka Keselamatan & privasi', action: 'securityPrivacy' },
        { type: 'action', label: 'Dasar Privasi', action: 'privacyPolicy' },
      ],
    },
    {
      id: 'disclaimers',
      title: '23. Penafian',
      blocks: [
        {
          type: 'paragraph',
          text: 'BookFlow disediakan sebagai perkhidmatan produktiviti dan pengurusan perniagaan. Setakat yang dibenarkan oleh undang-undang yang terpakai, kami tidak menjamin:',
        },
        {
          type: 'bullets',
          items: [
            'Bahawa BookFlow akan bebas daripada gangguan atau ralat',
            'Ketepatan maklumat yang dimasukkan oleh anda atau sesiapa sahaja',
            'Bahawa invois akan menghasilkan pembayaran',
            'Sebarang hasil perniagaan, hasil jualan atau keuntungan tertentu',
            'Bahawa BookFlow atau laporannya memenuhi kewajipan cukai atau perakaunan anda',
          ],
        },
        {
          type: 'paragraph',
          text: 'Tiada apa-apa dalam Terma ini yang mengecualikan atau menghadkan sebarang hak atau jaminan yang anda miliki di bawah undang-undang yang terpakai yang tidak boleh dikecualikan atau dihadkan, termasuk di bawah undang-undang perlindungan pengguna Malaysia di mana ia terpakai.',
        },
      ],
    },
    {
      id: 'liability',
      title: '24. Had Liabiliti',
      blocks: [
        {
          type: 'paragraph',
          text: 'Setakat yang dibenarkan oleh undang-undang yang terpakai, BookFlow tidak bertanggungjawab atas kerugian tidak langsung atau berbangkit, atau kerugian yang timbul daripada perkara di luar kawalan munasabah kami atau daripada perniagaan dan hubungan pelanggan anda sendiri, seperti:',
        },
        {
          type: 'bullets',
          items: [
            'Kehilangan peluang perniagaan',
            'Pertikaian antara anda dan pelanggan anda',
            'Maklumat tidak tepat yang dimasukkan oleh anda',
            'Kegagalan pelanggan untuk membayar',
            'Gangguan perkhidmatan pihak ketiga',
          ],
        },
        {
          type: 'paragraph',
          text: 'Tiada apa-apa dalam Terma ini yang menghadkan liabiliti kami di mana ia tidak boleh dihadkan di bawah undang-undang yang terpakai, termasuk bagi penipuan kami sendiri atau bagi kerugian yang disebabkan oleh kecuaian kami di mana undang-undang tidak membenarkan liabiliti tersebut dikecualikan.',
        },
      ],
    },
    {
      id: 'governing-law',
      title: '25. Undang-Undang Yang Mentadbir',
      blocks: [
        {
          type: 'paragraph',
          text: 'Terma ini ditadbir oleh undang-undang Malaysia, tanpa menjejaskan sebarang hak mandatori yang mungkin anda miliki di bawah undang-undang yang terpakai kepada anda. Jika anda mempunyai sebarang kebimbangan, sila hubungi kami terlebih dahulu supaya kami dapat cuba menyelesaikannya.',
        },
      ],
    },
    {
      id: 'changes',
      title: '26. Perubahan kepada Terma Ini',
      blocks: [
        {
          type: 'paragraph',
          text: 'Kami mungkin mengemas kini Terma ini apabila BookFlow, perniagaan kami atau keperluan yang terpakai berubah. Tarikh “Kemas kini terakhir” di bahagian atas menunjukkan bila ia terakhir berubah. Jika kami membuat perubahan yang material, kami akan memberitahu anda melalui aplikasi atau cara lain yang sesuai sebelum ia berkuat kuasa, di mana ia dikehendaki. Jika anda tidak bersetuju dengan Terma yang dikemas kini, anda boleh berhenti menggunakan BookFlow dan memadamkan akaun anda.',
        },
      ],
    },
    {
      id: 'privacy',
      title: '27. Privasi',
      blocks: [
        {
          type: 'paragraph',
          text: 'Dasar Privasi kami menerangkan cara kami mengumpul, menggunakan dan melindungi maklumat apabila anda menggunakan BookFlow.',
        },
        { type: 'action', label: 'Dasar Privasi', action: 'privacyPolicy' },
      ],
    },
    {
      id: 'contact',
      title: '28. Hubungi Kami',
      blocks: [
        {
          type: 'paragraph',
          text: 'Jika anda mempunyai soalan tentang Terma ini, hubungi kami melalui e-mel atau melalui Bantuan & sokongan dalam aplikasi BookFlow.',
        },
        { type: 'email', label: 'E-mel', address: SUPPORT_EMAIL },
        { type: 'action', label: 'Hubungi sokongan', action: 'contactSupport' },
      ],
    },
  ],
};
