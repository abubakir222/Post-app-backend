const mongoose = require('mongoose');
const Post = require('./src/Model/postModel');
const cloudinary = require('./src/config/cloudinary');
const dotenv = require('dotenv');
dotenv.config();

const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/myapp';

async function getPublicIdFromUrl(url) {
  try {
    console.log(`URLni tekshirish: ${url}`);
    const config = cloudinary.config();
    console.log('Cloudinary konfiguratsiyasi:', config);

    // Cloudinary URL strukturasi: https://res.cloudinary.com/<cloud_name>/image/upload/v1234/<folder>/<public_id>.jpg
    const parts = url.split('/upload/');
    if (parts.length < 2) {
      console.warn('URL format noto‘g‘ri:', url);
      return null;
    }
    const pathPart = parts[1]; // v1234/folder/public_id.jpg
    const versionAndPath = pathPart.split('/'); // [v1234, folder, public_id.jpg]
    const publicIdWithExt = versionAndPath.slice(2).join('/'); // folder/public_id.jpg
    const publicId = publicIdWithExt.split('.')[0]; // folder/public_id
    console.log(`Aniqlangan public_id: ${publicId}`);

    return publicId;
  } catch (err) {
    console.error('Public_id olishda xatolik:', err.message);
    return null;
  }
}

mongoose.connect(MONGO_URL)
  .then(async () => {
    console.log('MongoDB ga ulanish muvaffaqiyatli');

    const postsWithoutPublicId = await Post.find({ "postImage.public_id": { $exists: false } });

    if (postsWithoutPublicId.length === 0) {
      console.log('Hamma postlarda public_id mavjud.');
      return mongoose.disconnect();
    }

    console.log(`Topilgan postlar soni: ${postsWithoutPublicId.length}`);
    for (const post of postsWithoutPublicId) {
      console.log(`Post ID: ${post._id}, postImage: ${JSON.stringify(post.postImage)}`);
      if (post.postImage && post.postImage.url) {
        const publicId = await getPublicIdFromUrl(post.postImage.url);
        if (publicId) {
          post.postImage.public_id = publicId;
          await post.save();
          console.log(`Post ${post._id} uchun public_id qo'shildi: ${publicId}`);
        } else {
          console.log(`Post ${post._id} uchun public_id aniqlanmadi. URL: ${post.postImage.url}`);
        }
      }
    }

    await mongoose.disconnect();
    console.log('Migrasiya jarayoni tugadi.');
  })
  .catch(err => {
    console.error('Xatolik:', err);
    mongoose.disconnect();
  });