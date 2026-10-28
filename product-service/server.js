// product-service (port 3000) - pemilik data PRODUK dan STOK.
// Data disimpan di memori: kembali ke awal setiap service dinyalakan ulang.
const express = require('express');

const app = express();
app.use(express.json());

const products = [
  { id: 1, name: 'Kopi Arabika 250g', price: 85000, stock: 10 },
  { id: 2, name: 'Teh Hijau 100g', price: 45000, stock: 20 },
  { id: 3, name: 'Gula Aren 500g', price: 32000, stock: 5 },
];

const findProduct = (id) => products.find((p) => p.id === Number(id));

// GET /health -> cek service hidup
app.get('/health', (req, res) => {
  res.json({ service: 'product-service', status: 'ok' });
});

// GET /products -> daftar produk beserta stok
app.get('/products', (req, res) => {
  res.json(products);
});

// GET /products/:id -> detail satu produk
app.get('/products/:id', (req, res) => {
  const product = findProduct(req.params.id);
  if (!product) return res.status(404).json({ error: 'Produk tidak ditemukan' });
  res.json(product);
});

// POST /products/:id/reserve -> cek stok DAN kurangi stok (dipanggil order-service)
// Body: { "quantity": 2 }
//   200 = stok berhasil dikurangi | 400 = body salah | 404 = produk tidak ada | 409 = stok tidak cukup
app.post('/products/:id/reserve', (req, res) => {
  const product = findProduct(req.params.id);
  if (!product) return res.status(404).json({ error: 'Produk tidak ditemukan' });

  const { quantity } = req.body || {};
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return res.status(400).json({ error: 'quantity harus bilangan bulat > 0' });
  }
  if (product.stock < quantity) {
    return res.status(409).json({ error: 'Stok tidak cukup', available: product.stock });
  }

  product.stock -= quantity;
  res.json({
    id: product.id,
    name: product.name,
    price: product.price,
    reserved: quantity,
    remainingStock: product.stock,
  });
});

// 404 untuk route yang tidak dikenal
app.use((req, res) => res.status(404).json({ error: 'Endpoint product-service tidak ditemukan' }));

// Penanganan JSON rusak pada body request
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Body request bukan JSON yang valid' });
  }
  console.error(err);
  res.status(500).json({ error: 'Terjadi kesalahan pada server' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`product-service berjalan di port ${PORT}`));
