import { Router, Request, Response } from 'express';
import { readSeed } from '../lib/store.js';

const router = Router();

interface Customer {
  customer_id: string;
  name: string;
}

let cache: Customer[] | null = null;
const loadCustomers = () => (cache ??= readSeed<Customer[]>('customers.json'));

// GET /api/customers
router.get('/', (_req: Request, res: Response) => {
  const customers = loadCustomers();
  res.json({ success: true, count: customers.length, customers });
});

// GET /api/customers/:id
router.get('/:id', (req: Request, res: Response) => {
  const id = String(req.params.id).toLowerCase();
  const customer = loadCustomers().find(c => c.customer_id.toLowerCase() === id);
  if (!customer) return res.status(404).json({ success: false, error: 'CUSTOMER_NOT_FOUND' });
  res.json({ success: true, customer });
});

export default router;
