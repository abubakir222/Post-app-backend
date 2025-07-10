const cloudinary = require('cloudinary').v2;


cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.CLOUD_API_KEY,
    api_secret: process.env.CLOUD_API_SECRET
});

if (!cloudinary.config().api_key) {
    throw new Error('Cloudinary API kaliti topilmadi. .env faylini tekshiring.');
}

console.log('Cloudinary konfiguratsiyasi:', cloudinary.config());
module.exports = cloudinary;