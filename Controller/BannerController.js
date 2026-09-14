const Banner = require("../models/BannerSchema");
const cloudinary= require("../Config/Cloudinary")


// =====================================
// CREATE BANNER - ADMIN
// =====================================
const CreateBanner = async (req, res) => {
  try {
    console.log("BODY:", req.body);
    console.log("FILE:", req.file);

    const {
      title,
      subtitle,
      buttonText,
      buttonLink,
      category,
      displayOrder,
    } = req.body;

    // Check title
    if (!title) {
      return res.status(400).json({
        message: "Title is required",
      });
    }

    // Check image
    if (!req.file) {
      return res.status(400).json({
        message: "Banner image is required",
      });
    }

    // Upload image to Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: "ostik/banners",
          resource_type: "image",
        },
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve(result);
          }
        }
      );

      stream.end(req.file.buffer);
    });

    console.log("CLOUDINARY URL:", uploadResult.secure_url);

    // Create banner in MongoDB
    const banner = await Banner.create({
      title,
      subtitle,
      image: uploadResult.secure_url,
      buttonText,
      buttonLink,
      category: category || null,
      displayOrder: displayOrder || 0,
    });

    return res.status(201).json({
      message: "Banner created successfully",
      banner,
    });

  } catch (err) {
    console.log(err);

    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};


// =====================================
// GET ALL BANNERS - ADMIN
// =====================================
const GetAllBanners = async (req, res) => {
  try {
    const banners = await Banner.find()
      .populate("category", "name")
      .sort({ displayOrder: 1 });

    return res.status(200).json({
      message: "Banners fetched successfully",
      banners,
    });

  } catch (err) {
    console.log(err);

    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};


// =====================================
// GET ACTIVE BANNERS - USER
// =====================================
const GetActiveBanners = async (req, res) => {
  try {
    const banners = await Banner.find({
      status: "active",
    })
      .populate("category", "name")
      .sort({ displayOrder: 1 });

    return res.status(200).json({
      message: "Active banners fetched successfully",
      banners,
    });

  } catch (err) {
    console.log(err);

    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};


// =====================================
// UPDATE BANNER - ADMIN
// =====================================
const UpdateBanner = async (req, res) => {
  try {
    const { id } = req.params;

    const banner = await Banner.findByIdAndUpdate(
      id,
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!banner) {
      return res.status(404).json({
        message: "Banner not found",
      });
    }

    return res.status(200).json({
      message: "Banner updated successfully",
      banner,
    });

  } catch (err) {
    console.log(err);

    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};


// =====================================
// DELETE BANNER - ADMIN
// =====================================
const DeleteBanner = async (req, res) => {
  try {
    const { id } = req.params;

    const banner = await Banner.findByIdAndDelete(id);

    if (!banner) {
      return res.status(404).json({
        message: "Banner not found",
      });
    }

    return res.status(200).json({
      message: "Banner deleted successfully",
    });

  } catch (err) {
    console.log(err);

    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};


module.exports = {CreateBanner,GetAllBanners,GetActiveBanners,UpdateBanner,DeleteBanner,};