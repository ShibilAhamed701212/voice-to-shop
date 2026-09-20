import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

function getDataPath(filename: string): string {
  const candidates = [
    path.join(__dirname, '..', '..', 'data', filename),
    path.join(__dirname, '..', 'data', filename),
    path.resolve(process.cwd(), 'data', filename),
    path.resolve(process.cwd(), 'mock-api', 'data', filename)
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

const router = Router();
const DATA_FILE = getDataPath('customers.json');

function loadCustomers() {
  if (fs.existsSync(DATA_FILE)) {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  }
  return [];
}

// GET /api/customers
router.get('/', (_req: Request, res: Response) => {
  const customers = loadCustomers();
  res.json({ success: true, count: customers.length, customers });
});

// GET /api/customers/:id
router.get('/:id', (req: Request, res: Response) => {
  const customers = loadCustomers();
  const id = req.params.id as string;
  const customer = customers.find((c: any) => c.customer_id.toLowerCase() === id.toLowerCase());
  if (!customer) {
    return res.status(404).json({ success: false, error: 'CUSTOMER_NOT_FOUND' });
  }
  res.json({ success: true, customer });
});

export default router;
