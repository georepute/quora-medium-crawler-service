import express, { Request, Response } from 'express';
import { publishToQuora, trackQuoraPerformance, verifyQuoraConfig } from '../services/quora';

const router = express.Router();

/**
 * POST /quora/publish
 * Publish content to Quora
 * 
 * Body:
 * {
 *   email: string,
 *   cookies: Array<Cookie>,
 *   content: {
 *     title: string,
 *     content: string,
 *     tags?: string[],
 *     metadata?: { imageUrl?: string, ... }
 *   },
 *   questionUrl?: string
 * }
 */
router.post('/publish', async (req: Request, res: Response) => {
  try {
    const { email, cookies, content, questionUrl } = req.body;

    // Validate required fields
    if (!email || !cookies || !content) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: email, cookies, and content are required'
      });
    }

    if (!content.title || !content.content) {
      return res.status(400).json({
        success: false,
        error: 'Content must include title and content'
      });
    }

    console.log('📝 Publishing to Quora...');
    console.log('  - Email:', email);
    console.log('  - Title:', content.title);
    console.log('  - Question URL:', questionUrl || 'None (will create post)');

    // Call Quora publish function
    const result = await publishToQuora(
      { email, cookies },
      content,
      questionUrl
    );

    if (result.success) {
      console.log('✅ Published successfully:', result.url);
      return res.json({
        success: true,
        url: result.url,
        postId: result.postId,
        questionId: result.questionId
      });
    } else {
      console.error('❌ Publish failed:', result.error);
      return res.status(500).json({
        success: false,
        error: result.error || 'Failed to publish to Quora',
        screenshot: result.screenshot
      });
    }
  } catch (error: any) {
    console.error('❌ Quora publish error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

/**
 * POST /quora/track
 * Track performance metrics for a Quora post/answer
 * 
 * Body:
 * {
 *   email: string,
 *   cookies: Array<Cookie>,
 *   postUrl: string
 * }
 */
router.post('/track', async (req: Request, res: Response) => {
  try {
    const { email, cookies, postUrl } = req.body;

    // Validate required fields
    if (!email || !cookies || !postUrl) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: email, cookies, and postUrl are required'
      });
    }

    console.log('📊 Tracking Quora performance...');
    console.log('  - Email:', email);
    console.log('  - Post URL:', postUrl);

    // Call Quora track function
    const metrics = await trackQuoraPerformance(
      { email, cookies },
      postUrl
    );

    if (metrics.error) {
      console.error('❌ Tracking failed:', metrics.error);
      return res.status(500).json({
        success: false,
        error: metrics.error,
        metrics: {
          upvotes: metrics.upvotes || 0,
          comments: metrics.comments || 0,
          views: metrics.views || 0,
          shares: metrics.shares || 0,
          engagement: metrics.engagement || 0,
          lastUpdated: metrics.lastUpdated
        }
      });
    }

    console.log('✅ Metrics retrieved:', metrics);
    return res.json({
      success: true,
      metrics: {
        upvotes: metrics.upvotes || 0,
        comments: metrics.comments || 0,
        views: metrics.views || 0,
        shares: metrics.shares || 0,
        engagement: metrics.engagement || 0,
        lastUpdated: metrics.lastUpdated
      }
    });
  } catch (error: any) {
    console.error('❌ Quora tracking error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
      metrics: {
        upvotes: 0,
        comments: 0,
        views: 0,
        shares: 0,
        engagement: 0,
        lastUpdated: new Date().toISOString()
      }
    });
  }
});

/**
 * POST /quora/verify
 * Verify Quora credentials/cookies
 * 
 * Body:
 * {
 *   email: string,
 *   cookies: Array<Cookie>
 * }
 */
router.post('/verify', async (req: Request, res: Response) => {
  try {
    const { email, cookies } = req.body;

    if (!email || !cookies) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: email and cookies are required'
      });
    }

    console.log('🔍 Verifying Quora config...');
    console.log('  - Email:', email);

    const result = await verifyQuoraConfig({ email, cookies });

    return res.json(result);
  } catch (error: any) {
    console.error('❌ Quora verify error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

export default router;

