const Variant = require("../models/VariantSchema");
const Product = require("../models/ProductSchema");


//admin side
const CreateVariant = async (req, res) => {
  try {
    console.log("CONTENT TYPE:", req.headers["content-type"]);
    console.log("REQ BODY:", req.body);
    console.log("REQ FILES:", req.files);
    const {
      product,
      name,
      sku,
      price,
      discountPercent,
      stock,
      images,
    } = req.body;

    // Required fields
    if (!product || !name || !sku || price === undefined || stock === undefined) {
      return res.status(400).json({
        message: "Product, name, SKU, price and stock are required",
      });
    }

    // Check product exists
    const existingProduct = await Product.findById(product);

    if (!existingProduct) {
      return res.status(404).json({
        message: "Product not found",
      });
    }

    // Check duplicate SKU
    const existingSKU = await Variant.findOne({ sku });

    if (existingSKU) {
      return res.status(409).json({
        message: "SKU already exists",
      });
    }

    const variant = await Variant.create({
      product,
      name,
      sku,
      price,
      discountPercent,
      stock,
      images,
    });

    return res.status(201).json({
      message: "Variant created successfully",
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



const UpdateVariant = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      name,
      sku,
      price,
      discountPercent,
      stock,
      images,
      isActive,
    } = req.body;

    const variant = await Variant.findById(id);

    if (!variant) {
      return res.status(404).json({
        message: "Variant not found",
      });
    }

    // Check SKU duplication
    if (sku && sku !== variant.sku) {
      const existingSKU = await Variant.findOne({
        sku,
        _id: { $ne: id },
      });

      if (existingSKU) {
        return res.status(409).json({
          message: "SKU already exists",
        });
      }
    }

    variant.name = name ?? variant.name;
    variant.sku = sku ?? variant.sku;
    variant.price = price ?? variant.price;
    variant.discountPercent =
      discountPercent ?? variant.discountPercent;
    variant.stock = stock ?? variant.stock;
    variant.images = images ?? variant.images;
    variant.isActive = isActive ?? variant.isActive;

    await variant.save();

    return res.status(200).json({
      message: "Variant updated successfully",
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




const DeleteVariant = async (req, res) => {
  try {
    const { id } = req.params;

    const variant = await Variant.findById(id);

    if (!variant) {
      return res.status(404).json({
        message: "Variant not found",
      });
    }

    await Variant.findByIdAndDelete(id);

    return res.status(200).json({
      message: "Variant deleted successfully",
    });

  } catch (err) {
    console.log(err);

    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};



const GetAllVariants = async (req, res) => {
  try {

    const variants = await Variant.find()
      .populate("product", "name slug")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      message: "Variants fetched successfully",
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


//user side

const GetProductVariants = async (req, res) => {
  try {
    const { productId } = req.params;

    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({
        message: "Product not found",
      });
    }

    const variants = await Variant.find({
      product: productId,
      isActive: true,
    });

    return res.status(200).json({
      message: "Product variants fetched successfully",
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



const GetSingleVariant = async (req, res) => {
  try {
    const { id } = req.params;

    const variant = await Variant.findOne({
      _id: id,
      isActive: true,
    }).populate("product", "name slug");

    if (!variant) {
      return res.status(404).json({
        message: "Variant not found",
      });
    }

    return res.status(200).json({
      message: "Variant fetched successfully",
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


module.exports = {CreateVariant,UpdateVariant,DeleteVariant,GetAllVariants,GetProductVariants,GetSingleVariant};