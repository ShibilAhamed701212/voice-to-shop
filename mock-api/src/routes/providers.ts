import { Router, Request, Response } from 'express';
import { ProviderService, ProviderSearchParams } from '../services/providerService.js';
import { AvailabilityService } from '../services/availabilityService.js';

const router = Router();

// GET /api/providers
// Query parameters: service, pincode, date, start_time, end_time
router.get('/', (req: Request, res: Response) => {
  try {
    const filters: ProviderSearchParams = {
      service: req.query.service as string,
      pincode: req.query.pincode as string,
      date: req.query.date as string,
      start_time: req.query.start_time as string,
      end_time: req.query.end_time as string,
      preferred_time: req.query.preferred_time as string
    };

    const providers = ProviderService.getAll(filters);
    res.json({
      success: true,
      count: providers.length,
      providers
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/providers/search
router.post('/search', (req: Request, res: Response) => {
  try {
    const { service, problem, pincode, date, preferred_time } = req.body;
    const providers = ProviderService.search({
      service,
      problem,
      pincode,
      date,
      preferred_time
    });

    res.json({
      success: true,
      count: providers.length,
      providers
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/providers/:id
router.get('/:id', (req: Request, res: Response) => {
  try {
    const provider = ProviderService.getById(req.params.id as string);
    if (!provider) {
      return res.status(404).json({ success: false, error: 'PROVIDER_NOT_FOUND' });
    }
    res.json({ success: true, provider });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/providers/:id/availability
router.get('/:id/availability', (req: Request, res: Response) => {
  try {
    const date = req.query.date as string;
    const slots = AvailabilityService.getProviderSlots(req.params.id as string, date);
    res.json({
      success: true,
      provider_id: req.params.id as string,
      date: date || 'all',
      slots
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST or PATCH /api/providers/:id/availability (to update/lock slots)
const handleUpdateAvailability = (req: Request, res: Response) => {
  try {
    const { date, start_time, available, end_time } = req.body;
    if (!date || !start_time) {
      return res.status(400).json({ success: false, error: 'MISSING_DATE_OR_TIME' });
    }

    const providerId = req.params.id as string;
    if (available === false) {
      const reserved = AvailabilityService.reserveSlot(providerId, date, start_time, end_time);
      if (!reserved) {
        return res.status(409).json({ success: false, error: 'SLOT_UNAVAILABLE' });
      }
    } else {
      AvailabilityService.releaseSlot(providerId, date, start_time);
    }

    const slots = AvailabilityService.getProviderSlots(providerId, date);
    res.json({ success: true, provider_id: providerId, slots });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

router.patch('/:id/availability', handleUpdateAvailability);
router.post('/:id/availability', handleUpdateAvailability);

export default router;
