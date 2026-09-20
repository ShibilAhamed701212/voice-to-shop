import { Router, Request, Response } from 'express';
import { BookingService } from '../services/bookingService.js';

const router = Router();

// GET /api/bookings
router.get('/', (req: Request, res: Response) => {
  try {
    const list = BookingService.getAll();
    const customerId = req.query.customer_id as string;
    const filtered = customerId ? list.filter(b => b.customer_id === customerId) : list;
    res.json({
      success: true,
      count: filtered.length,
      bookings: filtered
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/bookings/:id
router.get('/:id', (req: Request, res: Response) => {
  try {
    const booking = BookingService.getById(req.params.id as string);
    if (!booking) {
      return res.status(404).json({ success: false, error: 'BOOKING_NOT_FOUND' });
    }
    res.json({ success: true, booking });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/bookings
router.post('/', (req: Request, res: Response) => {
  try {
    const { customer_id, provider_id, service, problem, date, start_time, end_time, price, customer_name } = req.body;

    if (!customer_id || !provider_id || !date || !start_time) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_REQUIRED_FIELDS',
        message: 'customer_id, provider_id, date, and start_time are required'
      });
    }

    const result = BookingService.create({
      customer_id,
      customer_name,
      provider_id,
      service,
      problem,
      date,
      start_time,
      end_time,
      price
    });

    if (!result.success || !result.booking) {
      const statusCode = result.error === 'SLOT_UNAVAILABLE' ? 409 : 400;
      return res.status(statusCode).json({
        success: false,
        error: result.error
      });
    }

    const b = result.booking;
    res.status(201).json({
      success: true,
      booking_id: b.booking_id,
      status: b.status,
      provider: {
        id: b.provider_id,
        name: b.provider_name
      },
      service: b.service,
      date: b.date,
      time: `${b.start_time}-${b.end_time}`,
      price: b.price
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/bookings/:id
router.patch('/:id', (req: Request, res: Response) => {
  try {
    const updated = BookingService.update(req.params.id as string, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'BOOKING_NOT_FOUND' });
    }
    res.json({ success: true, booking: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/bookings/:id/cancel
router.post('/:id/cancel', (req: Request, res: Response) => {
  try {
    const { reason } = req.body;
    const result = BookingService.cancel(req.params.id as string, reason);
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }
    res.json({
      success: true,
      message: 'Booking successfully cancelled',
      booking: result.booking
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/bookings/:id/reschedule
router.post('/:id/reschedule', (req: Request, res: Response) => {
  try {
    const { date, start_time, end_time } = req.body;
    if (!date || !start_time) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_DATE_OR_TIME',
        message: 'New date and start_time are required to reschedule'
      });
    }

    const result = BookingService.reschedule(req.params.id as string, date, start_time, end_time);
    if (!result.success) {
      const statusCode = result.error === 'NEW_SLOT_UNAVAILABLE' ? 409 : 400;
      return res.status(statusCode).json({
        success: false,
        error: result.error
      });
    }

    res.json({
      success: true,
      message: 'Booking successfully rescheduled',
      booking: result.booking
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
