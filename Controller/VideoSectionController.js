const VideoSection = require("../models/VideoSectionSchema");
const cloudinary = require("../Config/Cloudinary");

// =========================================================
// CREATE VIDEO SECTION
// =========================================================
const createVideoSection = async (req, res) => {
  try {
    const {
      title,
      description,
      videoUrl,
      buttonText,
      buttonLink,
      isActive,
    } = req.body;

    let finalVideoUrl = videoUrl;

    // If video file is uploaded from system
    if (req.file) {
      const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            resource_type: "video",
            folder: "ostik/videos",
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

      finalVideoUrl = uploadResult.secure_url;
    }

    // Video URL or uploaded video is required
    if (!finalVideoUrl) {
      return res.status(400).json({
        success: false,
        message: "Please provide a YouTube URL or upload a video",
      });
    }

    const videoSection = await VideoSection.create({
      title,
      description,
      videoUrl: finalVideoUrl,
      buttonText,
      buttonLink,
      isActive,
    });

    res.status(201).json({
      success: true,
      message: "Video section created successfully",
      data: videoSection,
    });
  } catch (error) {
    console.error("Create Video Section Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create video section",
      error: error.message,
    });
  }
};


// =========================================================
// GET VIDEO SECTION
// =========================================================
const getVideoSection = async (req, res) => {
  try {
    const videoSection = await VideoSection.findOne({
      isActive: true,
    });

    if (!videoSection) {
      return res.status(404).json({
        success: false,
        message: "Video section not found",
      });
    }

    res.status(200).json({
      success: true,
      data: videoSection,
    });
  } catch (error) {
    console.error("Get Video Section Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to get video section",
      error: error.message,
    });
  }
};


// =========================================================
// UPDATE VIDEO SECTION
// =========================================================
const updateVideoSection = async (req, res) => {
  try {
    const {
      title,
      description,
      videoUrl,
      buttonText,
      buttonLink,
      isActive,
    } = req.body;

    const videoSection = await VideoSection.findOne();

    if (!videoSection) {
      return res.status(404).json({
        success: false,
        message: "Video section not found",
      });
    }

    // Keep existing video by default
    let finalVideoUrl = videoSection.videoUrl;

    // If a new video file is uploaded
    if (req.file) {
      const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            resource_type: "video",
            folder: "ostik/videos",
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

      finalVideoUrl = uploadResult.secure_url;
    } 
    // If videoUrl is provided and no new file is uploaded
    else if (videoUrl) {
      finalVideoUrl = videoUrl;
    }

    videoSection.title = title ?? videoSection.title;

    videoSection.description =
      description ?? videoSection.description;

    videoSection.videoUrl = finalVideoUrl;

    videoSection.buttonText =
      buttonText ?? videoSection.buttonText;

    videoSection.buttonLink =
      buttonLink ?? videoSection.buttonLink;

    // Convert form-data string into Boolean
    if (isActive !== undefined) {
      videoSection.isActive =
        isActive === "true" || isActive === true;
    }

    await videoSection.save();

    res.status(200).json({
      success: true,
      message: "Video section updated successfully",
      data: videoSection,
    });
  } catch (error) {
    console.error("Update Video Section Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to update video section",
      error: error.message,
    });
  }
};


// =========================================================
// DELETE VIDEO SECTION
// =========================================================
const deleteVideoSection = async (req, res) => {
  try {
    const videoSection = await VideoSection.findOneAndDelete({});

    if (!videoSection) {
      return res.status(404).json({
        success: false,
        message: "Video section not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Video section deleted successfully",
    });
  } catch (error) {
    console.error("Delete Video Section Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to delete video section",
      error: error.message,
    });
  }
};


module.exports = {createVideoSection,getVideoSection, updateVideoSection, deleteVideoSection,};