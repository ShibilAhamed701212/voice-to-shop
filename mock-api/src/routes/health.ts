import { Router, Request, Response } from 'express';

const router = Router();

router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'PS06 Mock Service API',
    version: '1.0.0'
  });
});

export default router;
