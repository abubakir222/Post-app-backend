const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const User = require('../Model/UserModel');
const Post = require('../Model/postModel');
const Comment = require('../Model/commentsModel');
const Notification = require('../Model/notificatoinModel');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET,
});

const userCtrl = {
  updateUser: async (req, res) => {
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
  },

  removeProfileImage: async (req, res) => {
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
  },

  deleteUser: async (req, res) => {
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
  },

  searchOrGetUsers: async (req, res) => {
    try {
      const q = req.query.q || '';
      let users;
      if (q) {
        users = await User.find({ username: { $regex: q, $options: 'i' } }).select('-password');
      } else {
        users = await User.find().select('-password');
      }
      res.status(200).json(users);
    } catch (err) {
      res.status(500).json({ message: "Foydalanuvchilarni olishda xatolik" });
    }
  },

  getCurrentUser: async (req, res) => {
    try {
      const user = await User.findById(req.user._id).select('-password');
      if (!user) return res.status(404).json({ message: 'Foydalanuvchi topilmadi' });
      res.status(200).json(user);
    } catch (error) {
      res.status(500).json({ message: 'Serverda xatolik: ' + error.message });
    }
  },

  // GET any user info (for profile page)
  getOneUser: async (req, res) => {
    try {
      const user = await User.findById(req.params.id).select('-password');
      if (!user) return res.status(404).json({ message: 'Foydalanuvchi topilmadi' });
      res.status(200).json(user);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },

  // FOLLOW
  followUser: async (req, res) => {
    try {
      const targetUserId = req.params.id;
      const myUserId = req.user._id.toString();

      if (!mongoose.Types.ObjectId.isValid(targetUserId) || !mongoose.Types.ObjectId.isValid(myUserId)) {
        return res.status(400).json({ message: 'Noto‘g‘ri ID formati' });
      }
      if (targetUserId === myUserId) {
        return res.status(400).json({ message: "O‘zingizni follow qilib bo‘lmaydi" });
      }

      const targetUser = await User.findById(targetUserId);
      const myUser = await User.findById(myUserId);

      // Agar allaqachon followingda yoki followersda bo‘lsa, push qilmaydi
      if (!myUser.following.map(String).includes(targetUserId)) {
        myUser.following.push(targetUserId);
        await myUser.save();
      }
      if (!targetUser.followers.map(String).includes(myUserId)) {
        targetUser.followers.push(myUserId);
        await targetUser.save();
      }

      const updatedTarget = await User.findById(targetUserId).select('-password');
      const updatedMe = await User.findById(myUserId).select('-password');
      return res.status(200).json({
        message: 'Follow qilindi',
        user: updatedTarget,
        currentUser: updatedMe
      });
    } catch (error) {
      res.status(500).json({ message: 'Serverda xatolik: ' + error.message });
    }
  },

  // UNFOLLOW
  unfollowUser: async (req, res) => {
    try {
      const targetUserId = req.params.id;
      const myUserId = req.user._id.toString();

      if (!mongoose.Types.ObjectId.isValid(targetUserId) || !mongoose.Types.ObjectId.isValid(myUserId)) {
        return res.status(400).json({ message: 'Noto‘g‘ri ID formati' });
      }

      const targetUser = await User.findById(targetUserId);
      const myUser = await User.findById(myUserId);

      myUser.following = myUser.following.filter(id => id.toString() !== targetUserId);
      await myUser.save();

      targetUser.followers = targetUser.followers.filter(id => id.toString() !== myUserId);
      await targetUser.save();

      const updatedTarget = await User.findById(targetUserId).select('-password');
      const updatedMe = await User.findById(myUserId).select('-password');
      return res.status(200).json({
        message: 'Unfollow qilindi',
        user: updatedTarget,
        currentUser: updatedMe
      });
    } catch (error) {
      res.status(500).json({ message: 'Serverda xatolik: ' + error.message });
    }
  },

  getProfile: async (req, res) => {
    try {
      const userId = req.params.userId;
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ message: 'Noto‘g‘ri foydalanuvchi ID formati' });
      }
      const user = await User.findById(userId)
        .select('username bio followers following profileImage')
        .lean();
      if (!user) {
        return res.status(404).json({ message: 'Foydalanuvchi topilmadi' });
      }
      user.followersCount = Array.isArray(user.followers) ? user.followers.length : 0;
      user.followingCount = Array.isArray(user.following) ? user.following.length : 0;
      user.followers = undefined;
      user.following = undefined;

      if (!req.user || !req.user._id) {
        user.isFollowed = false;
      } else {
        if (!mongoose.Types.ObjectId.isValid(req.user._id)) {
          return res.status(400).json({ message: 'Noto‘g‘ri joriy foydalanuvchi ID formati' });
        }
        const currentUser = await User.findById(req.user._id).lean();
        if (!currentUser) {
          return res.status(404).json({ message: 'Joriy foydalanuvchi topilmadi' });
        }
        user.isFollowed = Array.isArray(currentUser.following) && currentUser.following.some(id => id.toString() === userId);
      }
      res.status(200).json(user);
    } catch (error) {
      console.error('Profil olishda xato:', error.stack);
      res.status(500).json({ message: 'Serverda xato yuz berdi: ' + error.message });
    }
  },

  getLikedPosts: async (req, res) => {
    try {
      const posts = await Post.find({ likes: req.params.id })
        .populate('userId', 'username profileImage')
        .lean();

      res.json(posts.map(post => ({
        ...post,
        _action: 'like',
      })));
    } catch (e) {
      res.status(500).json({ message: "Layk bosilgan postlarni olishda xatolik" });
    }
  },

  getCommentedPosts: async (req, res) => {
    try {
      const comments = await Comment.find({ userId: req.params.id })
        .populate('postId')
        .lean();

      const postIds = comments.map(c => c.postId?._id).filter(Boolean);
      const posts = await Post.find({ _id: { $in: postIds } }).lean();

      const result = comments.map(c => ({
        comment: c,
        post: posts.find(p => p._id.toString() === c.postId?._id?.toString()),
        _action: 'comment'
      }));

      res.json(result);
    } catch (e) {
      res.status(500).json({ message: "Komment qoldirilgan postlarni olishda xatolik" });
    }
  },

  getMyPosts: async (req, res) => {
    try {
      const posts = await Post.find({ userId: req.params.id })
        .populate('userId', 'username profileImage')
        .lean();

      res.json(posts.map(post => ({
        ...post,
        _action: 'post'
      })));
    } catch (e) {
      res.status(500).json({ message: "User postlarini olishda xatolik" });
    }
  },

};

module.exports = userCtrl;