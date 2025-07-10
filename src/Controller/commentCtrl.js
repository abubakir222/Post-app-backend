const Comment = require('../Model/commentsModel');
const Post = require('../Model/postModel');
const Notification = require('../Model/notificatoinModel');
const User = require('../Model/UserModel');

const commentCtrl = {
  createComment: async (req, res) => {
    try {
      const { postId, text } = req.body;
      const userId = req.user._id;

      if (!postId || !text) {
        return res.status(400).json({ message: 'postId va text majburiy' });
      }

      const post = await Post.findById(postId);
      if (!post) {
        return res.status(404).json({ message: 'Post topilmadi' });
      }

      const newComment = await Comment.create({
        postId,
        userId,
        text,
      });

      await Post.findByIdAndUpdate(postId, {
        $push: { comments: newComment._id },
      });

      const populatedComment = await Comment.findById(newComment._id)
        .populate('userId', 'username profileImage')
        .lean();

      if (post.userId && userId.toString() !== post.userId.toString()) {
        const sender = await User.findById(userId);
        const senderUsername = sender?.username || 'User';
        const existing = await Notification.findOne({
          senderId: userId,
          receiverId: post.userId,
          type: 'comment',
          postId,
          commentId: newComment._id,
        });
        if (!existing) {
          const newNotification = await Notification.create({
            senderId: userId,
            receiverId: post.userId,
            type: 'comment',
            message: `${senderUsername} sizning postingizga komment yozdi: "${text.substring(0, 20)}..."`,
            postId,
            commentId: newComment._id,
            isRead: false,
          });
          const populatedNotification = await Notification.findById(newNotification._id)
            .populate('senderId', 'username profileImage')
            .populate('postId', 'content postImage')
            .populate('commentId', 'text')
            .lean();
          req.io.to(post.userId.toString()).emit('newNotification', populatedNotification);
        }
      }

      req.io.emit('newComment', populatedComment);
      res.status(201).json(populatedComment);
    } catch (err) {
      res.status(500).json({ message: 'Server xatosi: Komment yaratishda muammo', error: err.message });
    }
  },

  getCommentsByPost: async (req, res) => {
    try {
      const comments = await Comment.find({ postId: req.params.postId })
        .populate('userId', 'username profileImage')
        .sort({ createdAt: -1 })
        .lean();
      res.json(comments);
    } catch (err) {
      res.status(500).json({ message: 'Server xatosi: Kommentlarni olishda muammo', error: err.message });
    }
  },

  updateComment: async (req, res) => {
    try {
      const { id } = req.params;
      const { text } = req.body;
      const userId = req.user._id;

      if (!text) {
        return res.status(400).json({ message: 'Text majburiy' });
      }

      const comment = await Comment.findById(id);
      if (!comment) {
        return res.status(404).json({ message: 'Komment topilmadi' });
      }

      if (comment.userId.toString() !== userId.toString()) {
        return res.status(403).json({ message: 'Faqat o‘zingizning commentingizni yangilay olasiz' });
      }

      comment.text = text;
      await comment.save();

      const populatedComment = await Comment.findById(id)
        .populate('userId', 'username profileImage')
        .lean();
      req.io.emit('updatedComment', { ...populatedComment, postId: comment.postId });
      res.json(populatedComment);
    } catch (err) {
      res.status(500).json({ message: 'Server xatosi: Komment yangilashda muammo', error: err.message });
    }
  },

  deleteComment: async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user._id;

      const comment = await Comment.findById(id);
      if (!comment) {
        return res.status(404).json({ message: 'Komment topilmadi' });
      }

      if (comment.userId.toString() !== userId.toString()) {
        return res.status(403).json({ message: 'Faqat o‘zingizning commentingizni o‘chira olasiz' });
      }

      await Comment.deleteOne({ _id: id });
      await Post.findByIdAndUpdate(comment.postId, {
        $pull: { comments: comment._id },
      });

      req.io.emit('deletedComment', { postId: comment.postId, commentId: id });
      res.json({ message: 'Komment o‘chirildi' });
    } catch (err) {
      res.status(500).json({ message: 'Server xatosi: Komment o‘chirishda muammo', error: err.message });
    }
  },
};

module.exports = commentCtrl;