import * as commentModel from '../models/commentModel.js';

function getCommentId(req) {
  const commentId = Number.parseInt(req.params.commentId, 10);
  return Number.isInteger(commentId) && commentId > 0 ? commentId : null;
}

export async function listComments(req, res) {
  try {
    const comments = await commentModel.getComments();
    return res.status(200).json(comments);
  } catch (error) {
    console.error('Failed to load comments:', error);
    return res.status(500).json({ error: 'Failed to load comments' });
  }
}

export async function createComment(req, res) {
  const content = String(req.body?.content || '').trim();
  if (!content) return res.status(400).json({ error: 'Comment content is required' });
  if (content.length > 2000) return res.status(400).json({ error: 'Comment is too long' });

  try {
    const commentId = await commentModel.createComment(req.user.userId, content);
    return res.status(201).json({ comment_id: commentId });
  } catch (error) {
    console.error('Failed to create comment:', error);
    return res.status(500).json({ error: 'Failed to create comment' });
  }
}

export async function updateComment(req, res) {
  const commentId = getCommentId(req);
  const content = String(req.body?.content || '').trim();
  if (!commentId) return res.status(400).json({ error: 'Invalid commentId' });
  if (!content) return res.status(400).json({ error: 'Comment content is required' });
  if (content.length > 2000) return res.status(400).json({ error: 'Comment is too long' });

  try {
    const updated = await commentModel.updateComment(commentId, req.user.userId, content);
    return updated
      ? res.status(200).json({ message: 'Comment updated' })
      : res.status(403).json({ error: 'Only the comment owner can edit it' });
  } catch (error) {
    console.error('Failed to update comment:', error);
    return res.status(500).json({ error: 'Failed to update comment' });
  }
}

export async function deleteComment(req, res) {
  const commentId = getCommentId(req);
  if (!commentId) return res.status(400).json({ error: 'Invalid commentId' });

  try {
    const deleted = await commentModel.deleteComment(
      commentId,
      req.user.userId,
      req.user.role === 'registrar'
    );
    return deleted
      ? res.status(200).json({ message: 'Comment deleted' })
      : res.status(403).json({ error: 'Only the owner or a registrar can delete it' });
  } catch (error) {
    console.error('Failed to delete comment:', error);
    return res.status(500).json({ error: 'Failed to delete comment' });
  }
}
