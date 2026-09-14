const CategorySchema = require("../models/CategorySchema");
const cloudinary= require("../Config/Cloudinary")


const CreateCategory = async (req, res) => {
    try {

        console.log("BODY:", req.body);
        console.log("FILE:", req.file);

        const {
            name,
            slug,
            parentCategory
        } = req.body;

        // Check required fields
        if (!name || !slug) {
            return res.status(400).json({
                message: "Name and slug are required"
            });
        }

        // Check image
        if (!req.file) {
            return res.status(400).json({
                message: "Category image is required"
            });
        }

        // Check existing category
        const existingCategory = await CategorySchema.findOne({ slug });

        if (existingCategory) {
            return res.status(400).json({
                message: "Category already exists"
            });
        }

        // Upload image to Cloudinary
        const uploadResult = await new Promise((resolve, reject) => {

            const stream = cloudinary.uploader.upload_stream(
                {
                    folder: "ostik/categories",
                    resource_type: "image"
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

        // Create category
        const category = await CategorySchema.create({

            name,
            slug,

            parentCategory: parentCategory || null,

            image: uploadResult.secure_url

        });

        res.status(201).json({
            message: "Category created successfully",
            category
        });

    } catch (err) {

        console.log(err);

        res.status(500).json({
            message: "Server error",
            error: err.message
        });
    }
};



// GET ALL CATEGORIES
const GetCategories = async (req, res) => {
    try {

        const categories = await CategorySchema.find({
            isActive:true
        })
            .populate("parentCategory", "name slug")
            .sort({ createdAt: -1 });

        res.status(200).json({
            message: "Categories fetched successfully",
            categories
        });

    } catch (err) {

        console.log(err);

        res.status(500).json({
            message: "Server error",
            error: err.message
        });
    }
};



// GET SINGLE CATEGORY
const GetCategory = async (req, res) => {
    try {

        const { id } = req.params;

        const category = await CategorySchema.findById(id)
            .populate("parentCategory", "name slug");

        if (!category) {
            return res.status(404).json({
                message: "Category not found"
            });
        }

        res.status(200).json({
            message: "Category fetched successfully",
            category
        });

    } catch (err) {

        console.log(err);

        res.status(500).json({
            message: "Server error",
            error: err.message
        });
    }
};


// UPDATE CATEGORY
const UpdateCategory = async (req, res) => {
    try {

        const { id } = req.params;

        const {
            name,
            slug,
            parentCategory,
            isActive
        } = req.body;

        const category = await CategorySchema.findById(id);

        if (!category) {
            return res.status(404).json({
                message: "Category not found"
            });
        }

        // Update text fields
        if (name !== undefined) category.name = name;

        if (slug !== undefined) category.slug = slug;

        if (parentCategory !== undefined) {
            category.parentCategory = parentCategory || null;
        }

        if (isActive !== undefined) {
            category.isActive = isActive;
        }


        // Update image if new file is uploaded
        if (req.file) {

            const uploadResult = await new Promise((resolve, reject) => {

                const stream = cloudinary.uploader.upload_stream(
                    {
                        folder: "ostik/categories",
                        resource_type: "image"
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

            category.image = uploadResult.secure_url;
        }


        await category.save();

        res.status(200).json({
            message: "Category updated successfully",
            category
        });

    } catch (err) {

        console.log(err);

        res.status(500).json({
            message: "Server error",
            error: err.message
        });
    }
};



// DELETE CATEGORY
const DeleteCategory = async (req, res) => {
    try {

        const { id } = req.params;

        const category = await CategorySchema.findById(id);

        if (!category) {
            return res.status(404).json({
                message: "Category not found"
            });
        }

        await category.deleteOne();

        res.status(200).json({
            message: "Category deleted successfully"
        });

    } catch (err) {

        console.log(err);

        res.status(500).json({
            message: "Server error",
            error: err.message
        });
    }
};


module.exports = {CreateCategory, GetCategories, GetCategory, UpdateCategory, DeleteCategory };