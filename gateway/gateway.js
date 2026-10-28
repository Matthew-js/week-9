// API Gateway - Lab 09 (Memecah Aplikasi Menjadi Microservices)
// Dasar: gateway Lab 08. Urutan pemrosesan: rate limiting -> routing (proxy)
// Pengecekan API key dari Lab 08 dinonaktifkan di Lab 09.
require('dotenv').config(); // membaca file .env (jika ada) ke process.env

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { rateLimit } = require('express-rate-limit');

const PORT = process.env.PORT || 8080;
const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3000';
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://localhost:3001';

const app = express();
app.disable('x-powered-by');

// trust proxy: jumlah "lompatan" proxy tepercaya di depan gateway.
// - Lokal (tanpa proxy)      : TRUST_PROXY=0 (bawaan)
// - Render / hosting sejenis : TRUST_PROXY=1
app.set('trust proxy', Number(process.env.TRUST_PROXY || 0));

// 1) RATE LIMITING: maks. 20 request per 10 detik per alamat IP. Lewat batas -> HTTP 429.
app.use(
  rateLimit({
    windowMs: 10 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Terlalu banyak request. Coba lagi beberapa detik lagi.' },
  })
);

// Endpoint cek kesehatan gateway (dijawab gateway sendiri, tidak diteruskan ke service)
app.get('/health', (req, res) => res.json({ service: 'gateway', status: 'ok' }));

// 2) ROUTING: teruskan request berdasarkan prefix, lalu buang prefix-nya (pathRewrite).
//    /product-service/products -> product-service menerima /products
//    /order-service/orders     -> order-service menerima /orders
// CATATAN: jangan memasang express.json() sebelum proxy, nanti body POST tidak sampai ke service.
const proxyTo = (prefix, target) =>
  createProxyMiddleware({
    pathFilter: prefix,
    target,
    changeOrigin: true,
    pathRewrite: { [`^${prefix}`]: '' },
  });

app.use(proxyTo('/product-service', PRODUCT_SERVICE_URL));
app.use(proxyTo('/order-service', ORDER_SERVICE_URL));

// Route lain yang tidak dikenal
app.use((req, res) => res.status(404).json({ error: 'Route tidak ditemukan' }));

app.listen(PORT, () => {
  console.log(`Gateway berjalan di port ${PORT}`);
  console.log(`  /product-service/* -> ${PRODUCT_SERVICE_URL}`);
  console.log(`  /order-service/*   -> ${ORDER_SERVICE_URL}`);
});
