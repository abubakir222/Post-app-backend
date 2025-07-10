const User = require('../Model/UserModel');
const Post = require('../Model/postModel');
const Comment = require('../Model/commentsModel');
const Notification = require('../Model/notificatoinModel');
const mongoose = require('mongoose');
const cloudinary = require('../config/cloudinary');
const fs = require('fs');
const bcrypt = require('bcryptjs');

exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select('-password').lean();
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: "Userlarni olishda xatolik" });
  }
};

exports.getAllPosts = async (req, res) => {
  try {
    const posts = await Post.find()
      .populate('userId', 'username profileImage')
      .populate({ path: 'comments', populate: { path: 'userId', select: 'username profileImage' } })
      .sort({ createdAt: -1 })
      .lean();
    res.json(posts);
  } catch (err) {
    res.status(500).json({ message: "Postlarni olishda xatolik" });
  }
};

exports.getAllComments = async (req, res) => {
  try {
    const posts = await Post.find().select('_id');
    const validPostIds = posts.map(p => String(p._id));
    const comments = await Comment.find({ postId: { $in: validPostIds } })
      .populate('userId', 'username profileImage')
      .populate('postId', 'content')
      .sort({ createdAt: -1 })
      .lean();
    res.json(comments);
  } catch (err) {
    res.status(500).json({ message: "Kommentlarni olishda xatolik" });
  }
};

exports.updateUser = async (req, res) => {
  try {
    console.log('So‘rov keldi:', { params: req.params, body: req.body, files: req.files });
    const userId = req.params.id;
    if (req.user.role !== 101 && req.user._id.toString() !== userId) {
      return res.status(403).json({ message: "Sizda bu foydalanuvchini yangilash huquqi yo‘q" });
    }
    const user = await User.findById(userId).select('+password');
    if (!user) return res.status(404).json({ message: 'Foydalanuvchi topilmadi' });

    console.log('Foydalanuvchi ma\'lumotlari:', user);

    const [emailExists, usernameExists] = await Promise.all([
      req.body.email && req.body.email !== user.email
        ? User.findOne({ email: req.body.email })
        : null,
      req.body.username && req.body.username !== user.username
        ? User.findOne({ username: req.body.username })
        : null
    ]);
    if (emailExists) return res.status(400).json({ message: 'Bu email allaqachon band' });
    if (usernameExists) return res.status(400).json({ message: 'Bu username allaqachon band' });

    if (req.body.email) user.email = req.body.email;
    if (req.body.username) user.username = req.body.username;
    if (req.body.surname) user.surname = req.body.surname;
    if (req.body.job !== undefined) user.job = req.body.job;
    if (req.body.hobby !== undefined) user.hobby = req.body.hobby;

    if (req.files && req.files.profileImage) {
      try {
        console.log('Rasm yuklash jarayoni boshlandi:', req.files.profileImage);
        if (user.profileImage && user.profileImage.public_id) {
          console.log('Eski rasmni o‘chirish:', user.profileImage.public_id);
          const destroyResult = await cloudinary.uploader.destroy(user.profileImage.public_id);
          console.log('O‘chirish natijasi:', destroyResult);
        }
        const file = req.files.profileImage;
        console.log('Yuklanayotgan fayl:', file);
        const result = await cloudinary.uploader.upload(file.tempFilePath, {
          folder: 'profiles',
          resource_type: 'auto',
        });
        console.log('Yuklash natijasi:', result);
        await fs.promises.unlink(file.tempFilePath).catch(err => {
          console.error('Vaqtincha faylni o‘chirishda xato:', err.message);
        });
        user.profileImage = { url: result.secure_url, public_id: result.public_id };
      } catch (cloudinaryError) {
        console.error('Cloudinary xatosi:', cloudinaryError.message, cloudinaryError.stack);
        return res.status(500).json({ message: 'Cloudinary bilan rasm yuklashda xatolik', error: cloudinaryError.message });
      }
    }

    if (req.body.password && req.body.password.length > 0) {
      user.password = await bcrypt.hash(req.body.password, 10);
    }

    await user.save();
    const userToReturn = user.toObject();
    delete userToReturn.password;
    res.status(200).json({ message: 'Foydalanuvchi muvaffaqiyatli yangilandi', user: userToReturn });
  } catch (error) {
    console.error('Foydalanuvchi yangilashda xato:', error.message, error.stack);
    if (error.code === 11000) {
      return res.status(400).json({ message: "Username yoki email band" });
    }
    res.status(500).json({ message: 'Serverda xatolik: ' + error.message });
  }
};

exports.removeProfileImage = async (req, res) => {
  try {
    console.log('Profil rasmni o‘chirish so‘rovi:', { params: req.params });
    const userId = req.params.id;
    if (req.user.role !== 101 && req.user._id.toString() !== userId) {
      return res.status(403).json({ message: "Sizda bu foydalanuvchi rasmini o‘chirish huquqi yo‘q" });
    }
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'Foydalanuvchi topilmadi' });

    if (user.profileImage && user.profileImage.public_id) {
      console.log('Profil rasmni o‘chirish:', user.profileImage.public_id);
      try {
        const destroyResult = await cloudinary.uploader.destroy(user.profileImage.public_id);
        console.log('O‘chirish natijasi:', destroyResult);
        user.profileImage = { url: '', public_id: '' }; // Profil rasm maydonini bo‘shatish
        await user.save();
        res.status(200).json({ message: 'Profil rasmi muvaffaqiyatli o‘chirildi', user });
      } catch (cloudinaryError) {
        console.error('Cloudinary rasm o‘chirish xatosi:', cloudinaryError.message, cloudinaryError.stack);
        return res.status(500).json({ message: 'Cloudinary bilan rasmni o‘chirishda xatolik', error: cloudinaryError.message });
      }
    } else {
      console.log('O‘chirish uchun profil rasmi topilmadi');
      return res.status(400).json({ message: 'Foydalanuvchida profil rasmi mavjud emas' });
    }
  } catch (error) {
    console.error('Profil rasmni o‘chirishda xato:', error.message, error.stack);
    res.status(500).json({ message: 'Serverda xatolik: ' + error.message });
  }
};

  exports.deleteUser = async (req, res) => {
    try {
      const userId = req.params.id;
      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ message: 'Foydalanuvchi topilmadi' });

      if (req.user.role !== 101 && req.user._id.toString() !== userId) {
        return res.status(403).json({ message: 'Sizda bu foydalanuvchini o‘chirish huquqi yo‘q' });
      }

      const posts = await Post.find({ userId });
      await Promise.all(posts.map(async post => {
        if (post.postImage && post.postImage.public_id) {
          console.log('Post rasmni o‘chirish:', post.postImage.public_id);
          try {
            const destroyResult = await cloudinary.uploader.destroy(post.postImage.public_id);
            console.log('Post rasm o‘chirish natijasi:', destroyResult);
          } catch (cloudinaryError) {
            console.error('Post rasmni o‘chirishda xato:', cloudinaryError.message);
          }
        }
        await Comment.deleteMany({ postId: post._id });
        await Post.findByIdAndDelete(post._id);
      }));

      await Promise.all([
        Comment.deleteMany({ userId }),
        Post.updateMany({ likes: userId }, { $pull: { likes: userId } }),
        User.updateMany({ followers: userId }, { $pull: { followers: userId } }),
        User.updateMany({ following: userId }, { $pull: { following: userId } }),
        Notification.deleteMany({ $or: [{ senderId: userId }, { receiverId: userId }] })
      ]);

      if (user.profileImage && user.profileImage.public_id) {
        console.log('Foydalanuvchi profil rasmni o‘chirish:', user.profileImage.public_id);
        try {
          const destroyResult = await cloudinary.uploader.destroy(user.profileImage.public_id);
          console.log('Profil rasm o‘chirish natijasi:', destroyResult);
        } catch (cloudinaryError) {
          console.error('Profil rasmni o‘chirishda xato:', cloudinaryError.message);
        }
      }
      await User.findByIdAndDelete(userId);

      res.status(200).json({ message: 'Foydalanuvchi va unga tegishli barcha maʼlumotlar o‘chirildi' });
    } catch (error) {
      console.error('Foydalanuvchi o‘chirishda xato:', error.message, error.stack);
      res.status(500).json({ message: 'Serverda xatolik: ' + error.message });
    }
  };

exports.deletePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post topilmadi' });
    if (post.postImage && post.postImage.public_id) {
      await cloudinary.uploader.destroy(post.postImage.public_id).catch(() => { });
    }
    await Comment.deleteMany({ postId: post._id });
    await Post.deleteOne({ _id: req.params.id });
    res.json({ message: 'Post o‘chirildi' });
  } catch (err) {
    res.status(500).json({ message: 'Admin: Post o‘chirishda xatolik' });
  }
};

exports.updatePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post topilmadi' });

    post.content = req.body.content || post.content;
    if (req.files && req.files.postImage) {
      if (post.postImage && post.postImage.public_id) {
        await cloudinary.uploader.destroy(post.postImage.public_id).catch(() => { });
      }
      const file = req.files.postImage;
      const result = await cloudinary.uploader.upload(file.tempFilePath, {
        folder: 'posts',
        resource_type: 'auto',
      });
      fs.unlinkSync(file.tempFilePath);
      post.postImage = { url: result.secure_url, public_id: result.public_id };
    }
    await post.save();

    const populatedPost = await Post.findById(req.params.id)
      .populate('userId', 'username profileImage')
      .populate({ path: 'comments', populate: { path: 'userId', select: 'username profileImage' } });

    res.status(200).json({ post: populatedPost });
  } catch (err) {
    res.status(500).json({ message: 'Server xatosi: Post yangilashda muammo', error: err.message });
  }
};

exports.deleteComment = async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id);
    if (!comment) return res.status(404).json({ message: 'Komment topilmadi' });
    await Comment.deleteOne({ _id: req.params.id });
    await Post.findByIdAndUpdate(comment.postId, { $pull: { comments: comment._id } });
    res.json({ message: 'Komment o‘chirildi' });
  } catch (err) {
    res.status(500).json({ message: 'Admin: Komment o‘chirishda xatolik' });
  }
};

exports.updateComment = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ message: 'Text majburiy' });
    const comment = await Comment.findById(req.params.id);
    if (!comment) return res.status(404).json({ message: 'Komment topilmadi' });
    comment.text = text;
    await comment.save();
    res.json(comment);
  } catch (err) {
    res.status(500).json({ message: 'Admin: Komment yangilashda xatolik' });
  }
};

exports.getTopLikers = async (req, res) => {
  const agg = await Post.aggregate([
    { $unwind: "$likes" },
    { $group: { _id: "$likes", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 10 }
  ]);
  const users = await User.find({ _id: { $in: agg.map(a => a._id) } }).select('username profileImage').lean();
  const result = agg.map(a => {
    const user = users.find(u => u._id.toString() === a._id.toString());
    return { user, likeCount: a.count };
  });
  res.json(result);
};

exports.getTopCommenters = async (req, res) => {
  const agg = await Comment.aggregate([
    { $group: { _id: "$userId", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 10 }
  ]);
  const users = await User.find({ _id: { $in: agg.map(a => a._id) } }).select('username profileImage').lean();
  const result = agg.map(a => {
    const user = users.find(u => u._id.toString() === a._id.toString());
    return { user, commentCount: a.count };
  });
  res.json(result);
};

exports.getTopPosters = async (req, res) => {
  const agg = await Post.aggregate([
    { $group: { _id: "$userId", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 10 }
  ]);
  const users = await User.find({ _id: { $in: agg.map(a => a._id) } }).select('username profileImage').lean();
  const result = agg.map(a => {
    const user = users.find(u => u._id.toString() === a._id.toString());
    return { user, postCount: a.count };
  });
  res.json(result);
};

exports.removeImage = async (req, res) => {
  try {
    const { type, id } = req.params;
    let model, fieldName;

    if (type === 'user') {
      model = User;
      fieldName = 'profileImage';
    } else if (type === 'post') {
      model = Post;
      fieldName = 'postImage';
    } else {
      return res.status(400).json({ message: 'Noto‘g‘ri type kiritildi' });
    }

    const item = await model.findById(id);
    if (!item) return res.status(404).json({ message: `${type} topilmadi` });

    if (item[fieldName] && item[fieldName].public_id) {
      console.log(`Tekshirilayotgan ${type} rasm ma'lumotlari:`, item[fieldName]);
      await cloudinary.uploader.destroy(item[fieldName].public_id).catch(err => {
        console.error(`Cloudinaryda o'chirishda xatolik: ${err.message}`);
        return res.status(500).json({ message: 'Cloudinaryda rasmni o‘chirishda xatolik' });
      });
      item[fieldName] = null;
      await item.save();
    } else {
      return res.status(400).json({ message: 'Rasm uchun public_id topilmadi' });
    }

    res.status(200).json({ message: `${type} rasmi muvaffaqiyatli o‘chirildi` });
  } catch (error) {
    res.status(500).json({ message: 'Serverda xatolik: ' + error.message });
  }
};