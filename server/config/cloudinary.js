import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Uploads a video buffer (from multer's memoryStorage) to Cloudinary.
// resource_type: "video" is required for webm/mp4 — Cloudinary treats
// video and image as separate resource types.
export const uploadRecordingBuffer = (buffer, { publicId, folder = "listen-you/recordings" } = {}) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: "video",
        folder,
        public_id: publicId,
        // Recordings can be large (up to 300MB per the multer limit) —
        // chunked upload avoids timing out on slower connections.
        chunk_size: 6 * 1024 * 1024,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    uploadStream.end(buffer);
  });
};

export const deleteRecording = (publicId) => {
  if (!publicId) return Promise.resolve();
  return cloudinary.uploader.destroy(publicId, { resource_type: "video" });
};

export default cloudinary;
