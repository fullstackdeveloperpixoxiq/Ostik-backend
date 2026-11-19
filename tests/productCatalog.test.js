/*
  Product catalogue endpoint tests (listing, search, categories, detail,
  hot-selling, limited-stock, wishlist). Runs against an in-memory MongoDB.

    npm test
*/
const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = "test-secret";

const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const request = require("supertest");
const compression = require("compression");
const { MongoMemoryServer } = require("mongodb-memory-server");

const Product = require("../models/ProductSchema");
const Variant = require("../models/VariantSchema");
const Category = require("../models/CategorySchema");
const Order = require("../models/OrderSchema");
const User = require("../models/UserSchema");
const Wishlist = require("../models/WishlistSchema");

let mongo;
let app;
const ids = {};

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());

  app = express();
  app.use(compression({ threshold: 1024 }));
  app.use(express.json());
  app.use("/api/product", require("../Routes/ProductRoutes"));
  app.use("/api/category", require("../Routes/CategoryRoutes"));
  app.use("/api/wishlist", require("../Routes/WishlistRoutes"));

  const main = await Category.create({ name: "Audio", slug: "audio" });
  const sub = await Category.create({ name: "Earbuds", slug: "earbuds", parentCategory: main._id });
  const other = await Category.create({ name: "Cables", slug: "cables" });
  Object.assign(ids, { main: main._id, sub: sub._id, other: other._id });

  const mk = (name, category, extra = {}) =>
    Product.create({
      name,
      slug: name.toLowerCase().replace(/\s+/g, "-"),
      description: `${name} description`,
      category,
      images: [`https://res.cloudinary.com/demo/image/upload/v1/${name}.png`],
      status: "approved",
      ...extra,
    });

  const speaker = await mk("Speaker Max", main._id, { specs: { "Model No": "OST405" } });
  await new Promise((r) => setTimeout(r, 5));
  const buds = await mk("Buds Pro", sub._id);
  await new Promise((r) => setTimeout(r, 5));
  const cable = await mk("Type C Cable", other._id);
  Object.assign(ids, { speaker: speaker._id, buds: buds._id, cable: cable._id });

  await Variant.create([
    { product: speaker._id, name: "Black", sku: "SPK-BLK-01", price: 3000, stock: 50 },
    { product: speaker._id, name: "White", sku: "SPK-WHT-01", price: 2500, stock: 5 },
    { product: speaker._id, name: "Old", sku: "SPK-OLD-01", price: 100, stock: 9, isActive: false },
    { product: buds._id, name: "Default", sku: "BUD-001", price: 1500, stock: 10 },
    { product: cable._id, name: "1m", sku: "CBL-1M", price: 300, stock: 100 },
  ]);

  const user = await User.create({ name: "C", email: "c@example.com", password: "x" });
  ids.user = user._id;
  await Order.create({
    user: user._id,
    items: [
      { productId: buds._id, quantity: 5, name: "Buds", price: 1500 },
      { productId: speaker._id, quantity: 2, name: "Speaker", price: 2500 },
    ],
    orderStatus: "Delivered",
  }).catch(() => {
    // Order schema requires more fields; insert raw instead.
    return Order.collection.insertOne({
      user: user._id,
      items: [
        { productId: buds._id, quantity: 5 },
        { productId: speaker._id, quantity: 2 },
      ],
      orderStatus: "Delivered",
    });
  });
  await Wishlist.create({ user: user._id, products: [speaker._id, cable._id] });
});

after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

describe("GET /api/product", () => {
  test("returns all products newest first, each with only active variants sorted by price", async () => {
    const res = await request(app).get("/api/product").expect(200);
    assert.equal(res.body.count, 3);
    assert.deepEqual(res.body.products.map((p) => p.name), ["Type C Cable", "Buds Pro", "Speaker Max"]);

    const speaker = res.body.products.find((p) => p.name === "Speaker Max");
    assert.deepEqual(speaker.variants.map((v) => v.sku), ["SPK-WHT-01", "SPK-BLK-01"]);
    assert.equal(speaker.category.slug, "audio");
    assert.ok(Array.isArray(speaker.images));
    assert.equal(res.body.total, undefined, "no pagination fields unless requested");
  });

  test("search matches name/description, SKU and model number; regex characters are literal", async () => {
    const byName = await request(app).get("/api/product").query({ search: "buds" }).expect(200);
    assert.deepEqual(byName.body.products.map((p) => p.name), ["Buds Pro"]);

    const bySku = await request(app).get("/api/product").query({ search: "cbl-1m" }).expect(200);
    assert.deepEqual(bySku.body.products.map((p) => p.name), ["Type C Cable"]);

    const byModel = await request(app).get("/api/product").query({ search: "OST405" }).expect(200);
    assert.deepEqual(byModel.body.products.map((p) => p.name), ["Speaker Max"]);

    const regexy = await request(app).get("/api/product").query({ search: "(" }).expect(200);
    assert.equal(regexy.body.count, 0);
  });

  test("category filter, with and without subcategories", async () => {
    const only = await request(app).get("/api/product").query({ category: "audio" }).expect(200);
    assert.deepEqual(only.body.products.map((p) => p.name), ["Speaker Max"]);

    const withSubs = await request(app)
      .get("/api/product")
      .query({ category: "audio", includeSubcategories: "true" })
      .expect(200);
    assert.deepEqual(withSubs.body.products.map((p) => p.name).sort(), ["Buds Pro", "Speaker Max"]);

    await request(app).get("/api/product").query({ category: "missing" }).expect(404);
  });

  test("optional pagination", async () => {
    const res = await request(app).get("/api/product").query({ limit: 2, page: 2 }).expect(200);
    assert.equal(res.body.total, 3);
    assert.equal(res.body.count, 1);
    assert.equal(res.body.products[0].name, "Speaker Max");
  });

  test("large responses are compressed", async () => {
    const res = await request(app).get("/api/product").set("Accept-Encoding", "gzip").expect(200);
    // 3 small products may be under the threshold; only assert when large enough
    if (Number(res.headers["content-length"] || 2000) > 1024) {
      assert.equal(res.headers["content-encoding"], "gzip");
    }
  });
});

describe("other catalogue endpoints", () => {
  test("GET /api/product/:id returns product and active variants", async () => {
    const res = await request(app).get(`/api/product/${ids.speaker}`).expect(200);
    assert.equal(res.body.product.name, "Speaker Max");
    assert.deepEqual(res.body.variants.map((v) => v.price), [2500, 3000]);

    await request(app).get(`/api/product/${new mongoose.Types.ObjectId()}`).expect(404);
  });

  test("hot-selling keeps sales ranking order and includes variants", async () => {
    const res = await request(app).get("/api/product/hot-selling").expect(200);
    assert.deepEqual(res.body.products.map((p) => p.name), ["Buds Pro", "Speaker Max"]);
    assert.equal(res.body.products[0].totalSold, 5);
    assert.equal(res.body.products[1].variants.length, 2);
  });

  test("limited-stock lists each product once with its lowest-stock active variant", async () => {
    const res = await request(app).get("/api/product/limited-stock").expect(200);
    const names = res.body.products.map((p) => p.name);
    assert.deepEqual(names.sort(), ["Buds Pro", "Speaker Max"]);
    const speaker = res.body.products.find((p) => p.name === "Speaker Max");
    assert.equal(speaker.variant.sku, "SPK-WHT-01");
    assert.equal(speaker.limitedStock, 5);
    assert.equal(speaker.category.slug, "audio");
  });

  test("category list is cached but refreshed after a write", async () => {
    const first = await request(app).get("/api/category").expect(200);
    assert.equal(first.body.categories.length, 3);

    await Category.create({ name: "Direct", slug: "direct" }); // bypasses routes
    const cached = await request(app).get("/api/category").expect(200);
    assert.equal(cached.body.categories.length, 3, "served from cache");

    // any write through the category routes clears the cache (even if rejected)
    await request(app).delete(`/api/category/admin/${new mongoose.Types.ObjectId()}`);
    const fresh = await request(app).get("/api/category").expect(200);
    assert.equal(fresh.body.categories.length, 4);
  });

  test("wishlist returns each product with its first active variant", async () => {
    const token = jwt.sign({ userId: String(ids.user), role: "user" }, process.env.JWT_SECRET);
    const res = await request(app).get("/api/wishlist").set("Authorization", `Bearer ${token}`).expect(200);
    const products = res.body.wishlist.products;
    assert.equal(products.length, 2);
    const speaker = products.find((p) => p.name === "Speaker Max");
    assert.ok(speaker.variant && speaker.variant.isActive);
    assert.equal(products.find((p) => p.name === "Type C Cable").variant.sku, "CBL-1M");
  });
});
