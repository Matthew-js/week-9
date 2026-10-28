// order-service (port 3001) - pemilik data PESANAN.
// Service ini TIDAK memegang data produk. Untuk cek & kurangi stok, ia memanggil
// POST /products/:id/reserve milik product-service lewat HTTP (timeout 2 detik).
// Data disimpan di memori: kembali kosong setiap service dinyalakan ulang.
const express = require('express');

const app = express();
app.use(express.json());

// Alamat product-service (langsung, bukan lewat gateway)
const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3000';
const TIMEOUT_MS = 2000;

const orders = [];

// Memanggil endpoint reserve di product-service. Melempar error jika tidak terjangkau/timeout.
async function reserveStock(productId, quantity) {
  const res = await fetch(`${PRODUCT_SERVICE_URL}/products/${productId}/reserve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quantity }),
    signal: AbortSignal.timeout(TIMEOUT_MS), // batal otomatis setelah 2 detik
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

// GET /health -> cek service hidup
app.get('/health', (req, res) => {
  res.json({ service: 'order-service', status: 'ok' });
});

// GET /orders -> daftar pesanan. Tidak memanggil product-service, jadi tetap 200 walau product-service mati.
app.get('/orders', (req, res) => {
  res.json(orders);
});

// GET /orders/:id -> detail pesanan
app.get('/orders/:id', (req, res) => {
  const order = orders.find((o) => o.id === Number(req.params.id));
  if (!order) return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
  res.json(order);
});

// POST /orders -> buat pesanan. Body: { "productId": 1, "quantity": 2 }
//   201 = berhasil | 400 = body salah | 404 = produk tidak ada | 409 = stok tidak cukup
//   502 = respons product-service tidak terduga | 503 = product-service tidak dapat dihubungi
app.post('/orders', async (req, res) => {
  const { productId, quantity } = req.body || {};
  if (!Number.isInteger(productId) || productId <= 0 || !Number.isInteger(quantity) || quantity <= 0) {
    return res.status(400).json({ error: 'productId dan quantity harus bilangan bulat > 0' });
  }

  let result;
  try {
    result = await reserveStock(productId, quantity);
  } catch (err) {
    // product-service mati, ditolak koneksi, atau tidak menjawab dalam 2 detik
    console.error('Gagal menghubungi product-service:', err.cause?.code || err.name);
    return res.status(503).json({ error: 'product-service tidak dapat dihubungi, coba lagi nanti' });
  }

  if (result.status === 404) return res.status(404).json({ error: 'Produk tidak ditemukan' });
  if (result.status === 409) {
    return res.status(409).json({ error: 'Stok tidak cukup', available: result.data.available });
  }
  if (result.status === 400) return res.status(400).json({ error: 'Permintaan tidak valid' });
  if (!result.ok) {
    return res.status(502).json({ error: 'Respons tidak terduga dari product-service' });
  }

  // Stok sudah dikurangi di product-service; simpan pesanan (dengan salinan nama & harga saat itu)
  const { name, price } = result.data;
  const order = {
    id: orders.length + 1,
    productId,
    productName: name,
    quantity,
    unitPrice: price,
    total: price * quantity,
    status: 'confirmed',
    createdAt: new Date().toISOString(),
  };
  orders.push(order);
  res.status(201).json(order);
});

// 404 untuk route yang tidak dikenal
app.use((req, res) => res.status(404).json({ error: 'Endpoint order-service tidak ditemukan' }));

// Penanganan JSON rusak pada body request
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Body request bukan JSON yang valid' });
  }
  console.error(err);
  res.status(500).json({ error: 'Terjadi kesalahan pada server' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`order-service berjalan di port ${PORT}`));
