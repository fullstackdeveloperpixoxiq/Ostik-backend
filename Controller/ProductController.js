const ProductSchema = require("../models/ProductSchema");
const Variant = require("../models/VariantSchema");
const Order = require("../models/OrderSchema");
const cloudinary = require("../Config/Cloudinary");
const memoryCache = require("../Utils/memoryCache");
const { findProductIdsByModel } = require("../Services/ChatbotDataService");

const HOT_SELLING_RANKING_TTL = 5 * 60 * 1000;


// CREATE PRODUCT

const CreateProduct = async (req, res) => {
  try {

    console.log("BODY:", req.body);
    console.log("FILES:", req.files);

    const {
      name,
      slug,
      description,
      category,
      specs,
      isFeatured,
      isNewArrival,
      status,
    } = req.body;


    // Check required fields
    if (!name || !slug || !description || !category) {
      return res.status(400).json({
        message: "Name, slug, description and category are required",
      });
    }


    // Check existing slug
    const existingSlug = await ProductSchema.findOne({ slug });

    if (existingSlug) {
      return res.status(400).json({
        message: "Product with this slug already exists",
      });
    }


    // Check images
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        message: "At least one product image is required",
      });
    }


    // Upload images to Cloudinary
    const uploadedImages = await Promise.all(

      req.files.map((file) => {

        return new Promise((resolve, reject) => {

          const stream = cloudinary.uploader.upload_stream(
            {
              folder: "ostik/products",
              resource_type: "image",
            },

            (error, result) => {

              if (error) {
                reject(error);
              } else {
                resolve(result.secure_url);
              }

            }
          );

          stream.end(file.buffer);

        });

      })

    );


    // Create product
    const product = await ProductSchema.create({

      name,
      slug,
      description,
      category,

      images: uploadedImages,

      specs: specs
        ? JSON.parse(specs)
        : {},

      isFeatured:
        isFeatured === "true",

      isNewArrival:
        isNewArrival === "true",

      status:
        status || "pending",
    });


    return res.status(201).json({

      message: "Product created successfully",

      product,

    });


  } catch (err) {

    console.log(err);

    return res.status(500).json({

      message: "Server error",

      error: err.message,

    });

  }
};



// ===============================
// GET ALL PRODUCTS
// ===============================
const escapeRegex = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Fetch active variants for many products in ONE query (instead of one query
// per product) and group them by product id, preserving price order.
const getActiveVariantsByProduct = async (productIds, sort) => {
  const map = new Map(productIds.map((id) => [String(id), []]));
  if (!productIds.length) return map;

  let query = Variant.find({
    product: { $in: productIds },
    isActive: true,
  });
  if (sort) query = query.sort(sort);

  const variants = await query.lean();
  variants.forEach((variant) => {
    map.get(String(variant.product))?.push(variant);
  });
  return map;
};

/*
  Query params (all optional, backwards compatible):
    search               name / description / SKU / model-number match
    category             category slug
    includeSubcategories "true" -> also include active child categories
    limit, page          pagination; when omitted every product is returned
*/
const GetProducts = async (req, res) => {
  try {

    const { category, search, includeSubcategories } = req.query;

    let filter = {};

    //search filter
    if (search && search.trim() !== "") {
      const searchValue = search.trim().slice(0, 100);
      const pattern = escapeRegex(searchValue);

      // SKU (on variants) and model number (inside specs) matches are added
      // to name/description matches, so results only ever grow.
      const [skuProductIds, modelProductIds] = await Promise.all([
        Variant.distinct("product", {
          sku: { $regex: pattern, $options: "i" },
        }),
        findProductIdsByModel(
          { $regex: pattern, $options: "i" },
          {},
          100
        ).catch(() => []),
      ]);

      filter.$or = [
        {
          name: {
            $regex: pattern,
            $options: "i",
          },
        },
        {
          description: {
            $regex: pattern,
            $options: "i",
          },
        },
      ];

      const identifierIds = [...skuProductIds, ...modelProductIds];
      if (identifierIds.length) {
        filter.$or.push({ _id: { $in: identifierIds } });
      }
    }

    // Category slug vannittundenkil
    // aa category mathram filter cheyyum
    if (category) {

      const CategorySchema = require("../models/CategorySchema");

      const categoryData = await CategorySchema.findOne({
        slug: category,
        isActive: true,
      })
        .select("_id")
        .lean();

      if (!categoryData) {
        return res.status(404).json({
          message: "Category not found",
          products: [],
        });
      }

      filter.category = categoryData._id;

      // One request for a main category and all its subcategories
      // (the storefront previously sent one request per subcategory).
      if (includeSubcategories === "true") {
        const children = await CategorySchema.find({
          parentCategory: categoryData._id,
          isActive: true,
        })
          .select("_id")
          .lean();

        if (children.length) {
          filter.category = {
            $in: [categoryData._id, ...children.map((c) => c._id)],
          };
        }
      }
    }

    // Optional pagination
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 0, 0), 100);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

    //get products
    let productQuery = ProductSchema.find(filter)
      .populate("category", "name slug")
      .sort({ createdAt: -1 });

    if (limit) {
      productQuery = productQuery.skip((page - 1) * limit).limit(limit);
    }

    const [products, total] = await Promise.all([
      productQuery.lean(),
      limit ? ProductSchema.countDocuments(filter) : null,
    ]);

    //active variants of all products (single query)
    const variantMap = await getActiveVariantsByProduct(
      products.map((product) => product._id),
      { price: 1, _id: 1 }
    );

    const productsWithVariants = products.map((product) => ({
      ...product,
      variants: variantMap.get(String(product._id)) || [],
    }));

    return res.status(200).json({
      message: "Products fetched successfully",
      count: productsWithVariants.length,
      ...(limit ? { total, page, limit } : {}),
      products: productsWithVariants,
    });
  } catch (err) {

    console.log(err);

    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });

  }
};



// ===============================
// GET SINGLE PRODUCT
// ===============================
const GetProduct = async (req, res) => {
  try {

    const { id } = req.params;


    // Product and its active variants are independent lookups -> run in parallel.
    const [product, variants] = await Promise.all([
      ProductSchema.findById(id)
        .populate("category", "name slug")
        .lean(),
      Variant.find({
        product: id,
        isActive: true,
      })
        .sort({ price: 1, _id: 1 })
        .lean(),
    ]);


    if (!product) {

      return res.status(404).json({
        message: "Product not found",

      });
    }

    return res.status(200).json({

      message: "Product fetched successfully",

      product,
      variants

    });


  } catch (err) {

    console.log(err);

    return res.status(500).json({

      message: "Server error",

      error: err.message,

    });

  }
};



// ===============================
// UPDATE PRODUCT
// ===============================
const UpdateProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      name,
      slug,
      description,
      category,
      specs,
      isFeatured,
      isNewArrival,
      status,
    } = req.body;

    // =========================================
    // FIND PRODUCT
    // =========================================

    const product = await ProductSchema.findById(id);

    if (!product) {
      return res.status(404).json({
        message: "Product not found",
      });
    }

    // =========================================
    // CHECK DUPLICATE SLUG
    // =========================================

    if (slug && slug !== product.slug) {
      const existingProduct = await ProductSchema.findOne({
        slug,
        _id: { $ne: id },
      });

      if (existingProduct) {
        return res.status(400).json({
          message: "A product with this slug already exists",
        });
      }
    }

    // =========================================
    // UPDATE BASIC PRODUCT DETAILS
    // =========================================

    if (name !== undefined) {
      product.name = name;
    }

    if (slug !== undefined) {
      product.slug = slug;
    }

    if (description !== undefined) {
      product.description = description;
    }

    if (category !== undefined) {
      product.category = category;
    }

    if (specs !== undefined) {
      try {
        product.specs =
          typeof specs === "string"
            ? JSON.parse(specs)
            : specs;
      } catch (error) {
        return res.status(400).json({
          message: "Invalid specs data",
        });
      }
    }

    if (isFeatured !== undefined) {
      product.isFeatured =
        isFeatured === true || isFeatured === "true";
    }

    if (isNewArrival !== undefined) {
      product.isNewArrival =
        isNewArrival === true || isNewArrival === "true";
    }

    if (status !== undefined) {
      product.status = status;
    }

    // =========================================
    // UPDATE PRODUCT IMAGES
    // =========================================

    let existingImages = null;

    /*
      Frontend sends:
      existingImages = JSON.stringify(existingImages)

      Example:
      [
        "image1.jpg",
        "image3.jpg"
      ]

      If image2 was removed using ×,
      it will not be present here.
    */

    if (req.body.existingImages !== undefined) {
      try {
        existingImages = JSON.parse(
          req.body.existingImages
        );

        if (!Array.isArray(existingImages)) {
          return res.status(400).json({
            message: "Invalid existingImages data",
          });
        }
      } catch (error) {
        return res.status(400).json({
          message: "Invalid existingImages data",
        });
      }
    }

    // =========================================
    // DELETE REMOVED IMAGES FROM CLOUDINARY
    // =========================================

    if (existingImages !== null) {
      const removedImages = product.images.filter(
        (oldImage) =>
          !existingImages.includes(oldImage)
      );

      if (removedImages.length > 0) {
        await Promise.all(
          removedImages.map(async (imageUrl) => {
            try {
              /*
                Cloudinary URL example:

                https://res.cloudinary.com/xxx/image/upload/v1234567890/ostik/products/image.jpg

                We need:
                ostik/products/image
              */

              const match = imageUrl.match(
                /\/upload\/(?:v\d+\/)?(.+?)(?:\.[^./]+)?$/
              );

              if (!match) {
                console.log(
                  "Could not extract Cloudinary public ID:",
                  imageUrl
                );
                return;
              }

              const publicId = match[1];

              console.log(
                "Deleting Cloudinary image:",
                publicId
              );

              await cloudinary.uploader.destroy(
                publicId,
                {
                  resource_type: "image",
                }
              );
            } catch (error) {
              console.log(
                "Failed to delete Cloudinary image:",
                error.message
              );
            }
          })
        );
      }
    }

    // =========================================
    // UPLOAD NEW IMAGES
    // =========================================

    let uploadedImages = [];

    if (req.files && req.files.length > 0) {
      uploadedImages = await Promise.all(
        req.files.map((file) => {
          return new Promise((resolve, reject) => {
            const stream =
              cloudinary.uploader.upload_stream(
                {
                  folder: "ostik/products",
                  resource_type: "image",
                },
                (error, result) => {
                  if (error) {
                    reject(error);
                  } else {
                    resolve(result.secure_url);
                  }
                }
              );

            stream.end(file.buffer);
          });
        })
      );
    }

    // =========================================
    // SAVE FINAL IMAGE ARRAY
    // =========================================

    /*
      IMPORTANT:

      This is OUTSIDE the req.files condition.

      So even when user only removes an old image
      and does not upload a new one,
      MongoDB will still be updated.
    */

    if (existingImages !== null) {
      product.images = [
        ...existingImages,
        ...uploadedImages,
      ];
    }

    // =========================================
    // SAVE PRODUCT
    // =========================================

    await product.save();

    // =========================================
    // RESPONSE
    // =========================================

    return res.status(200).json({
      message: "Product updated successfully",
      product,
    });
  } catch (err) {
    console.log("UpdateProduct Error:", err);

    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};


// ===============================
// DELETE PRODUCT
// ===============================
const DeleteProduct = async (req, res) => {
  try {

    const { id } = req.params;


    const product =
      await ProductSchema.findById(id);


    if (!product) {

      return res.status(404).json({

        message: "Product not found",

      });

    }


    await product.deleteOne();


    return res.status(200).json({

      message:
        "Product deleted successfully",

    });


  } catch (err) {

    console.log(err);

    return res.status(500).json({

      message: "Server error",

      error: err.message,

    });

  }
};



// ===============================
// GET HOT SELLING PRODUCTS
// ===============================
const GetHotSellingProducts = async (req, res) => {
  try {

    // The sales ranking (product ids + units sold only) scans every order, so
    // it is cached briefly. Product details, prices and stock below are
    // always read fresh.
    const hotSelling = await memoryCache.wrap(
      "product:hot-selling-ranking",
      HOT_SELLING_RANKING_TTL,
      () => Order.aggregate([

        {
          $match: {

            orderStatus: {
              $in: [
                "Processing",
                "Shipped",
                "Delivered",
              ],
            },

          },
        },


        {
          $unwind: "$items",
        },


        {
          $group: {

            _id: "$items.productId",

            totalSold: {
              $sum: "$items.quantity",
            },

          },
        },


        {
          $sort: {
            totalSold: -1,
          },
        },


        {
          $limit: 3,
        },

      ])
    );


    if (!hotSelling.length) {

      return res.status(200).json({

        message:
          "No hot selling products yet",

        products: [],

      });

    }


    // 2 queries total instead of 2 per product.
    const rankedIds = hotSelling.map((item) => item._id);

    const [productDocs, variantMap] = await Promise.all([
      ProductSchema.find({
        _id: { $in: rankedIds },
        status: "approved",
      })
        .populate("category", "name slug")
        .lean(),
      getActiveVariantsByProduct(rankedIds),
    ]);

    const productById = new Map(
      productDocs.map((product) => [String(product._id), product])
    );

    // Keep best-seller ranking order
    const validProducts = hotSelling
      .map((item) => {
        const product = productById.get(String(item._id));

        if (!product) {
          return null;
        }

        return {
          ...product,
          totalSold: item.totalSold,
          variants: variantMap.get(String(product._id)) || [],
        };
      })
      .filter((product) => product !== null);


    return res.status(200).json({

      message:
        "Hot selling products fetched successfully",

      count:
        validProducts.length,

      products:
        validProducts,

    });


  } catch (err) {

    console.log(err);

    return res.status(500).json({

      message: "Server error",

      error: err.message,

    });

  }
};



const GetLimitedStockProducts = async (req, res) => {
  try {
    // 1. Low stock variants find cheyyuka
    const lowStockVariants = await Variant.find({
      stock: { $gt: 0, $lte: 15 },
      isActive: true,
    })
      .sort({ stock: 1 })
      .populate({
        path: "product",
        match: { status: "approved" },
        select: "name images category status",
        populate: {
          path: "category",
          select: "name slug",
        },
      })
      .lean();

    // 2. Product illatha variants remove cheyyuka
    const validVariants = lowStockVariants.filter(
      (variant) => variant.product
    );

    // 3. Same product-inu multiple low-stock variants
    // undenkil lowest-stock variant mathram edukkuka
    const productMap = new Map();

    validVariants.forEach((variant) => {
      const productId = variant.product._id.toString();

      if (!productMap.has(productId)) {
        productMap.set(productId, variant);
      }
    });

    // 4. Frontend-inu required format create cheyyuka
    const products = Array.from(productMap.values()).map((variant) => {
      const product = variant.product;

      return {
        _id: product._id,
        name: product.name,
        images: product.images,
        category: product.category,

        // Limited stock quantity
        limitedStock: variant.stock,

        // Display cheyyan selected variant
        variant: {
          _id: variant._id,
          name: variant.name,
          sku: variant.sku,
          price: variant.price,
          discountPercent: variant.discountPercent,
          stock: variant.stock,
          images: variant.images,
          isActive: variant.isActive,
        },
      };
    });

    return res.status(200).json({
      message: "Limited stock products fetched successfully",
      count: products.length,
      products,
    });
  } catch (err) {
    console.log(err);

    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};


module.exports = {CreateProduct,GetProducts,GetProduct,UpdateProduct,DeleteProduct,
                  GetHotSellingProducts,GetLimitedStockProducts};