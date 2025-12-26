import express, { Request, Response } from 'express';
import { publishToMedium, verifyMediumConfig } from '../services/medium';

const router = express.Router();

/**
 * POST /medium/publish
 * Publish content to Medium
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
 *   }
 * }
 */
router.post('/publish', async (req: Request, res: Response) => {
  try {
    const { email, cookies, content } = req.body;

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

    console.log('📝 Publishing to Medium...');
    console.log('  - Email:', email);
    console.log('  - Title:', content.title);

    // Call Medium publish function
    const result = await publishToMedium(
      { email, cookies },
      content
    );

    if (result.success) {
      console.log('✅ Published successfully:', result.url);
      return res.json({
        success: true,
        url: result.url,
        postId: result.postId
      });
    } else {
      console.error('❌ Publish failed:', result.error);
      return res.status(500).json({
        success: false,
        error: result.error || 'Failed to publish to Medium',
        screenshot: result.screenshot
      });
    }
  } catch (error: any) {
    console.error('❌ Medium publish error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

/**
 * POST /medium/verify
 * Verify Medium credentials/cookies
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

    console.log('🔍 Verifying Medium config...');
    console.log('  - Email:', email);

    const result = await verifyMediumConfig({ email, cookies });

    return res.json(result);
  } catch (error: any) {
    console.error('❌ Medium verify error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

export default router;

