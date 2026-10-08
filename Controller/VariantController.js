const Variant = require("../models/VariantSchema");
const Product = require("../models/ProductSchema");
const cloudinary = require("../Config/Cloudinary");


// =========================================================
// CREATE VARIANT - ADMIN
// =========================================================
const CreateVariant = async (req, res) => {
  try {
    const {
      product,
      name,
      sku,
      price,
      discountPercent,
      stock,
      isActive,
    } = req.body;

    // Required fields
    if (
      !product ||
      !name ||
      !sku ||
      price === undefined ||
      stock === undefined
    ) {
      return res.status(400).json({
        message:
          "Product, name, SKU, price and stock are required",
      });
    }

    // Check product
    const existingProduct =
      await Product.findById(product);

    if (!existingProduct) {
      return res.status(404).json({
        message: "Product not found",
      });
    }

    // Normalize SKU
    const normalizedSKU =
      sku.trim().toUpperCase();

    // Check duplicate SKU
    const existingSKU =
      await Variant.findOne({
        sku: normalizedSKU,
      });

    if (existingSKU) {
      return res.status(409).json({
        message: "SKU already exists",
      });
    }

    // =====================================================
    // UPLOAD VARIANT IMAGES
    // =====================================================

    let uploadedImages = [];

    if (
      req.files &&
      req.files.length > 0
    ) {
      uploadedImages = await Promise.all(
        req.files.map((file) => {
          return new Promise(
            (resolve, reject) => {
              const stream =
                cloudinary.uploader.upload_stream(
                  {
                    folder:
                      "ostik/variants",
                    resource_type:
                      "image",
                  },
                  (
                    error,
                    result
                  ) => {
                    if (error) {
                      reject(error);
                    } else {
                      resolve(
                        result.secure_url
                      );
                    }
                  }
                );

              stream.end(
                file.buffer
              );
            }
          );
        })
      );
    }

    // =====================================================
    // CREATE VARIANT
    // =====================================================

    const variant =
      await Variant.create({
        product,
        name: name.trim(),
        sku: normalizedSKU,
        price: Number(price),
        discountPercent:
          discountPercent !== undefined
            ? Number(discountPercent)
            : 0,
        stock: Number(stock),
        images: uploadedImages,
        isActive:
          isActive === undefined
            ? true
            : isActive === "true" ||
              isActive === true,
      });

    return res.status(201).json({
      message:
        "Variant created successfully",
      variant,
    });
  } catch (err) {
    console.log(
      "CreateVariant ERROR:",
      err
    );

    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};


// =========================================================
// GET ALL VARIANTS - ADMIN
// =========================================================
const GetAllVariants = async (
  req,
  res
) => {
  try {
    const variants =
      await Variant.find()
        .populate(
          "product",
          "name slug"
        )
        .sort({
          createdAt: -1,
        });

    return res.status(200).json({
      message:
        "Variants fetched successfully",
      count: variants.length,
      variants,
    });
  } catch (err) {
    console.log(err);

    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};


// =========================================================
// GET SINGLE VARIANT - ADMIN
// =========================================================
const GetAdminVariant = async (
  req,
  res
) => {
  try {
    const { id } = req.params;

    const variant =
      await Variant.findById(id).populate(
        "product",
        "name slug images"
      );

    if (!variant) {
      return res.status(404).json({
        message: "Variant not found",
      });
    }

    return res.status(200).json({
      message:
        "Variant fetched successfully",
      variant,
    });
  } catch (err) {
    console.log(
      "GetAdminVariant ERROR:",
      err
    );

    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};


// =========================================================
// UPDATE VARIANT - ADMIN
// =========================================================
const UpdateVariant = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      name,
      sku,
      price,
      discountPercent,
      stock,
      isActive,
      existingImages,
    } = req.body;

    // =====================================================
    // FIND VARIANT
    // =====================================================

    const variant = await Variant.findById(id);

    if (!variant) {
      return res.status(404).json({
        message: "Variant not found",
      });
    }

    // =====================================================
    // EXISTING IMAGES
    // =====================================================

    let remainingImages = [];

    if (existingImages !== undefined) {
      try {
        remainingImages = JSON.parse(existingImages);

        // Make sure it is an array
        if (!Array.isArray(remainingImages)) {
          return res.status(400).json({
            message: "Invalid existing image data",
          });
        }
      } catch (error) {
        return res.status(400).json({
          message: "Invalid existing image data",
        });
      }
    } else {
      // If frontend doesn't send existingImages,
      // keep the current images
      remainingImages = variant.images || [];
    }

    // =====================================================
    // SKU
    // =====================================================

    if (sku !== undefined) {
      const normalizedSKU = sku.trim().toUpperCase();

      if (normalizedSKU !== variant.sku) {
        const existingSKU = await Variant.findOne({
          sku: normalizedSKU,
          _id: { $ne: id },
        });

        if (existingSKU) {
          return res.status(409).json({
            message: "SKU already exists",
          });
        }

        variant.sku = normalizedSKU;
      }
    }

    // =====================================================
    // BASIC FIELDS
    // =====================================================

    if (name !== undefined) {
      variant.name = name.trim();
    }

    if (price !== undefined) {
      variant.price = Number(price);
    }

    if (discountPercent !== undefined) {
      variant.discountPercent =
        Number(discountPercent);
    }

    if (stock !== undefined) {
      variant.stock = Number(stock);
    }

    if (isActive !== undefined) {
      variant.isActive =
        isActive === "true" ||
        isActive === true;
    }

    // =====================================================
    // UPDATE IMAGES
    // =====================================================

    let finalImages = [...remainingImages];

    // Upload newly selected images
    if (req.files && req.files.length > 0) {
      const newImages = await Promise.all(
        req.files.map((file) => {
          return new Promise((resolve, reject) => {
            const stream =
              cloudinary.uploader.upload_stream(
                {
                  folder: "ostik/variants",
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

      // Keep remaining existing images
      // and add newly uploaded images
      finalImages = [
        ...remainingImages,
        ...newImages,
      ];
    }

    // =====================================================
    // MAXIMUM 5 IMAGES
    // =====================================================

    if (finalImages.length > 5) {
      return res.status(400).json({
        message: "Maximum 5 images are allowed",
      });
    }

    // Save final image list
    variant.images = finalImages;

    // =====================================================
    // SAVE VARIANT
    // =====================================================

    await variant.save();

    return res.status(200).json({
      message: "Variant updated successfully",
      variant,
    });
  } catch (err) {
    console.error(
      "UpdateVariant ERROR:",
      err
    );

    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};


// =========================================================
// DELETE VARIANT - ADMIN
// =========================================================
const DeleteVariant = async (
  req,
  res
) => {
  try {
    const { id } = req.params;

    const variant =
      await Variant.findById(id);

    if (!variant) {
      return res.status(404).json({
        message: "Variant not found",
      });
    }

    await Variant.findByIdAndDelete(
      id
    );

    return res.status(200).json({
      message:
        "Variant deleted successfully",
    });
  } catch (err) {
    console.log(err);

    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};


// =========================================================
// GET PRODUCT VARIANTS - USER
// =========================================================
const GetProductVariants = async (
  req,
  res
) => {
  try {
    const { productId } =
      req.params;

    const product =
      await Product.findById(
        productId
      );

    if (!product) {
      return res.status(404).json({
        message: "Product not found",
      });
    }

    const variants =
      await Variant.find({
        product: productId,
        isActive: true,
      });

    return res.status(200).json({
      message:
        "Product variants fetched successfully",
      variants,
    });
  } catch (err) {
    console.log(err);

    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};


// =========================================================
// GET SINGLE VARIANT - USER
// =========================================================
const GetSingleVariant = async (
  req,
  res
) => {
  try {
    const { id } = req.params;

    const variant =
      await Variant.findOne({
        _id: id,
        isActive: true,
      }).populate(
        "product",
        "name slug"
      );

    if (!variant) {
      return res.status(404).json({
        message: "Variant not found",
      });
    }

    return res.status(200).json({
      message:
        "Variant fetched successfully",
      variant,
    });
  } catch (err) {
    console.log(err);

    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};


module.exports = {CreateVariant,GetAllVariants,GetAdminVariant,UpdateVariant,DeleteVariant,
  GetProductVariants,GetSingleVariant,};